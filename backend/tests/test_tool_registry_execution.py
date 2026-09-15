"""Studio-consolidation Phase 3: `tool` node resolution against builtins,
the stored tool registry, and MCP dispatch; compiler.py's relaxed
UNSUPPORTED_TOOL_BINDING check.

See docs/planning/features/studio-consolidation-plan.md.
"""

from __future__ import annotations

import httpx
import pytest

from app import storage
from app.compiler import compile_graph, validate_graph
from app.demo_graph import build_demo_graph
from app.models import GraphEdge, GraphNode, NodePosition, NodeType
from app.runtime import COMPILED_WORKFLOWS, get_run_node_traces, get_run_summary, start_run_inline


def _graph_with_tool_node(tool_node: GraphNode, graph_id: str) -> object:
    demo = build_demo_graph()
    edges = [e for e in demo.edges if e.id != "e_llmanswer_output"]
    edges.append(GraphEdge(id="e_llmanswer_tool", source="llm_answer", target=tool_node.id))
    edges.append(GraphEdge(id=f"e_{tool_node.id}_output", source=tool_node.id, target="output_1"))
    return demo.model_copy(update={"id": graph_id, "nodes": [*demo.nodes, tool_node], "edges": edges})


def test_unsupported_tool_binding_still_blocks_compile() -> None:
    node = GraphNode(id="tool_bad", type=NodeType.TOOL, position=NodePosition(x=0, y=0), config={"toolName": "not_a_real_tool"})
    graph = _graph_with_tool_node(node, "graph_bad_tool")
    diagnostics = validate_graph(graph)
    assert any(d.code == "UNSUPPORTED_TOOL_BINDING" for d in diagnostics)


def test_builtin_tool_binding_compiles_clean() -> None:
    node = GraphNode(id="tool_calc", type=NodeType.TOOL, position=NodePosition(x=0, y=0), config={"toolName": "calculator"})
    graph = _graph_with_tool_node(node, "graph_builtin_tool")
    diagnostics = validate_graph(graph)
    assert not any(d.code == "UNSUPPORTED_TOOL_BINDING" for d in diagnostics)


def test_registered_tool_binding_compiles_clean() -> None:
    storage.save_resource("tools", "custom_tool", {"id": "custom_tool", "description": "A custom tool"})
    node = GraphNode(id="tool_custom", type=NodeType.TOOL, position=NodePosition(x=0, y=0), config={"toolName": "custom_tool"})
    graph = _graph_with_tool_node(node, "graph_registered_tool")
    diagnostics = validate_graph(graph)
    assert not any(d.code == "UNSUPPORTED_TOOL_BINDING" for d in diagnostics)
    storage.delete_resource("tools", "custom_tool")


@pytest.mark.asyncio
async def test_calculator_tool_node_runs_end_to_end() -> None:
    input_node = GraphNode(id="input_1", type=NodeType.INPUT, position=NodePosition(x=0, y=0), config={"variableName": "question"})
    tool_node = GraphNode(id="calc_1", type=NodeType.TOOL, position=NodePosition(x=0, y=0), config={"toolName": "calculator", "inputVariable": "question"})
    output_node = GraphNode(id="output_1", type=NodeType.OUTPUT, position=NodePosition(x=0, y=0), config={})
    edges = [
        GraphEdge(id="e_input_calc", source="input_1", target="calc_1"),
        GraphEdge(id="e_calc_output", source="calc_1", target="output_1"),
    ]
    graph = build_demo_graph().model_copy(
        update={"id": "graph_calc", "nodes": [input_node, tool_node, output_node], "edges": edges, "entry_node_id": "input_1"}
    )
    compiled = compile_graph(graph, "cwf_calc")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_calc"] = graph

    run_id, _bus = await start_run_inline("cwf_calc", {"question": "2 + 2 * 3"}, provider="stub")
    summary = get_run_summary(run_id)
    assert summary.status == "succeeded"
    assert summary.result == 8


@pytest.mark.asyncio
async def test_mock_tool_echo_for_unbound_registered_tool() -> None:
    storage.save_resource("tools", "echo_tool", {"id": "echo_tool", "description": "no MCP binding"})
    try:
        input_node = GraphNode(id="input_1", type=NodeType.INPUT, position=NodePosition(x=0, y=0), config={"variableName": "question"})
        tool_node = GraphNode(id="echo_1", type=NodeType.TOOL, position=NodePosition(x=0, y=0), config={"toolName": "echo_tool", "inputVariable": "question"})
        output_node = GraphNode(id="output_1", type=NodeType.OUTPUT, position=NodePosition(x=0, y=0), config={})
        edges = [
            GraphEdge(id="e_input_echo", source="input_1", target="echo_1"),
            GraphEdge(id="e_echo_output", source="echo_1", target="output_1"),
        ]
        graph = build_demo_graph().model_copy(
            update={"id": "graph_echo", "nodes": [input_node, tool_node, output_node], "edges": edges, "entry_node_id": "input_1"}
        )
        compiled = compile_graph(graph, "cwf_echo")
        assert compiled.ok, compiled.diagnostics
        COMPILED_WORKFLOWS["cwf_echo"] = graph

        run_id, _bus = await start_run_inline("cwf_echo", {"question": "hello"}, provider="stub")
        summary = get_run_summary(run_id)
        assert summary.status == "succeeded"
        assert summary.result == {"toolId": "echo_tool", "input": "hello", "note": "mock tool: no MCP binding registered"}
    finally:
        storage.delete_resource("tools", "echo_tool")


@pytest.mark.asyncio
async def test_mcp_bound_tool_dispatches_to_mcp_server(monkeypatch) -> None:
    import json as json_mod

    def handle(request: httpx.Request) -> httpx.Response:
        body = json_mod.loads(request.content)
        if body["method"] == "tools/call":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {"content": "mcp result"}})
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {}})

    class _MockAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handle)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("app.mcp.client.httpx.AsyncClient", _MockAsyncClient)

    storage.save_resource("mcp_servers", "srv_1", {"id": "srv_1", "name": "Test", "url": "https://mcp.example.com/rpc"})
    storage.save_resource(
        "tools", "mcp_search", {"id": "mcp_search", "description": "search", "mcp_server_id": "srv_1", "mcp_tool_name": "search"}
    )
    try:
        input_node = GraphNode(id="input_1", type=NodeType.INPUT, position=NodePosition(x=0, y=0), config={"variableName": "question"})
        tool_node = GraphNode(id="mcp_1", type=NodeType.TOOL, position=NodePosition(x=0, y=0), config={"toolName": "mcp_search", "inputVariable": "question"})
        output_node = GraphNode(id="output_1", type=NodeType.OUTPUT, position=NodePosition(x=0, y=0), config={})
        edges = [
            GraphEdge(id="e_input_mcp", source="input_1", target="mcp_1"),
            GraphEdge(id="e_mcp_output", source="mcp_1", target="output_1"),
        ]
        graph = build_demo_graph().model_copy(
            update={"id": "graph_mcp_tool", "nodes": [input_node, tool_node, output_node], "edges": edges, "entry_node_id": "input_1"}
        )
        compiled = compile_graph(graph, "cwf_mcp_tool")
        assert compiled.ok, compiled.diagnostics
        COMPILED_WORKFLOWS["cwf_mcp_tool"] = graph

        run_id, _bus = await start_run_inline("cwf_mcp_tool", {"question": "hello"}, provider="stub")
        summary = get_run_summary(run_id)
        assert summary.status == "succeeded"
        assert summary.result == {"content": "mcp result"}
        trace = next(t for t in get_run_node_traces(run_id) if t.node_id == "mcp_1")
        assert trace.input["mcpServerId"] == "srv_1"
        assert trace.input["mcpToolName"] == "search"
    finally:
        storage.delete_resource("tools", "mcp_search")
        storage.delete_resource("mcp_servers", "srv_1")


@pytest.mark.asyncio
async def test_disabled_mcp_server_fails_the_run() -> None:
    storage.save_resource("mcp_servers", "srv_disabled", {"id": "srv_disabled", "name": "Disabled", "url": "https://mcp.example.com", "enabled": False})
    storage.save_resource(
        "tools",
        "disabled_tool",
        {"id": "disabled_tool", "description": "bound to a disabled server", "mcp_server_id": "srv_disabled", "mcp_tool_name": "x"},
    )
    try:
        input_node = GraphNode(id="input_1", type=NodeType.INPUT, position=NodePosition(x=0, y=0), config={"variableName": "question"})
        tool_node = GraphNode(id="tool_1", type=NodeType.TOOL, position=NodePosition(x=0, y=0), config={"toolName": "disabled_tool", "inputVariable": "question"})
        output_node = GraphNode(id="output_1", type=NodeType.OUTPUT, position=NodePosition(x=0, y=0), config={})
        edges = [
            GraphEdge(id="e_input_tool", source="input_1", target="tool_1"),
            GraphEdge(id="e_tool_output", source="tool_1", target="output_1"),
        ]
        graph = build_demo_graph().model_copy(
            update={"id": "graph_disabled_mcp", "nodes": [input_node, tool_node, output_node], "edges": edges, "entry_node_id": "input_1"}
        )
        compiled = compile_graph(graph, "cwf_disabled_mcp")
        assert compiled.ok, compiled.diagnostics
        COMPILED_WORKFLOWS["cwf_disabled_mcp"] = graph

        run_id, _bus = await start_run_inline("cwf_disabled_mcp", {"question": "hi"}, provider="stub")
        summary = get_run_summary(run_id)
        assert summary.status == "failed"
        assert "disabled" in summary.error
    finally:
        storage.delete_resource("tools", "disabled_tool")
        storage.delete_resource("mcp_servers", "srv_disabled")
