"""Fixture test for the FlowDocument -> GraphDefinition migration script
(studio-consolidation Phase 2). Fixture shape mirrors
micro-ui-agent-builder's own seed FlowDocument
(apps/web/lib/server/studio-store.ts: flow_demo) closely enough to exercise
every mapped step type once.
"""

from __future__ import annotations

import pytest

from app.compiler import validate_graph
from app.models import GraphDefinition
from scripts.migrate_flow_to_graph import migrate_flow_document

FLOW_DOCUMENT = {
    "id": "flow_demo",
    "name": "Demo flow",
    "steps": [
        {"id": "s_system", "type": "system", "order": 0, "content": "You are a helpful assistant."},
        {"id": "s_user", "type": "user", "order": 1, "content": "{question}"},
        {"id": "s_llm", "type": "llm", "order": 2, "model": "gemini-2.5-flash-lite"},
        {"id": "s_output", "type": "output", "order": 3},
    ],
}


def test_migrates_a_linear_flow_with_no_explicit_edges() -> None:
    graph_dict, warnings = migrate_flow_document(FLOW_DOCUMENT)
    graph = GraphDefinition.model_validate(graph_dict)

    assert graph.id == "flow_demo"
    assert graph.entry_node_id == "s_system"
    assert [n.id for n in graph.nodes] == ["s_system", "s_user", "s_llm", "s_output"]
    assert [n.type.value for n in graph.nodes] == ["prompt", "prompt", "llm", "output"]
    assert [(e.source, e.target) for e in graph.edges] == [
        ("s_system", "s_user"),
        ("s_user", "s_llm"),
        ("s_llm", "s_output"),
    ]
    assert graph.nodes[2].config["model"] == "gemini-2.5-flash-lite"
    assert warnings == []

    # The migrated graph should compile clean with the stub provider's demo
    # taxonomy — a linear system/user/llm/output chain has no router/branch
    # requirements to satisfy.
    diagnostics = validate_graph(graph)
    assert not any(d.blocking for d in diagnostics), diagnostics


def test_migrates_explicit_edges_as_sequence() -> None:
    flow = {
        **FLOW_DOCUMENT,
        "edges": [
            {"id": "e1", "source": "s_system", "target": "s_user", "label": "then"},
            {"id": "e2", "source": "s_user", "target": "s_llm"},
            {"id": "e3", "source": "s_llm", "target": "s_output"},
        ],
    }
    graph_dict, _warnings = migrate_flow_document(flow)
    graph = GraphDefinition.model_validate(graph_dict)
    assert [e.kind.value for e in graph.edges] == ["sequence", "sequence", "sequence"]


def test_tool_step_referencing_lookup_topic_has_no_warning() -> None:
    flow = {
        "id": "flow_tool",
        "name": "Tool flow",
        "steps": [
            {"id": "s_input", "type": "user", "order": 0, "content": "topic?"},
            {"id": "s_tool", "type": "tool", "order": 1, "refId": "lookup_topic"},
        ],
    }
    graph_dict, warnings = migrate_flow_document(flow)
    graph = GraphDefinition.model_validate(graph_dict)
    assert graph.nodes[1].config == {"toolName": "lookup_topic", "inputVariable": "question"}
    assert warnings == []


def test_tool_step_referencing_unknown_tool_warns() -> None:
    flow = {
        "id": "flow_tool_unknown",
        "name": "Tool flow",
        "steps": [
            {"id": "s_input", "type": "user", "order": 0, "content": "topic?"},
            {"id": "s_tool", "type": "tool", "order": 1, "refId": "web_search"},
        ],
    }
    _graph_dict, warnings = migrate_flow_document(flow)
    assert any("web_search" in w and "UNSUPPORTED_TOOL_BINDING" in w for w in warnings)


def test_branch_step_migrates_but_warns_about_missing_alternate_target() -> None:
    flow = {
        "id": "flow_branch",
        "name": "Branch flow",
        "steps": [
            {"id": "s_input", "type": "user", "order": 0, "content": "hi"},
            {"id": "s_branch", "type": "branch", "order": 1, "content": "required text"},
            {"id": "s_output", "type": "output", "order": 2},
        ],
    }
    graph_dict, warnings = migrate_flow_document(flow)
    graph = GraphDefinition.model_validate(graph_dict)
    branch_node = next(n for n in graph.nodes if n.id == "s_branch")
    assert branch_node.type.value == "branch"
    assert branch_node.config == {"content": "required text"}
    assert any("BRANCH_MISSING_FALLBACK" in w for w in warnings)

    # Confirmed: the migrated branch node, with only a sequence edge in and
    # out (no conditional/default), fails compile exactly as the warning
    # promises — a human has to add real branching edges to benefit from
    # this repo's upgrade over MUI's whole-run precondition.
    diagnostics = validate_graph(graph)
    assert any(d.code == "BRANCH_MISSING_FALLBACK" for d in diagnostics)


def test_llm_step_with_tool_loop_iterations_is_promoted() -> None:
    flow = {
        "id": "flow_promoted",
        "name": "Promoted flow",
        "steps": [
            {"id": "s_input", "type": "user", "order": 0, "content": "hi"},
            {
                "id": "s_llm",
                "type": "llm",
                "order": 1,
                "model": "qwen2.5:3b",
                "content": "Loop instructions",
                "maxToolIterations": 5,
            },
            {"id": "s_output", "type": "output", "order": 2},
        ],
    }
    graph_dict, warnings = migrate_flow_document(flow)
    graph = GraphDefinition.model_validate(graph_dict)
    loop_node = next(n for n in graph.nodes if n.id == "s_llm")
    assert loop_node.type.value == "tool_loop"
    assert loop_node.config["maxToolIterations"] == 5
    assert loop_node.config["systemPrompt"] == "Loop instructions"
    assert any("promoted to a tool_loop" in w for w in warnings)


def test_system_step_with_unresolved_prompt_ref_warns() -> None:
    flow = {
        "id": "flow_ref",
        "name": "Ref flow",
        "steps": [
            {"id": "s_system", "type": "system", "order": 0, "refId": "sys_prompt_1"},
            {"id": "s_output", "type": "output", "order": 1},
        ],
    }
    graph_dict, warnings = migrate_flow_document(flow)
    graph = GraphDefinition.model_validate(graph_dict)
    node = next(n for n in graph.nodes if n.id == "s_system")
    assert "unresolved prompt template" in node.config["template"]
    assert any("sys_prompt_1" in w for w in warnings)


def test_output_step_content_is_dropped_with_warning() -> None:
    flow = {
        "id": "flow_output_contract",
        "name": "Output flow",
        "steps": [
            {"id": "s_input", "type": "user", "order": 0, "content": "hi"},
            {"id": "s_output", "type": "output", "order": 1, "content": "Respond in JSON."},
        ],
    }
    graph_dict, warnings = migrate_flow_document(flow)
    graph = GraphDefinition.model_validate(graph_dict)
    output_node = next(n for n in graph.nodes if n.id == "s_output")
    assert output_node.config == {}
    assert any("output contract" in w for w in warnings)


def test_empty_flow_document_raises() -> None:
    with pytest.raises(ValueError):
        migrate_flow_document({"id": "empty", "name": "Empty", "steps": []})


def test_unmapped_step_type_raises() -> None:
    flow = {
        "id": "flow_bad",
        "name": "Bad flow",
        "steps": [{"id": "s1", "type": "not_a_real_type", "order": 0}],
    }
    with pytest.raises(ValueError):
        migrate_flow_document(flow)
