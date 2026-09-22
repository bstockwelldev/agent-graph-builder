"""Chat context binding (studio-ux-gap-remediation-plan.md §3, STO-596).
See docs/planning/features/studio-ux-gap-remediation-plan.md.
"""

from __future__ import annotations

from app import storage
from app.chat_context import ChatContext, build_chat_system_prompt
from app.models import GraphDefinition, GraphEdge, GraphNode, NodeTrace, RunSummary

GRAPH = GraphDefinition(
    id="graph_ctx_test",
    name="Context Test Graph",
    entry_node_id="input_1",
    nodes=[
        GraphNode(id="input_1", type="input", config={"variableName": "question"}),
        GraphNode(id="llm_1", type="llm", config={"provider": "stub", "model": "stub"}),
    ],
    edges=[],
)


def test_returns_none_for_an_empty_context() -> None:
    assert build_chat_system_prompt(ChatContext()) is None


def test_includes_graph_name_and_node_list() -> None:
    prompt = build_chat_system_prompt(ChatContext(graph=GRAPH))
    assert prompt is not None
    assert "Context Test Graph" in prompt
    assert "input_1 (input)" in prompt
    assert "llm_1 (llm)" in prompt


def test_includes_selected_node_config_and_diagnostics() -> None:
    # entry_node_id references a node that doesn't exist -> a blocking
    # structural diagnostic that validate_graph will surface.
    broken = GRAPH.model_copy(update={"entry_node_id": "does_not_exist"})
    prompt = build_chat_system_prompt(ChatContext(graph=broken, selected_node_id="llm_1"))
    assert prompt is not None
    assert "Selected node: llm_1" in prompt
    assert '"provider": "stub"' in prompt
    assert "does_not_exist" in prompt  # the structural diagnostic message


def test_selected_node_not_found_is_handled_gracefully() -> None:
    prompt = build_chat_system_prompt(ChatContext(graph=GRAPH, selected_node_id="ghost_node"))
    assert prompt is not None
    assert "ghost_node" in prompt
    assert "not found" in prompt


def test_includes_selected_edge() -> None:
    graph_with_edge = GRAPH.model_copy(
        update={"edges": [GraphEdge(id="e1", source="input_1", target="llm_1", kind="sequence")]}
    )
    prompt = build_chat_system_prompt(ChatContext(graph=graph_with_edge, selected_edge_id="e1"))
    assert prompt is not None
    assert "input_1 -> llm_1" in prompt


def test_includes_run_status_and_failing_traces() -> None:
    summary = RunSummary(run_id="run_ctx_1", graph_id=GRAPH.id, status="failed", error="boom", input={})
    traces = [
        NodeTrace(node_id="llm_1", node_type="llm", status="failed", started_at="2026-01-01T00:00:00Z", error="model timed out"),
        NodeTrace(node_id="input_1", node_type="input", status="succeeded", started_at="2026-01-01T00:00:00Z"),
    ]
    storage.save_run_snapshot(summary, traces)

    prompt = build_chat_system_prompt(ChatContext(graph=GRAPH, run_id="run_ctx_1"))
    assert prompt is not None
    assert "run_ctx_1: status=failed" in prompt
    assert "Node llm_1 failed: model timed out" in prompt
    # Only the failed trace should be surfaced, not the succeeded one.
    assert "input_1 failed" not in prompt


def test_unknown_run_id_is_handled_gracefully() -> None:
    prompt = build_chat_system_prompt(ChatContext(graph=GRAPH, run_id="run_does_not_exist"))
    assert prompt is not None
    assert "run_does_not_exist" in prompt
    assert "not found" in prompt


def test_prefers_inline_graph_over_stored_graph() -> None:
    """The canvas is often dirty (unsaved) -- context should reflect what's
    on screen, not the last-saved copy."""
    storage.save_graph(GRAPH)
    try:
        dirty = GRAPH.model_copy(update={"name": "Unsaved Rename"})
        prompt = build_chat_system_prompt(ChatContext(graph=dirty, graph_id=GRAPH.id))
        assert prompt is not None
        assert "Unsaved Rename" in prompt
    finally:
        storage.delete_graph(GRAPH.id)


def test_falls_back_to_stored_graph_when_no_inline_graph_given() -> None:
    storage.save_graph(GRAPH)
    try:
        prompt = build_chat_system_prompt(ChatContext(graph_id=GRAPH.id))
        assert prompt is not None
        assert GRAPH.name in prompt
    finally:
        storage.delete_graph(GRAPH.id)


def test_returns_none_when_graph_id_does_not_resolve() -> None:
    assert build_chat_system_prompt(ChatContext(graph_id="does_not_exist_at_all")) is None
