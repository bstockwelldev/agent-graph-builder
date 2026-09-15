from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from . import runtime, storage
from .demo_graph import build_demo_graph
from .env_config import (
    load_app_env,
    resolve_azure_api_key,
    resolve_azure_deployment_name,
    resolve_azure_endpoint,
    resolve_google_api_key,
    resolve_groq_api_key,
)
from .events import get_bus
from .graph_templates import create_graph_definition
from .models import CompileResult, CreateGraphRequest, GraphDefinition, NodeTrace, RunRequest, RunSummary
from .model_catalog import list_provider_models
from .provider_credentials import get_provider_credentials
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
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174").split(",")
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
    status_code = 200 if payload["ok"] else 503
    return JSONResponse(status_code=status_code, content=payload)


@app.get("/api/graphs")
def list_graphs() -> list[GraphDefinition]:
    return storage.list_graphs()


@app.post("/api/graphs")
def create_graph(request: CreateGraphRequest) -> GraphDefinition:
    name = request.name.strip() or "Untitled graph"
    graph = create_graph_definition(name, request.template)
    graph.updated_at = datetime.now(timezone.utc).isoformat()
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
    graph.updated_at = datetime.now(timezone.utc).isoformat()
    storage.save_graph(graph)
    return graph


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


@app.get("/api/graphs/{graph_id}/runs")
def list_graph_runs(graph_id: str) -> list[RunSummary]:
    if storage.get_graph(graph_id) is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return storage.list_runs_for_graph(graph_id)


@app.get("/api/providers/{provider}/ready")
def provider_ready(provider: str) -> dict[str, bool | str]:
    if provider == "groq":
        ready = bool(resolve_groq_api_key())
        return {
            "ready": ready,
            "message": "" if ready else "Missing GROQ_API_KEY. Set it in the backend environment or SHARED_ENV_FILE.",
        }
    if provider == "google":
        ready = bool(resolve_google_api_key())
        return {
            "ready": ready,
            "message": "" if ready else "Missing GOOGLE_GENAI_API_KEY or GOOGLE_API_KEY.",
        }
    if provider == "azure":
        ready = bool(resolve_azure_api_key() and resolve_azure_endpoint() and resolve_azure_deployment_name())
        return {
            "ready": ready,
            "message": ""
            if ready
            else "Missing AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, or AZURE_OPENAI_DEPLOYMENT_NAME.",
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
        raise HTTPException(status_code=422, detail={"message": "graph failed compilation", "diagnostics": [d.model_dump() for d in compile_result.diagnostics]})

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

    _playground_dist = Path(__file__).resolve().parent.parent.parent / "apps" / "playground" / "dist"
    if _playground_dist.is_dir():
        app.frontend("/", directory=str(_playground_dist))
