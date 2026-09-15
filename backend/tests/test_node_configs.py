"""Studio-consolidation Phase 1 + 2: NodeType expansion, typed config
validation, and the NODE_TYPE_NOT_EXECUTABLE safety net.

See docs/planning/features/studio-consolidation-plan.md.
"""

from __future__ import annotations

from app.compiler import validate_graph
from app.demo_graph import build_demo_graph
from app.models import GraphEdge, GraphNode, NodePosition, NodeType
from app.node_configs import validate_node_config
from app.nodes import EXECUTORS


def _graph_with_extra_node(node: GraphNode, edge_source: str = "output_1") -> object:
    """Append `node` to the demo graph with a dangling sequence edge from
    an existing node, so only the diagnostics under test are expected."""
    demo = build_demo_graph()
    return demo.model_copy(
        update={
            "nodes": [*demo.nodes, node],
            "edges": [
                *demo.edges,
                GraphEdge(id=f"e_to_{node.id}", source=edge_source, target=node.id),
            ],
        }
    )


def test_all_node_types_have_executors_as_of_phase_2() -> None:
    # Guards the NODE_TYPE_NOT_EXECUTABLE safety net added in Phase 1: every
    # current NodeType must be a registered executor as of Phase 2 (see
    # test_node_executors.py for the individual executor behaviors, and
    # test_node_type_not_executable_guards_future_additions below for the
    # guard itself, exercised against a type EXECUTORS doesn't know).
    for node_type in NodeType:
        assert node_type.value in EXECUTORS, f"{node_type.value} has no registered executor"


def test_node_type_not_executable_guards_future_additions(monkeypatch) -> None:
    # Exercises the NODE_TYPE_NOT_EXECUTABLE diagnostic itself without
    # depending on any *current* node type staying unregistered forever.
    import app.compiler as compiler_module

    monkeypatch.setattr(compiler_module, "EXECUTORS", {k: v for k, v in EXECUTORS.items() if k != "guardrail"})
    node = GraphNode(id="guardrail_1", type=NodeType.GUARDRAIL, position=NodePosition(x=0, y=0), config={})
    graph = _graph_with_extra_node(node)

    diagnostics = validate_graph(graph)

    assert any(
        d.code == "NODE_TYPE_NOT_EXECUTABLE" and d.node_id == "guardrail_1" and d.blocking
        for d in diagnostics
    )


def test_tool_loop_requires_model_and_max_tool_iterations() -> None:
    errors = validate_node_config(NodeType.TOOL_LOOP, {})
    assert any("model" in e for e in errors)
    assert any("maxToolIterations" in e for e in errors)


def test_tool_loop_rejects_out_of_range_iterations() -> None:
    errors = validate_node_config(NodeType.TOOL_LOOP, {"model": "qwen2.5:3b", "maxToolIterations": 65})
    assert any("maxToolIterations" in e for e in errors)


def test_tool_loop_accepts_valid_config() -> None:
    errors = validate_node_config(
        NodeType.TOOL_LOOP, {"model": "qwen2.5:3b", "maxToolIterations": 8}
    )
    assert errors == []


def test_code_exec_requires_content() -> None:
    errors = validate_node_config(NodeType.CODE_EXEC, {})
    assert any("content" in e for e in errors)


def test_human_gate_requires_content_and_valid_genui_json() -> None:
    missing_content = validate_node_config(NodeType.HUMAN_GATE, {})
    assert any("content" in e for e in missing_content)

    bad_json = validate_node_config(
        NodeType.HUMAN_GATE, {"content": "Approve?", "genuiCheckpointSurfaceJson": "{not json"}
    )
    assert any("genuiCheckpointSurfaceJson" in e for e in bad_json)

    ok = validate_node_config(
        NodeType.HUMAN_GATE,
        {"content": "Approve?", "genuiCheckpointSurfaceJson": '{"root": {"type": "Text", "props": {"content": "hi"}}}'},
    )
    assert ok == []


def test_guardrail_rubric_branch_have_no_required_fields() -> None:
    # Ported from micro-ui-agent-builder's own validateFlowSteps, which also
    # treats these three as documentation-only with no required fields.
    assert validate_node_config(NodeType.GUARDRAIL, {}) == []
    assert validate_node_config(NodeType.RUBRIC, {}) == []
    assert validate_node_config(NodeType.BRANCH, {}) == []


def test_existing_node_types_are_unvalidated_by_this_module() -> None:
    # input/prompt/llm/tool/router/output keep their pre-existing tolerant
    # behavior in nodes.py — this program does not add requiredness to them.
    assert validate_node_config(NodeType.LLM, {}) == []
    assert validate_node_config(NodeType.TOOL, {}) == []


def test_node_config_invalid_diagnostic_surfaces_from_validate_graph() -> None:
    node = GraphNode(
        id="tool_loop_1",
        type=NodeType.TOOL_LOOP,
        position=NodePosition(x=0, y=0),
        config={},
    )
    graph = _graph_with_extra_node(node)

    diagnostics = validate_graph(graph)

    config_diags = [d for d in diagnostics if d.code == "NODE_CONFIG_INVALID" and d.node_id == "tool_loop_1"]
    assert config_diags
    assert all(d.blocking for d in config_diags)
