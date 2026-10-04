"""Decision node executor tests.

Runs end-to-end through the compile+run seam with the stub decision provider
(same pattern as test_node_executors.py): a decision node classifies the raw
question and routes by exact outcome match.
"""

from __future__ import annotations

import pytest

from app.compiler import compile_graph
from app.models import (
    EdgeKind,
    GraphDefinition,
    GraphEdge,
    GraphNode,
    NodePosition,
    NodeType,
)
from app.node_configs import DecisionConfig, validate_node_config
from app.runtime import COMPILED_WORKFLOWS, get_run_summary, start_run_inline


def _decision_graph(config: dict) -> GraphDefinition:
    nodes = [
        GraphNode(
            id="input_1",
            type=NodeType.INPUT,
            position=NodePosition(x=0, y=0),
            config={"variableName": "question"},
        ),
        GraphNode(
            id="decide_1",
            type=NodeType.DECISION,
            position=NodePosition(x=200, y=0),
            config=config,
        ),
        GraphNode(
            id="out_local", type=NodeType.OUTPUT, position=NodePosition(x=400, y=0)
        ),
        GraphNode(
            id="out_frontier",
            type=NodeType.OUTPUT,
            position=NodePosition(x=400, y=120),
        ),
        GraphNode(
            id="out_default",
            type=NodeType.OUTPUT,
            position=NodePosition(x=400, y=240),
        ),
    ]
    edges = [
        GraphEdge(id="e_in", source="input_1", target="decide_1"),
        GraphEdge(
            id="e_local",
            source="decide_1",
            target="out_local",
            kind=EdgeKind.CONDITIONAL,
            condition="local_answer",
        ),
        GraphEdge(
            id="e_frontier",
            source="decide_1",
            target="out_frontier",
            kind=EdgeKind.CONDITIONAL,
            condition="frontier_reasoning",
        ),
        GraphEdge(
            id="e_default",
            source="decide_1",
            target="out_default",
            kind=EdgeKind.DEFAULT,
        ),
    ]
    return GraphDefinition(
        id="g_decision",
        name="Decision test graph",
        entry_node_id="input_1",
        nodes=nodes,
        edges=edges,
    )


async def _run(graph: GraphDefinition, question: str, **kwargs):
    compiled = compile_graph(graph, "cwf_decision_test")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_decision_test"] = graph
    run_id, bus = await start_run_inline(
        "cwf_decision_test", {"question": question}, provider="stub", **kwargs
    )
    return get_run_summary(run_id), bus


def _decision_event(bus, event_type: str):
    return [
        e for e in bus.collected_events() if e.event_type == event_type
    ]


@pytest.mark.asyncio
async def test_decision_routes_by_exact_outcome_match() -> None:
    summary, bus = await _run(
        _decision_graph({"schema": "route"}), "How does a database index work?"
    )
    assert summary.status == "succeeded", summary.error
    made = _decision_event(bus, "decision.made")
    assert len(made) == 1
    assert made[0].payload["outcome"] == "local_answer"
    assert made[0].payload["rationale"] == "exact_match"
    selected = _decision_event(bus, "edge.selected")
    assert selected[0].payload["selectedTargetNodeId"] == "out_local"


@pytest.mark.asyncio
async def test_decision_routes_complex_question_to_frontier() -> None:
    summary, bus = await _run(
        _decision_graph({"schema": "route"}),
        "Design a zero-downtime migration plan for our auth service.",
    )
    assert summary.status == "succeeded", summary.error
    made = _decision_event(bus, "decision.made")
    assert made[0].payload["outcome"] == "frontier_reasoning"
    assert made[0].payload["reasonCode"] == "multi_step_reasoning"


@pytest.mark.asyncio
async def test_decision_abstain_takes_default_edge() -> None:
    summary, bus = await _run(_decision_graph({"schema": "route"}), "???")
    assert summary.status == "succeeded", summary.error
    made = _decision_event(bus, "decision.made")
    assert made[0].payload["abstained"] is True
    assert made[0].payload["rationale"] == "low_confidence_default"
    selected = _decision_event(bus, "edge.selected")
    assert selected[0].payload["selectedTargetNodeId"] == "out_default"


@pytest.mark.asyncio
async def test_decision_threshold_escalates_to_default() -> None:
    # Stub reports 0.90 for simple questions; threshold 0.99 forces escalation.
    summary, bus = await _run(
        _decision_graph({"schema": "route", "threshold": 0.99}),
        "How does a database index work?",
    )
    assert summary.status == "succeeded", summary.error
    made = _decision_event(bus, "decision.made")
    assert made[0].payload["outcome"] == "local_answer"
    assert made[0].payload["rationale"] == "low_confidence_default"
    selected = _decision_event(bus, "edge.selected")
    assert selected[0].payload["selectedTargetNodeId"] == "out_default"


@pytest.mark.asyncio
async def test_decision_fail_closed_on_low_confidence() -> None:
    # onLowConfidence="fail": graphs with state-changing downstream branches
    # fail the run rather than act on an uncalibrated guess.
    summary, _ = await _run(
        _decision_graph(
            {"schema": "route", "threshold": 0.99, "onLowConfidence": "fail"}
        ),
        "How does a database index work?",
    )
    assert summary.status == "failed"
    assert "below threshold" in (summary.error or "")


@pytest.mark.asyncio
async def test_decision_rule_gate_short_circuits() -> None:
    summary, bus = await _run(
        _decision_graph(
            {
                "schema": "route",
                "rules": [
                    {
                        "name": "refund_to_human",
                        "match": "refund",
                        "verdict": "human_review",
                    }
                ],
            }
        ),
        "Should we automatically refund this disputed charge?",
    )
    assert summary.status == "succeeded", summary.error
    made = _decision_event(bus, "decision.made")
    assert made[0].payload["outcome"] == "human_review"
    assert made[0].payload["ruleHit"] == "refund_to_human"
    assert made[0].payload["reasonCode"] == "policy_rule"
    # human_review has no conditional edge -> default edge (human review path).
    selected = _decision_event(bus, "edge.selected")
    assert selected[0].payload["rationale"] == "default_fallback"
    assert selected[0].payload["selectedTargetNodeId"] == "out_default"


@pytest.mark.asyncio
async def test_decision_forced_route_skips_model() -> None:
    summary, bus = await _run(
        _decision_graph({"schema": "route"}),
        "How does a database index work?",
        forced_routes={"decide_1": "out_frontier"},
    )
    assert summary.status == "succeeded", summary.error
    made = _decision_event(bus, "decision.made")
    assert made[0].payload["rationale"] == "forced"
    assert made[0].payload["attempts"] == 0
    selected = _decision_event(bus, "edge.selected")
    assert selected[0].payload["selectedTargetNodeId"] == "out_frontier"


@pytest.mark.asyncio
async def test_decision_custom_inline_schema() -> None:
    config = {
        "schema": {
            "type": "object",
            "required": ["triage", "confidence"],
            "properties": {
                "triage": {"type": "string", "enum": ["now", "later", "never"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            },
        },
        "outcomeField": "triage",
        "abstainValues": ["never"],
    }
    assert validate_node_config(NodeType.DECISION, config) == []
    graph = _decision_graph(config)
    # Replace conditional edges with the custom outcomes.
    graph.edges = [
        e
        for e in graph.edges
        if not (e.source == "decide_1" and e.kind == EdgeKind.CONDITIONAL)
    ] + [
        GraphEdge(
            id="e_now",
            source="decide_1",
            target="out_local",
            kind=EdgeKind.CONDITIONAL,
            condition="now",
        ),
        GraphEdge(
            id="e_later",
            source="decide_1",
            target="out_frontier",
            kind=EdgeKind.CONDITIONAL,
            condition="later",
        ),
    ]
    # The stub backend has no rules for custom schemas -> run fails loudly,
    # never silently. This asserts the failure is explicit, not a guess.
    summary, _ = await _run(graph, "How does a database index work?")
    assert summary.status == "failed"
    assert "stub has no rules" in (summary.error or "")


def test_decision_config_validation() -> None:
    assert validate_node_config(NodeType.DECISION, {"schema": "route"}) == []
    assert validate_node_config(NodeType.DECISION, {"schema": "nope"}) != []
    assert (
        validate_node_config(
            NodeType.DECISION,
            {"schema": {"type": "object", "properties": {"a": {"type": "string"}}}},
        )
        != []
    )  # missing outcomeField
    assert (
        validate_node_config(
            NodeType.DECISION,
            {
                "schema": "route",
                "rules": [{"name": "x", "match": "y", "verdict": "bogus"}],
            },
        )
        != []
    )
    cfg = DecisionConfig.model_validate({"schema": "gate", "threshold": 0.5})
    assert cfg.threshold == 0.5
    assert cfg.onLowConfidence == "default"
