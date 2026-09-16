from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel, ValidationError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from . import runtime, storage
from .analytics import AnalyticsDashboardPayload, get_analytics_dashboard
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
from .knowledge import (
    KnowledgeUploadError,
    delete_knowledge_document,
    get_knowledge_entry,
    summarize_entry,
    upload_knowledge_document,
)
from .model_catalog import list_provider_models
from .models import (
    CompileResult,
    CreateGraphRequest,
    GraphDefinition,
    NodeTrace,
    RunRequest,
    RunResumeRequest,
    RunSummary,
)
from .provider_credentials import get_provider_credentials
from .resource_models import RESOURCE_MODELS
from .spa_cache import SpaCacheControlMiddleware


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_app_env()
    if storage.storage_is_healthy() and storage.get_graph(build_demo_graph().id) is None:
        storage.save_graph(build_demo_graph())
    yield


app = FastAPI(title="Agent Graph Builder POC", lifespan=lifespan)


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
def list_graphs() -> list[GraphDefinition]:
    return storage.list_graphs()


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
    graph_id: str, file: UploadFile = File(...)  # noqa: B008 - FastAPI's own dependency idiom
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
}


def _register_resource_routes(kind: str, path: str, model: type[BaseModel]) -> None:
    def _validate(body: dict[str, Any]) -> BaseModel:
        try:
            return model.model_validate(body)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors()) from exc

    @app.get(f"/api/{path}", name=f"list_{kind}", operation_id=f"list_{kind}")
    def list_resources_route() -> list[dict[str, Any]]:
        return storage.list_resources(kind)

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

    @app.delete(
        f"/api/{path}/{{resource_id}}", name=f"delete_{kind}", operation_id=f"delete_{kind}"
    )
    def delete_resource_route(resource_id: str) -> dict[str, bool]:
        if not storage.delete_resource(kind, resource_id):
            raise HTTPException(status_code=404, detail=f"{kind} {resource_id!r} not found")
        return {"deleted": True}


for _kind, _path in _RESOURCE_ROUTE_PATHS.items():
    _register_resource_routes(_kind, _path, RESOURCE_MODELS[_kind])


@app.get("/api/graphs/{graph_id}/runs")
def list_graph_runs(graph_id: str) -> list[RunSummary]:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return storage.list_runs_for_graph(graph_id)


@app.get("/api/runs")
def list_all_runs() -> list[RunSummary]:
    """Cross-graph run history (studio-consolidation Phase 5) — flagged as
    a gap in Phase 4c's as-built notes ("/runs in the studio becomes
    'pick a graph -> see its runs', not a single global run feed... a true
    cross-graph GET /api/runs endpoint is a candidate Phase 5+ backend
    addition"). Backs the analytics dashboard below; the studio UI itself
    still uses the per-graph route for its Runs screen.
    """
    return storage.list_all_runs()


@app.get("/api/analytics")
def get_analytics() -> AnalyticsDashboardPayload:
    return get_analytics_dashboard()


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
async def stream_run_events(run_id: str) -> StreamingResponse:
    bus = get_bus(run_id)

    async def event_source():
        if bus is None:
            # Serverless: live bus lives only on the isolate that ran POST /api/runs.
            # Close immediately so the client can poll GET /api/runs/{id} instead of 404 limbo.
            yield ": no live bus\n\n"
            return
        async for event in bus.stream():
            yield f"data: {json.dumps(event.model_dump())}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")


if os.environ.get("VERCEL"):
    from pathlib import Path

    _playground_dist = (
        Path(__file__).resolve().parent.parent.parent / "apps" / "playground" / "dist"
    )
    if _playground_dist.is_dir():
        app.frontend("/", directory=str(_playground_dist))
