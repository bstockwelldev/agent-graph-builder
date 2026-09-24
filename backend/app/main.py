from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field, ValidationError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from . import runtime, storage, subgraphs
from .adapters import get_adapter
from .api_contract import API_VERSION, API_VERSION_HEADER
from .analytics import AnalyticsDashboardPayload, get_analytics_dashboard
from .bindings import resource_usages
from .chat_context import ChatContext, build_chat_system_prompt
from .datasets import DatasetBuildError, build_dataset_from_runs
from .demo_graph import build_demo_graph
from .env_config import (
    load_app_env,
    resolve_azure_api_key,
    resolve_azure_deployment_name,
    resolve_azure_endpoint,
    resolve_google_api_key,
    resolve_groq_api_key,
    telemetry_health,
)
from .events import get_bus
from .graph_templates import create_graph_definition
from .pagination import NEXT_CURSOR_HEADER, Page, field_key, paginate
from .knowledge import (
    KnowledgeUploadError,
    delete_knowledge_document,
    get_knowledge_entry,
    list_knowledge_lineage,
    summarize_entry,
    upload_knowledge_document,
)
from .compiler import validate_graph
from .graph_health import GraphHealth, compute_graph_health
from .impact import NodeImpact, compute_node_impact
from .model_catalog import list_provider_models
from .models import (
    CapabilityMatrix,
    CompileResult,
    CounterfactualResult,
    CreateGraphRequest,
    CreatePolicyExceptionRequest,
    EffectivePolicyRule,
    Fixture,
    GraphDefinition,
    GraphRelease,
    GraphSummary,
    KnowledgeLineageEntry,
    NodeTrace,
    PolicyException,
    PolicyRuleInfo,
    PolicySettings,
    PublishReleaseRequest,
    PublishReleaseResponse,
    PublishResourceVersionResponse,
    ReleaseDiff,
    ReleaseRunRequest,
    ReplayRequest,
    ResourceUsage,
    ResourceVersion,
    RoutingComparison,
    RoutingLabReport,
    RunGraphSnapshot,
    RunRequest,
    RunResumeRequest,
    RunRoutingDatasetRequest,
    RunSummary,
    SimulateResult,
    UpdatePolicyExceptionRequest,
)
from .node_analytics import GraphAnalytics, NodeExecution, get_graph_analytics, get_node_history
from .policies import (
    POLICY_CATALOG,
    WORKSPACE_SCOPE,
    PolicySettingsInvalid,
    create_policy_exception,
    delete_policy_exception,
    effective_policies,
    get_policy_settings,
    graph_scope,
    list_all_policy_exceptions,
    list_graph_policy_exceptions,
    save_policy_settings,
    update_policy_exception,
)
from .provider_credentials import get_provider_credentials
from .providers.base import get_chat_model
from .releases import (
    ReleasePublishBlocked,
    compare_draft_to_release,
    compare_releases,
    resolve_release_selector,
    get_release,
    list_releases,
    publish_release,
)
from .replay import ReplayBlocked, ReplayNotFound, replay_run
from .resource_models import RESOURCE_MODELS, ChatMessage, ChatSession
from .resource_versions import (
    VERSIONABLE_RESOURCE_KINDS,
    ResourceNotFound,
    get_resource_version,
    list_resource_versions,
    publish_resource_version,
)
from .routing_lab import compare_routing_reports, run_routing_dataset
from .simulate import SimulateBlocked, simulate_graph
from .spa_cache import SpaCacheControlMiddleware


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_app_env()
    # A failing store (e.g. a suspended Vercel Blob returning 403) must not
    # abort startup — that turns every request, /api/health included, into
    # FUNCTION_INVOCATION_FAILED instead of a diagnosable error response.
    try:
        if storage.storage_is_healthy() and storage.get_graph(build_demo_graph().id) is None:
            storage.save_graph(build_demo_graph())
    except Exception:
        logger.warning("Demo graph seed skipped: storage backend unavailable", exc_info=True)
    yield


app = FastAPI(title="Agent Graph Builder POC", version=API_VERSION, lifespan=lifespan)


@app.middleware("http")
async def api_version_header(request: Request, call_next):
    """SDK 3/7 (STO-616): every response names the API contract version,
    so clients can warn when the server is ahead of them."""
    response = await call_next(request)
    response.headers[API_VERSION_HEADER] = API_VERSION
    return response


class DurableStorageMiddleware(BaseHTTPMiddleware):
    """Block API routes on Vercel when only ephemeral SQLite would be used."""

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/api/health":
            return await call_next(request)
        if request.url.path.startswith("/api/") and not storage.storage_is_healthy():
            return JSONResponse(status_code=503, content=storage.storage_health())
        return await call_next(request)


_cors_origins = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:5174"
    ).split(",")
    if origin.strip()
]

app.add_middleware(DurableStorageMiddleware)
app.add_middleware(SpaCacheControlMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[API_VERSION_HEADER, NEXT_CURSOR_HEADER],
)


if not os.environ.get("VERCEL"):

    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        """API-only local dev: redirect to OpenAPI docs."""
        return RedirectResponse(url="/docs")


@app.get("/api/health")
def health_check() -> JSONResponse:
    payload = storage.storage_health()
    # Telemetry readiness (studio-consolidation Phase 5) is diagnostic, not
    # load-bearing: a misconfigured TELEMETRY_PROVIDER=langfuse degrades runs
    # to untraced (see telemetry/provider.py's fail-open get_server_telemetry)
    # rather than 503ing the whole API the way storage misconfiguration does,
    # so it's nested here and never flips the top-level `ok`/status code.
    payload["telemetry"] = telemetry_health()
    status_code = 200 if payload["ok"] else 503
    return JSONResponse(status_code=status_code, content=payload)


@app.get("/api/graphs")
def list_graphs(page: Page) -> list[GraphDefinition]:
    """Paged order (with `limit`/`cursor`): by id."""
    # A page reads only its own graphs; the unpaged full list reads every one.
    if not page.requested:
        return storage.list_graphs()
    page_ids = paginate(storage.list_graph_ids(), page, key=lambda graph_id: (graph_id,))
    graphs = [storage.get_graph(graph_id) for graph_id in page_ids]
    return [graph for graph in graphs if graph is not None]


@app.get("/api/graph-summaries")
def list_graph_summaries(page: Page) -> list[GraphSummary]:
    """Every saved graph without its nodes/edges -- for lists and pickers.
    Unpaged order: newest-updated first. Paged order: by id."""
    return paginate(storage.list_graph_summaries(), page, key=field_key("id"))


@app.post("/api/graphs")
def create_graph(request: CreateGraphRequest) -> GraphDefinition:
    name = request.name.strip() or "Untitled graph"
    graph = create_graph_definition(name, request.template)
    graph.updated_at = datetime.now(UTC).isoformat()
    storage.save_graph(graph)
    return graph


@app.get("/api/graphs/{graph_id}")
def get_graph(graph_id: str) -> GraphDefinition:
    graph = storage.get_graph(graph_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return graph


@app.put("/api/graphs/{graph_id}")
def save_graph(graph_id: str, graph: GraphDefinition) -> GraphDefinition:
    if graph.id != graph_id:
        raise HTTPException(status_code=400, detail="graph id mismatch between path and body")
    graph.updated_at = datetime.now(UTC).isoformat()
    storage.save_graph(graph)
    return graph


@app.delete("/api/graphs/{graph_id}")
def delete_graph(graph_id: str) -> dict[str, bool]:
    """Added for studio-consolidation Phase 3 — graphs were previously
    never deletable through this API."""
    if not storage.delete_graph(graph_id):
        raise HTTPException(status_code=404, detail="graph not found")
    return {"deleted": True}


@app.post("/api/graphs/validate")
def validate_graph_endpoint(graph: GraphDefinition) -> CompileResult:
    """Validate a graph payload without saving or registering a compiled workflow."""
    return runtime.validate_only(graph)


@app.post("/api/graphs/{graph_id}/compile")
def compile_graph_endpoint(graph_id: str) -> CompileResult:
    graph = storage.get_graph(graph_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return runtime.compile_workflow(graph)


# ---------------------------------------------------------------------------
# Releases (P0 graph foundation, Slice C — see
# docs/planning/features/p0-graph-foundation-design-plan.md, "Releases and
# fingerprinting"). Publishing snapshots the current draft as an immutable
# `GraphRelease`; editing the draft afterward never changes a published
# release or a run started from it. `/api/graph-releases/{release_id}/...`
# is deliberately release_id-only (no graph_id in the path), so those two
# routes resolve graph_id via `storage.get_release_graph_id` first.
# ---------------------------------------------------------------------------


@app.post("/api/graphs/{graph_id}/releases")
def publish_release_endpoint(
    graph_id: str, request: PublishReleaseRequest
) -> PublishReleaseResponse:
    graph = storage.get_graph(graph_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="graph not found")
    try:
        release, created = publish_release(
            graph, release_notes=request.release_notes, author=request.author
        )
    except ReleasePublishBlocked as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "release blocked by diagnostics",
                "diagnostics": [d.model_dump() for d in exc.diagnostics],
            },
        ) from exc
    return PublishReleaseResponse(release=release, created=created)


@app.get("/api/graphs/{graph_id}/releases")
def list_releases_endpoint(
    graph_id: str, page: Page
) -> list[dict[str, Any]]:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return paginate(list_releases(graph_id), page, key=field_key("created_at", "release_id"))


@app.get("/api/graphs/{graph_id}/releases/{release_id}")
def get_release_endpoint(graph_id: str, release_id: str) -> GraphRelease:
    release = get_release(release_id, graph_id)
    if release is None:
        raise HTTPException(status_code=404, detail="release not found")
    return release


def _require_draft(graph_id: str, draft: GraphDefinition) -> None:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    if draft.id != graph_id:
        raise HTTPException(status_code=422, detail="draft graph id does not match the route")


@app.post("/api/graphs/{graph_id}/health")
def graph_health_endpoint(graph_id: str, draft: GraphDefinition) -> GraphHealth:
    """Wave 7a (STO-610): 0-100 health score with a per-factor breakdown,
    computed against the draft (live canvas, unsaved edits included)."""
    _require_draft(graph_id, draft)
    return compute_graph_health(draft, validate_graph(draft), get_graph_analytics(graph_id))


@app.post("/api/graphs/{graph_id}/nodes/{node_id}/impact")
def node_impact_endpoint(graph_id: str, node_id: str, draft: GraphDefinition) -> NodeImpact:
    """Wave 7a (STO-610): what changing `node_id` reaches -- downstream
    nodes, bindings, runs, releases containing it, datasets stubbing it."""
    _require_draft(graph_id, draft)
    try:
        return compute_node_impact(draft, node_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="node not found in draft") from exc


class ExtractSubgraphRequest(BaseModel):
    draft: GraphDefinition
    node_ids: list[str]
    name: str


class ExtractSubgraphResponse(BaseModel):
    child_graph: GraphDefinition
    proposed_parent: GraphDefinition


class GraphUsage(BaseModel):
    graph_id: str
    name: str
    node_ids: list[str]


@app.post("/api/graphs/{graph_id}/extract-subgraph")
def extract_subgraph_endpoint(
    graph_id: str, body: ExtractSubgraphRequest
) -> ExtractSubgraphResponse:
    """Wave 7c (STO-612): move a connected selection into a new saved graph
    and return the parent as it would look with a subgraph node in its
    place. The parent isn't saved -- Studio applies it as one undoable edit."""
    _require_draft(graph_id, body.draft)
    try:
        child, proposed = subgraphs.extract_subgraph(body.draft, body.node_ids, body.name)
    except subgraphs.ExtractError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    storage.save_graph(child)
    return ExtractSubgraphResponse(child_graph=child, proposed_parent=proposed)


@app.get("/api/graphs/{graph_id}/used-by")
def graph_used_by_endpoint(graph_id: str) -> list[GraphUsage]:
    """Wave 7c: saved graphs whose subgraph nodes reference this graph."""
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return [GraphUsage.model_validate(usage) for usage in subgraphs.used_by(graph_id)]


@app.post("/api/graph-releases/{release_id}/compare-draft")
def compare_draft_to_release_endpoint(release_id: str, draft: GraphDefinition) -> ReleaseDiff:
    """STO-609: diff from a release to a draft graph (typically the live
    canvas, unsaved edits included) of the same graph."""
    graph_id = storage.get_release_graph_id(release_id)
    release = get_release(release_id, graph_id) if graph_id is not None else None
    if release is None:
        raise HTTPException(status_code=404, detail="release not found")
    if draft.id != release.graph_id:
        raise HTTPException(
            status_code=422, detail="draft graph id does not match the release's graph"
        )
    return compare_draft_to_release(release, draft)


@app.get("/api/graph-releases/{release_id}/compare/{other_release_id}")
def compare_releases_endpoint(release_id: str, other_release_id: str) -> ReleaseDiff:
    from_graph_id = storage.get_release_graph_id(release_id)
    from_release = get_release(release_id, from_graph_id) if from_graph_id is not None else None
    if from_release is None:
        raise HTTPException(status_code=404, detail="release not found")

    to_graph_id = storage.get_release_graph_id(other_release_id)
    to_release = get_release(other_release_id, to_graph_id) if to_graph_id is not None else None
    if to_release is None:
        raise HTTPException(status_code=404, detail="other release not found")

    return compare_releases(from_release, to_release)


@app.post("/api/graphs/{graph_id}/simulate")
async def simulate_graph_endpoint(graph_id: str, fixture: Fixture) -> SimulateResult:
    graph = storage.get_graph(graph_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="graph not found")
    try:
        return await simulate_graph(graph, fixture)
    except SimulateBlocked as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "simulation blocked by diagnostics",
                "diagnostics": [d.model_dump() for d in exc.diagnostics],
            },
        ) from exc


@app.post("/api/graph-releases/{release_id}/simulate")
async def simulate_release_endpoint(release_id: str, fixture: Fixture) -> SimulateResult:
    graph_id = storage.get_release_graph_id(release_id)
    release = get_release(release_id, graph_id) if graph_id is not None else None
    if release is None:
        raise HTTPException(status_code=404, detail="release not found")
    try:
        return await simulate_graph(
            release.graph,
            fixture,
            release_resource_snapshots=release.resource_snapshots,
            release_id=release.id,
        )
    except SimulateBlocked as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "simulation blocked by diagnostics",
                "diagnostics": [d.model_dump() for d in exc.diagnostics],
            },
        ) from exc


@app.post("/api/graphs/{graph_id}/routing-lab/run")
async def run_routing_dataset_endpoint(
    graph_id: str, request: RunRoutingDatasetRequest
) -> RoutingLabReport:
    graph = storage.get_graph(graph_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="graph not found")
    try:
        return await run_routing_dataset(graph, request.dataset)
    except SimulateBlocked as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "routing dataset run blocked by diagnostics",
                "diagnostics": [d.model_dump() for d in exc.diagnostics],
            },
        ) from exc


@app.post("/api/graphs/{graph_id}/routing-lab/compare/{other_graph_id}")
async def compare_routing_datasets_endpoint(
    graph_id: str, other_graph_id: str, request: RunRoutingDatasetRequest
) -> RoutingComparison:
    graph = storage.get_graph(graph_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="graph not found")
    other_graph = storage.get_graph(other_graph_id)
    if other_graph is None:
        raise HTTPException(status_code=404, detail="other graph not found")
    try:
        baseline = await run_routing_dataset(graph, request.dataset)
        candidate = await run_routing_dataset(other_graph, request.dataset)
    except SimulateBlocked as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "routing dataset run blocked by diagnostics",
                "diagnostics": [d.model_dump() for d in exc.diagnostics],
            },
        ) from exc
    return compare_routing_reports(baseline, candidate)


@app.post("/api/graphs/{graph_id}/routing-lab/compare-release/{release_id}")
async def compare_routing_to_release_endpoint(
    graph_id: str, release_id: str, request: RunRoutingDatasetRequest
) -> RoutingComparison:
    """STO-609: the dataset against a published release (baseline, run with
    its frozen resource snapshots) and the saved draft (candidate).
    `release_id` may be `latest`."""
    graph = storage.get_graph(graph_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="graph not found")
    release = resolve_release_selector(graph_id, release_id)
    if release is None:
        raise HTTPException(status_code=404, detail="release not found")
    try:
        baseline = await run_routing_dataset(
            release.graph,
            request.dataset,
            release_resource_snapshots=release.resource_snapshots,
            release_id=release.id,
        )
        candidate = await run_routing_dataset(graph, request.dataset)
    except SimulateBlocked as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "routing dataset run blocked by diagnostics",
                "diagnostics": [d.model_dump() for d in exc.diagnostics],
            },
        ) from exc
    return compare_routing_reports(baseline, candidate)


@app.post("/api/graphs/{graph_id}/policy-exceptions")
def create_policy_exception_endpoint(
    graph_id: str, request: CreatePolicyExceptionRequest
) -> PolicyException:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return create_policy_exception(
        graph_id,
        policy_code=request.policy_code,
        node_id=request.node_id,
        reason=request.reason,
        expires_at=request.expires_at,
    )


@app.get("/api/graphs/{graph_id}/policy-exceptions")
def list_policy_exceptions_endpoint(
    graph_id: str, page: Page
) -> list[PolicyException]:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return paginate(
        list_graph_policy_exceptions(graph_id), page, key=field_key("created_at", "id")
    )


@app.patch("/api/graphs/{graph_id}/policy-exceptions/{exception_id}")
def update_policy_exception_endpoint(
    graph_id: str, exception_id: str, request: UpdatePolicyExceptionRequest
) -> PolicyException:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    updated = update_policy_exception(
        graph_id, exception_id, expires_at=request.expires_at, reason=request.reason
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="policy exception not found")
    return updated


@app.get("/api/policy-exceptions")
def list_all_policy_exceptions_endpoint(
    page: Page,
) -> list[PolicyException]:
    return paginate(list_all_policy_exceptions(), page, key=field_key("created_at", "id"))


# Configurable policies (STO-608): the rule catalog, workspace defaults, and
# per-graph overrides. See policies.py.
@app.get("/api/policies/catalog")
def policy_catalog_endpoint() -> list[PolicyRuleInfo]:
    return list(POLICY_CATALOG)


@app.get("/api/policies/workspace")
def get_workspace_policies_endpoint() -> PolicySettings:
    return get_policy_settings(WORKSPACE_SCOPE)


@app.put("/api/policies/workspace")
def put_workspace_policies_endpoint(settings: PolicySettings) -> PolicySettings:
    try:
        return save_policy_settings(WORKSPACE_SCOPE, settings)
    except PolicySettingsInvalid as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/policies/effective")
def get_workspace_effective_policies_endpoint() -> list[EffectivePolicyRule]:
    return list(effective_policies(None).values())


@app.get("/api/graphs/{graph_id}/policies")
def get_graph_policies_endpoint(graph_id: str) -> PolicySettings:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return get_policy_settings(graph_scope(graph_id))


@app.put("/api/graphs/{graph_id}/policies")
def put_graph_policies_endpoint(graph_id: str, settings: PolicySettings) -> PolicySettings:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    try:
        return save_policy_settings(graph_scope(graph_id), settings)
    except PolicySettingsInvalid as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/graphs/{graph_id}/policies/effective")
def get_graph_effective_policies_endpoint(graph_id: str) -> list[EffectivePolicyRule]:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return list(effective_policies(graph_id).values())


@app.delete("/api/graphs/{graph_id}/policy-exceptions/{exception_id}")
def delete_policy_exception_endpoint(graph_id: str, exception_id: str) -> dict[str, bool]:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    if not delete_policy_exception(graph_id, exception_id):
        raise HTTPException(status_code=404, detail="policy exception not found")
    return {"deleted": True}


@app.post("/api/graph-releases/{release_id}/compile")
def compile_release_endpoint(release_id: str) -> CompileResult:
    graph_id = storage.get_release_graph_id(release_id)
    release = get_release(release_id, graph_id) if graph_id is not None else None
    if release is None:
        raise HTTPException(status_code=404, detail="release not found")
    return runtime.compile_workflow(release.graph)


@app.post("/api/graph-releases/{release_id}/runs")
async def start_release_run(release_id: str, request: ReleaseRunRequest) -> RunSummary:
    graph_id = storage.get_release_graph_id(release_id)
    release = get_release(release_id, graph_id) if graph_id is not None else None
    if release is None:
        raise HTTPException(status_code=404, detail="release not found")

    compile_result = runtime.compile_workflow(release.graph)
    if not compile_result.ok or compile_result.compiled_workflow_id is None:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "release failed compilation",
                "diagnostics": [d.model_dump() for d in compile_result.diagnostics],
            },
        )

    start_kwargs = {
        "compiled_workflow_id": compile_result.compiled_workflow_id,
        "run_input": request.input,
        "provider": request.provider,
        "model": request.model,
        "api_key": request.api_key,
        "release_resource_snapshots": release.resource_snapshots,
        "release_id": release.id,
    }
    if runtime.is_serverless_runtime():
        run_id, _bus = await runtime.start_run_inline(**start_kwargs)
    else:
        run_id, _bus = runtime.start_run(**start_kwargs)
    summary = runtime.get_run_summary(run_id)
    if summary is None:
        raise HTTPException(status_code=500, detail="run vanished after start")
    return summary


@app.get("/api/runtime-targets/{target_id}/capabilities")
def runtime_target_capabilities(target_id: str) -> CapabilityMatrix:
    adapter = get_adapter(target_id)
    if adapter is None:
        raise HTTPException(status_code=404, detail=f"unknown runtime target {target_id!r}")
    return adapter.capabilities()


# ---------------------------------------------------------------------------
# Knowledge base / RAG (studio-consolidation Phase 5, see
# docs/planning/features/studio-consolidation-plan.md and knowledge.py):
# upload .txt/.md documents per graph, chunked + embedded on upload.
# `compute_llm` (nodes.py) augments its system prompt automatically for any
# graph with an uploaded knowledge base — there is no per-node opt-in, so
# these routes are graph-scoped, not node-scoped.
# ---------------------------------------------------------------------------


@app.get("/api/graphs/{graph_id}/knowledge")
def get_graph_knowledge(graph_id: str) -> dict[str, Any]:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return {"graphId": graph_id, **summarize_entry(get_knowledge_entry(graph_id))}


@app.post("/api/graphs/{graph_id}/knowledge")
async def upload_graph_knowledge(
    graph_id: str,
    file: UploadFile = File(...),  # noqa: B008 - FastAPI's own dependency idiom
) -> dict[str, Any]:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    content = await file.read()
    try:
        return await upload_knowledge_document(
            graph_id, file.filename or "upload.txt", file.content_type or "", content
        )
    except KnowledgeUploadError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.delete("/api/graphs/{graph_id}/knowledge/{document_id}")
def delete_graph_knowledge_document(graph_id: str, document_id: str) -> dict[str, Any]:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    result = delete_knowledge_document(graph_id, document_id)
    if result is None:
        raise HTTPException(status_code=404, detail="document not found")
    return result


# P2, "Retrieval/document lineage graph" (docs/planning/roadmap.md's
# Strategic Roadmap Addendum): every recorded retrieval for this graph's
# knowledge base, optionally filtered to one document — "which runs/nodes
# actually used this document." See knowledge.py's `augment_system_with_
# knowledge`, which records these at retrieval time.
@app.get("/api/graphs/{graph_id}/knowledge/lineage")
def get_graph_knowledge_lineage(
    graph_id: str, page: Page, document_id: str | None = None
) -> list[KnowledgeLineageEntry]:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return paginate(
        list_knowledge_lineage(graph_id, document_id), page, key=field_key("created_at", "id")
    )


# ---------------------------------------------------------------------------
# Resource CRUD (studio-consolidation Phase 3, see
# docs/planning/features/studio-consolidation-plan.md and
# resource_models.py): prompts, tools, mcp_servers, agents, llm_profiles.
# One generic registration loop rather than five hand-written copies of the
# same list/get/create/update/delete shape — request/response bodies are
# typed `dict` in the route signatures (validated against the resource's
# actual Pydantic model inside the function body) specifically so this
# works under `from __future__ import annotations`: FastAPI resolves
# string annotations via the module's globals, which a closure-local
# `model` variable is not part of.
# ---------------------------------------------------------------------------

_RESOURCE_ROUTE_PATHS: dict[str, str] = {
    "prompts": "prompts",
    "tools": "tools",
    "mcp_servers": "mcp-servers",
    "agents": "agents",
    "llm_profiles": "llm-profiles",
    "chat_sessions": "chat-sessions",
    "datasets": "datasets",
}


def _register_resource_routes(kind: str, path: str, model: type[BaseModel]) -> None:
    def _validate(body: dict[str, Any]) -> BaseModel:
        try:
            return model.model_validate(body)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors()) from exc

    @app.get(f"/api/{path}", name=f"list_{kind}", operation_id=f"list_{kind}")
    def list_resources_route(page: Page) -> list[dict[str, Any]]:
        return paginate(storage.list_resources(kind), page, key=field_key("id"))

    @app.get(f"/api/{path}/{{resource_id}}", name=f"get_{kind}", operation_id=f"get_{kind}")
    def get_resource_route(resource_id: str) -> dict[str, Any]:
        payload = storage.get_resource(kind, resource_id)
        if payload is None:
            raise HTTPException(status_code=404, detail=f"{kind} {resource_id!r} not found")
        return payload

    @app.post(f"/api/{path}", name=f"create_{kind}", operation_id=f"create_{kind}")
    def create_resource_route(body: dict[str, Any]) -> dict[str, Any]:
        validated = _validate(body)
        payload = validated.model_dump(mode="json")
        storage.save_resource(kind, payload["id"], payload)
        return payload

    @app.put(f"/api/{path}/{{resource_id}}", name=f"update_{kind}", operation_id=f"update_{kind}")
    def update_resource_route(resource_id: str, body: dict[str, Any]) -> dict[str, Any]:
        validated = _validate(body)
        payload = validated.model_dump(mode="json")
        if payload["id"] != resource_id:
            raise HTTPException(status_code=400, detail=f"{kind} id mismatch between path and body")
        storage.save_resource(kind, resource_id, payload)
        return payload

    @app.get(
        f"/api/{path}/{{resource_id}}/usages",
        name=f"usages_{kind}",
        operation_id=f"usages_{kind}",
    )
    def resource_usages_route(resource_id: str) -> list[ResourceUsage]:
        # Wave 4a "used by": every draft graph node bound to this resource
        # (bindings.py). Not 404 for an unknown id -- a deleted resource can
        # still have dangling references worth listing.
        tools = (
            {tool["id"]: tool for tool in storage.list_resources("tools")}
            if kind == "mcp_servers"
            else None
        )
        return [
            ResourceUsage.model_validate(usage)
            for usage in resource_usages(storage.list_graph_catalog(), kind, resource_id, tools)
        ]

    @app.delete(
        f"/api/{path}/{{resource_id}}", name=f"delete_{kind}", operation_id=f"delete_{kind}"
    )
    def delete_resource_route(resource_id: str) -> dict[str, bool]:
        if not storage.delete_resource(kind, resource_id):
            raise HTTPException(status_code=404, detail=f"{kind} {resource_id!r} not found")
        return {"deleted": True}


for _kind, _path in _RESOURCE_ROUTE_PATHS.items():
    _register_resource_routes(_kind, _path, RESOURCE_MODELS[_kind])


class CreateDatasetFromRunsRequest(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    run_ids: list[str] = Field(min_length=1)
    # Freeze each run's recorded node outputs into its fixture (routers then
    # see the real upstream classifications). False captures inputs only.
    include_node_outputs: bool = True


# Follow-on to the Routing Lab: "historical runs should become engineering
# datasets" (graph-native-control-plane-plan.md). A distinct path from the
# generic `POST /api/datasets` create above, so neither shadows the other.
@app.post("/api/datasets/from-runs", name="create_dataset_from_runs")
def create_dataset_from_runs_route(body: CreateDatasetFromRunsRequest) -> dict[str, Any]:
    try:
        dataset = build_dataset_from_runs(
            name=body.name,
            description=body.description,
            run_ids=body.run_ids,
            include_node_outputs=body.include_node_outputs,
        )
    except DatasetBuildError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return dataset.model_dump(mode="json")


# P1 rollout plan, parallel track ("Versioned reusable entity registry") —
# generic version routes for every kind in resource_versions.py's
# VERSIONABLE_RESOURCE_KINDS. chat_sessions (a runtime scratchpad, not a
# reusable authored asset) never gets these routes.
def _register_resource_version_routes(kind: str, path: str) -> None:
    @app.post(
        f"/api/{path}/{{resource_id}}/versions",
        name=f"publish_{kind}_version",
        operation_id=f"publish_{kind}_version",
    )
    def publish_version_route(resource_id: str) -> PublishResourceVersionResponse:
        try:
            return publish_resource_version(kind, resource_id)
        except ResourceNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get(
        f"/api/{path}/{{resource_id}}/versions",
        name=f"list_{kind}_versions",
        operation_id=f"list_{kind}_versions",
    )
    def list_versions_route(
        resource_id: str, page: Page
    ) -> list[dict[str, Any]]:
        return paginate(
            list_resource_versions(kind, resource_id),
            page,
            key=field_key("created_at", "version_id"),
        )

    @app.get(
        f"/api/{path}/{{resource_id}}/versions/{{version_id}}",
        name=f"get_{kind}_version",
        operation_id=f"get_{kind}_version",
    )
    def get_version_route(resource_id: str, version_id: str) -> ResourceVersion:
        version = get_resource_version(kind, resource_id, version_id)
        if version is None or version.resource_id != resource_id:
            raise HTTPException(status_code=404, detail="resource version not found")
        return version


for _kind in VERSIONABLE_RESOURCE_KINDS:
    _register_resource_version_routes(_kind, _RESOURCE_ROUTE_PATHS[_kind])


class ChatSessionMessageRequest(BaseModel):
    content: str
    # Chat context binding (studio-ux-gap-remediation-plan.md §3, STO-596):
    # optional, so an old client (or a request with nothing selected) still
    # gets exactly the pre-existing behavior.
    context: ChatContext | None = None


@app.post(
    "/api/chat-sessions/{session_id}/messages",
    name="send_chat_session_message",
    operation_id="send_chat_session_message",
)
async def send_chat_session_message_route(
    session_id: str, body: ChatSessionMessageRequest
) -> dict[str, Any]:
    """Not a CRUD operation, so it lives outside `_register_resource_routes`:
    a direct model scratchpad (studio-consolidation Phase 8) -- bypasses the
    graph engine entirely, no compile step, no relation to any graph_id."""
    payload = storage.get_resource("chat_sessions", session_id)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"chat session {session_id!r} not found")
    session = ChatSession.model_validate(payload)

    history = [{"role": m.role, "content": m.content} for m in session.messages]
    session.messages.append(ChatMessage(role="user", content=body.content))

    system_prompt = build_chat_system_prompt(body.context) if body.context is not None else None
    chat_model = get_chat_model(model=session.model, provider=session.provider)
    reply = await chat_model.generate(
        system_prompt=system_prompt, user_prompt=body.content, history=history
    )
    session.messages.append(ChatMessage(role="assistant", content=reply))
    session.updated_at = datetime.now(UTC)

    updated_payload = session.model_dump(mode="json")
    storage.save_resource("chat_sessions", session_id, updated_payload)
    return updated_payload


@app.get("/api/graphs/{graph_id}/runs")
def list_graph_runs(graph_id: str, page: Page) -> list[RunSummary]:
    """Unpaged: the 50 newest. Paged: every run, newest first."""
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    if not page.requested:
        return storage.list_runs_for_graph(graph_id)
    runs = storage.list_runs_for_graph(graph_id, limit=None)
    return paginate(runs, page, key=field_key("started_at", "run_id"), descending=True)


@app.get("/api/runs")
def list_all_runs(page: Page) -> list[RunSummary]:
    """Cross-graph run history (studio-consolidation Phase 5) — flagged as
    a gap in Phase 4c's as-built notes ("/runs in the studio becomes
    'pick a graph -> see its runs', not a single global run feed... a true
    cross-graph GET /api/runs endpoint is a candidate Phase 5+ backend
    addition"). Backs the analytics dashboard below; the studio UI itself
    still uses the per-graph route for its Runs screen. Unpaged: the 200
    newest. Paged (SDK 4/7): every run, newest first.
    """
    if not page.requested:
        return storage.list_all_runs()
    runs = storage.list_all_runs(limit=None)
    return paginate(runs, page, key=field_key("started_at", "run_id"), descending=True)


@app.get("/api/analytics")
def get_analytics() -> AnalyticsDashboardPayload:
    return get_analytics_dashboard()


@app.get("/api/graphs/{graph_id}/analytics")
def get_graph_analytics_route(graph_id: str, window: int = 50) -> GraphAnalytics:
    """Graph-scoped rollup with per-node metrics (studio-graph-workbench-
    redesign-plan.md, Wave 2) -- backs the analytics panel's graph scope
    and the node inspector's History tab."""
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return get_graph_analytics(graph_id, run_window=max(1, min(window, 200)))


@app.get("/api/graphs/{graph_id}/nodes/{node_id}/history")
def get_node_history_route(graph_id: str, node_id: str, limit: int = 20) -> list[NodeExecution]:
    """One node's most recent executions, newest first (Wave 2)."""
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return get_node_history(graph_id, node_id, limit=max(1, min(limit, 100)))


@app.get("/api/providers/{provider}/ready")
def provider_ready(provider: str) -> dict[str, bool | str]:
    if provider == "groq":
        ready = bool(resolve_groq_api_key())
        return {
            "ready": ready,
            "message": ""
            if ready
            else "Missing GROQ_API_KEY. Set it in the backend environment or SHARED_ENV_FILE.",
        }
    if provider == "google":
        ready = bool(resolve_google_api_key())
        return {
            "ready": ready,
            "message": "" if ready else "Missing GOOGLE_GENAI_API_KEY or GOOGLE_API_KEY.",
        }
    if provider == "azure":
        ready = bool(
            resolve_azure_api_key() and resolve_azure_endpoint() and resolve_azure_deployment_name()
        )
        return {
            "ready": ready,
            "message": ""
            if ready
            else (
                "Missing AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, "
                "or AZURE_OPENAI_DEPLOYMENT_NAME."
            ),
        }
    return {"ready": True, "message": ""}


@app.get("/api/providers/{provider}/credentials")
def provider_credentials(provider: str) -> dict[str, str | bool]:
    return get_provider_credentials(provider)


@app.get("/api/providers/{provider}/models")
async def provider_models(provider: str, graph_id: str | None = None) -> dict:
    return await list_provider_models(provider, graph_id)


@app.post("/api/runs")
async def start_run(request: RunRequest) -> RunSummary:
    graph = storage.get_graph(request.graph_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="graph not found")

    compile_result = runtime.compile_workflow(graph)
    if not compile_result.ok or compile_result.compiled_workflow_id is None:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "graph failed compilation",
                "diagnostics": [d.model_dump() for d in compile_result.diagnostics],
            },
        )

    start_kwargs = {
        "compiled_workflow_id": compile_result.compiled_workflow_id,
        "run_input": request.input,
        "provider": request.provider,
        "model": request.model,
        "api_key": request.api_key,
        "fixture_node_outputs": request.node_outputs or None,
    }
    if runtime.is_serverless_runtime():
        run_id, _bus = await runtime.start_run_inline(**start_kwargs)
    else:
        run_id, _bus = runtime.start_run(**start_kwargs)
    summary = runtime.get_run_summary(run_id)
    if summary is None:
        raise HTTPException(status_code=500, detail="run vanished after start")
    return summary


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> RunSummary:
    summary = runtime.get_run_summary(run_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="run not found")
    return summary


@app.get("/api/runs/{run_id}/snapshot")
def get_run_graph_snapshot(run_id: str) -> RunGraphSnapshot:
    """P0 graph foundation, Slice D: the run's durable RunGraphSnapshot —
    the exact graph (and, for a draft-sourced run, resolved resource
    bindings) it started from, independent of any later draft edits.
    Historical run inspection opens this, not the current (possibly
    changed) `GET /api/graphs/{id}`."""
    payload = storage.get_run_graph_snapshot(run_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="run graph snapshot not found")
    return RunGraphSnapshot.model_validate(payload)


@app.post("/api/runs/{run_id}/replay")
async def replay_run_endpoint(
    run_id: str, request: ReplayRequest | None = None
) -> CounterfactualResult:
    """P1 rollout plan, Slice C ("Historical replay") — re-executes
    `run_id`'s exact original graph read-only, with every non-routing
    node's original output frozen. No live tool/LLM calls. An optional
    `ReplayRequest` body makes it a counterfactual replay (STO-609)."""
    try:
        return await replay_run(run_id, request)
    except ReplayNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ReplayBlocked as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "replay blocked by diagnostics",
                "diagnostics": [d.model_dump() for d in exc.diagnostics],
            },
        ) from exc


@app.post("/api/runs/{run_id}/resume")
async def resume_run(run_id: str, request: RunResumeRequest) -> RunSummary:
    """Resolves a `human_gate` checkpoint (studio-consolidation Phase 2).

    approve=True (default) continues execution from the paused node;
    approve=False fails the run instead. 404 when there is nothing paused
    for this run_id (already resolved, unknown run, or — same accepted
    simplification as compiled-workflow lookup elsewhere in this API — the
    compiled workflow was lost to a process restart).
    """
    if runtime.get_run_pause_state(run_id) is None:
        raise HTTPException(
            status_code=404, detail="run has no pending human_gate checkpoint to resume"
        )

    if not request.approve:
        runtime.reject_run(run_id, reason=request.reason)
    elif runtime.is_serverless_runtime():
        if await runtime.resume_run_inline(run_id) is None:
            raise HTTPException(
                status_code=409,
                detail="run's compiled workflow is no longer available; cannot resume",
            )
    else:
        if runtime.resume_run(run_id) is None:
            raise HTTPException(
                status_code=409,
                detail="run's compiled workflow is no longer available; cannot resume",
            )

    summary = runtime.get_run_summary(run_id)
    if summary is None:
        raise HTTPException(status_code=500, detail="run vanished after resume")
    return summary


@app.get("/api/runs/{run_id}/nodes")
def get_run_node_traces(run_id: str) -> list[NodeTrace]:
    if runtime.get_run_summary(run_id) is None:
        raise HTTPException(status_code=404, detail="run not found")
    return runtime.get_run_node_traces(run_id)


@app.get("/api/runs/{run_id}/events")
async def stream_run_events(
    run_id: str,
    after: int | None = None,
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
) -> StreamingResponse:
    """SSE stream of a run's events. SDK 2/7 (STO-615): every event carries
    `id: <sequence>`, and a reconnect with `Last-Event-ID` (or `?after=`)
    resumes after it. With no live bus on this isolate, a finished run's
    persisted events are replayed and the stream closes."""
    bus = get_bus(run_id)
    try:
        resume_after = int(last_event_id) if last_event_id else (after or 0)
    except ValueError:
        resume_after = after or 0

    def frame(event) -> str:
        return f"id: {event.sequence}\ndata: {json.dumps(event.model_dump())}\n\n"

    async def event_source():
        yield "retry: 1000\n\n"
        if bus is None:
            # Serverless: the live bus lives only on the isolate that ran
            # POST /api/runs. Replay what was persisted, then close so the
            # client polls GET /api/runs/{id} instead of hanging.
            summary = runtime.get_run_summary(run_id)
            for event in summary.events if summary else []:
                if event.sequence > resume_after:
                    yield frame(event)
            if summary is None or not summary.events:
                yield ": no live bus\n\n"
            return
        async for event in bus.stream(after=resume_after):
            yield frame(event)

    return StreamingResponse(event_source(), media_type="text/event-stream")


if os.environ.get("VERCEL"):
    from pathlib import Path

    _playground_dist = (
        Path(__file__).resolve().parent.parent.parent / "apps" / "playground" / "dist"
    )
    if _playground_dist.is_dir():
        app.frontend("/", directory=str(_playground_dist))
