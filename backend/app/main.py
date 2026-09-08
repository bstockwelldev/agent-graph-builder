from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse

from . import runtime, storage
from .demo_graph import build_demo_graph
from .env_config import load_shared_env
from .events import get_bus
from .graph_templates import create_graph_definition
from .models import CompileResult, CreateGraphRequest, GraphDefinition, NodeTrace, RunRequest, RunSummary

app = FastAPI(title="Agent Graph Builder POC")

_cors_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    """This is the API only -- the UI is the separate Vite frontend. Point
    anyone hitting the bare API port at the interactive docs instead of a
    bare 404."""
    return RedirectResponse(url="/docs")


@app.on_event("startup")
def bootstrap() -> None:
    load_shared_env()
    if storage.get_graph(build_demo_graph().id) is None:
        storage.save_graph(build_demo_graph())


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


@app.post("/api/runs")
async def start_run(request: RunRequest) -> RunSummary:
    graph = storage.get_graph(request.graph_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="graph not found")

    compile_result = runtime.compile_workflow(graph)
    if not compile_result.ok or compile_result.compiled_workflow_id is None:
        raise HTTPException(status_code=422, detail={"message": "graph failed compilation", "diagnostics": [d.model_dump() for d in compile_result.diagnostics]})

    run_id, _bus = runtime.start_run(
        compile_result.compiled_workflow_id,
        request.input,
        provider=request.provider,
    )
    return runtime.RUN_STORE[run_id]


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
    if bus is None:
        raise HTTPException(status_code=404, detail="run not found (or its event stream already closed)")

    async def event_source():
        async for event in bus.stream():
            yield f"data: {json.dumps(event.model_dump())}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")
