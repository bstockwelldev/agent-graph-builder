from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import runtime, storage
from .demo_graph import build_demo_graph
from .events import get_bus
from .models import CompileResult, GraphDefinition, NodeTrace, RunRequest, RunSummary

app = FastAPI(title="Agent Graph Builder POC")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def seed_demo_graph() -> None:
    if storage.get_graph(build_demo_graph().id) is None:
        storage.save_graph(build_demo_graph())


@app.get("/api/graphs")
def list_graphs() -> list[GraphDefinition]:
    return storage.list_graphs()


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


@app.post("/api/graphs/{graph_id}/compile")
def compile_graph_endpoint(graph_id: str) -> CompileResult:
    graph = storage.get_graph(graph_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="graph not found")
    return runtime.compile_workflow(graph)


@app.post("/api/runs")
async def start_run(request: RunRequest) -> RunSummary:
    graph = storage.get_graph(request.graph_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="graph not found")

    compile_result = runtime.compile_workflow(graph)
    if not compile_result.ok or compile_result.compiled_workflow_id is None:
        raise HTTPException(status_code=422, detail={"message": "graph failed compilation", "diagnostics": [d.model_dump() for d in compile_result.diagnostics]})

    run_id, _bus = runtime.start_run(compile_result.compiled_workflow_id, request.input)
    return runtime.RUN_STORE[run_id]


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> RunSummary:
    summary = runtime.RUN_STORE.get(run_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="run not found")
    return summary


@app.get("/api/runs/{run_id}/nodes")
def get_run_node_traces(run_id: str) -> list[NodeTrace]:
    if run_id not in runtime.RUN_TRACES:
        raise HTTPException(status_code=404, detail="run not found")
    return list(runtime.RUN_TRACES[run_id].values())


@app.get("/api/runs/{run_id}/events")
async def stream_run_events(run_id: str) -> StreamingResponse:
    bus = get_bus(run_id)
    if bus is None:
        raise HTTPException(status_code=404, detail="run not found (or its event stream already closed)")

    async def event_source():
        async for event in bus.stream():
            yield f"data: {json.dumps(event.model_dump())}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")
