"""P2, "Cross-cutting policy overlays": rule-by-rule unit tests, exception
waiver behavior, the compiler/release gate wiring, and the policy-exception
CRUD routes. Mirrors test_resource_versions.py's conventions."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.compiler import validate_graph
from app.demo_graph import build_demo_graph
from app.main import app
from app.models import (
    DataClassification,
    GraphDefinition,
    GraphEdge,
    GraphNode,
    GraphPort,
    NodePosition,
    NodeType,
    PortContract,
    PortKind,
)
from app.policies import (
    create_policy_exception,
    delete_policy_exception,
    edge_classifications,
    evaluate_graph_policies,
    evaluate_release_governance,
    list_graph_policy_exceptions,
)
from app.releases import ReleasePublishBlocked, publish_release
from tests.helpers import editable_demo_graph

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _sensitive_output_port(classification: DataClassification) -> GraphPort:
    return GraphPort(
        id="output",
        name="output",
        direction="output",
        contract=PortContract(kind=PortKind.MESSAGE, classification=classification),
    )


def _graph_with_sensitive_data_into_tool(classification: DataClassification) -> GraphDefinition:
    return GraphDefinition(
        id="g1",
        name="g1",
        entry_node_id="source",
        nodes=[
            GraphNode(
                id="source",
                type=NodeType.INPUT,
                position=NodePosition(x=0, y=0),
                output_ports=[_sensitive_output_port(classification)],
            ),
            GraphNode(
                id="tool",
                type=NodeType.TOOL,
                position=NodePosition(x=1, y=0),
                config={"toolName": "lookup_topic"},
            ),
        ],
        edges=[GraphEdge(id="e1", source="source", target="tool")],
    )


def test_demo_graph_has_no_blocking_policy_diagnostics() -> None:
    graph = build_demo_graph()
    diagnostics = evaluate_graph_policies(graph)
    assert not any(d.blocking for d in diagnostics), diagnostics


def test_sensitive_data_into_tool_blocks() -> None:
    graph = _graph_with_sensitive_data_into_tool(DataClassification.CONFIDENTIAL)
    diagnostics = evaluate_graph_policies(graph)
    matches = [d for d in diagnostics if d.code == "POLICY_SENSITIVE_DATA_INTO_TOOL"]
    assert len(matches) == 1
    assert matches[0].blocking is True
    assert matches[0].node_id == "tool"
    assert matches[0].category == "policy"


def test_restricted_data_into_tool_also_blocks() -> None:
    graph = _graph_with_sensitive_data_into_tool(DataClassification.RESTRICTED)
    diagnostics = evaluate_graph_policies(graph)
    assert any(d.code == "POLICY_SENSITIVE_DATA_INTO_TOOL" for d in diagnostics)


def test_public_data_into_tool_does_not_block() -> None:
    graph = _graph_with_sensitive_data_into_tool(DataClassification.PUBLIC)
    diagnostics = evaluate_graph_policies(graph)
    assert not any(d.code == "POLICY_SENSITIVE_DATA_INTO_TOOL" for d in diagnostics)


def test_llm_model_not_pinned_warns_but_does_not_block() -> None:
    graph = build_demo_graph()
    llm_node = next(n for n in graph.nodes if n.type == NodeType.LLM)
    llm_node.config.pop("model", None)
    diagnostics = evaluate_graph_policies(graph)
    matches = [d for d in diagnostics if d.code == "POLICY_LLM_MODEL_NOT_PINNED"]
    assert len(matches) == 1
    assert matches[0].node_id == llm_node.id
    assert matches[0].blocking is False


def test_llm_model_pinned_does_not_warn() -> None:
    graph = build_demo_graph()
    llm_node = next(n for n in graph.nodes if n.type == NodeType.LLM)
    llm_node.config["model"] = "gpt-4o"
    diagnostics = evaluate_graph_policies(graph)
    assert not any(d.code == "POLICY_LLM_MODEL_NOT_PINNED" for d in diagnostics)


def test_too_many_model_nodes_warns() -> None:
    nodes = [
        GraphNode(id="entry", type=NodeType.INPUT, position=NodePosition(x=0, y=0)),
        *(
            GraphNode(
                id=f"llm{i}",
                type=NodeType.LLM,
                position=NodePosition(x=i, y=1),
                config={"model": "gpt-4o"},
            )
            for i in range(6)
        ),
    ]
    graph = GraphDefinition(id="g2", name="g2", entry_node_id="entry", nodes=nodes, edges=[])
    diagnostics = evaluate_graph_policies(graph)
    matches = [d for d in diagnostics if d.code == "POLICY_TOO_MANY_MODEL_NODES"]
    assert len(matches) == 1
    assert matches[0].blocking is False


def test_few_model_nodes_does_not_warn() -> None:
    graph = build_demo_graph()
    diagnostics = evaluate_graph_policies(graph)
    assert not any(d.code == "POLICY_TOO_MANY_MODEL_NODES" for d in diagnostics)


def test_release_governance_warns_without_notes_and_author() -> None:
    diagnostics = evaluate_release_governance("g1", None, None)
    matches = [d for d in diagnostics if d.code == "POLICY_RELEASE_MISSING_GOVERNANCE_METADATA"]
    assert len(matches) == 1
    assert matches[0].blocking is False


def test_release_governance_clean_with_notes_and_author() -> None:
    diagnostics = evaluate_release_governance("g1", "notes", "author")
    assert diagnostics == []


def test_publish_release_surfaces_governance_diagnostic_non_blocking() -> None:
    graph = build_demo_graph()
    release, created = publish_release(graph)
    assert created is True
    assert any(d.code == "POLICY_RELEASE_MISSING_GOVERNANCE_METADATA" for d in release.diagnostics)


def test_publish_release_blocked_by_sensitive_data_policy() -> None:
    graph = _graph_with_sensitive_data_into_tool(DataClassification.CONFIDENTIAL)
    with pytest.raises(ReleasePublishBlocked) as exc_info:
        publish_release(graph, release_notes="notes", author="me")
    assert any(d.code == "POLICY_SENSITIVE_DATA_INTO_TOOL" for d in exc_info.value.diagnostics)


def test_validate_graph_includes_policy_diagnostics() -> None:
    graph = _graph_with_sensitive_data_into_tool(DataClassification.CONFIDENTIAL)
    diagnostics = validate_graph(graph)
    assert any(d.code == "POLICY_SENSITIVE_DATA_INTO_TOOL" for d in diagnostics)


def test_exception_waives_matching_blocking_diagnostic() -> None:
    graph = _graph_with_sensitive_data_into_tool(DataClassification.CONFIDENTIAL)
    create_policy_exception(
        graph.id,
        policy_code="POLICY_SENSITIVE_DATA_INTO_TOOL",
        node_id=None,
        reason="reviewed",
        expires_at="2099-01-01T00:00:00+00:00",
    )
    diagnostics = evaluate_graph_policies(graph)
    matches = [d for d in diagnostics if d.code == "POLICY_SENSITIVE_DATA_INTO_TOOL"]
    assert len(matches) == 1
    assert matches[0].blocking is False
    assert "waived" in matches[0].message


def test_node_scoped_exception_only_waives_that_node() -> None:
    graph = _graph_with_sensitive_data_into_tool(DataClassification.CONFIDENTIAL)
    create_policy_exception(
        graph.id,
        policy_code="POLICY_SENSITIVE_DATA_INTO_TOOL",
        node_id="not_tool",
        reason="reviewed",
        expires_at="2099-01-01T00:00:00+00:00",
    )
    diagnostics = evaluate_graph_policies(graph)
    matches = [d for d in diagnostics if d.code == "POLICY_SENSITIVE_DATA_INTO_TOOL"]
    assert len(matches) == 1
    assert matches[0].blocking is True


def test_expired_exception_does_not_waive() -> None:
    graph = _graph_with_sensitive_data_into_tool(DataClassification.CONFIDENTIAL)
    create_policy_exception(
        graph.id,
        policy_code="POLICY_SENSITIVE_DATA_INTO_TOOL",
        node_id=None,
        reason="reviewed",
        expires_at="2000-01-01T00:00:00+00:00",
    )
    diagnostics = evaluate_graph_policies(graph)
    matches = [d for d in diagnostics if d.code == "POLICY_SENSITIVE_DATA_INTO_TOOL"]
    assert len(matches) == 1
    assert matches[0].blocking is True


def test_exception_lets_release_publish_succeed() -> None:
    graph = _graph_with_sensitive_data_into_tool(DataClassification.CONFIDENTIAL)
    create_policy_exception(
        graph.id,
        policy_code="POLICY_SENSITIVE_DATA_INTO_TOOL",
        node_id=None,
        reason="reviewed",
        expires_at="2099-01-01T00:00:00+00:00",
    )
    release, created = publish_release(graph, release_notes="notes", author="me")
    assert created is True
    assert any(
        d.code == "POLICY_SENSITIVE_DATA_INTO_TOOL" and not d.blocking for d in release.diagnostics
    )


def test_create_and_list_and_delete_policy_exception() -> None:
    exception = create_policy_exception(
        "g1",
        policy_code="POLICY_SENSITIVE_DATA_INTO_TOOL",
        node_id="n1",
        reason="reviewed",
        expires_at="2099-01-01T00:00:00+00:00",
    )
    assert exception.id.startswith("pexc_")

    listed = list_graph_policy_exceptions("g1")
    assert [e.id for e in listed] == [exception.id]

    assert delete_policy_exception("g1", exception.id) is True
    assert list_graph_policy_exceptions("g1") == []


def test_delete_policy_exception_returns_false_when_missing() -> None:
    assert delete_policy_exception("g1", "pexc_missing") is False


def test_policy_exception_routes_round_trip() -> None:
    from app import storage

    storage.save_graph(editable_demo_graph())
    graph_id = editable_demo_graph().id

    create_response = client.post(
        f"/api/graphs/{graph_id}/policy-exceptions",
        json={
            "policy_code": "POLICY_LLM_MODEL_NOT_PINNED",
            "node_id": None,
            "reason": "known gap",
            "expires_at": "2099-01-01T00:00:00+00:00",
        },
    )
    assert create_response.status_code == 200, create_response.text
    exception_id = create_response.json()["id"]

    list_response = client.get(f"/api/graphs/{graph_id}/policy-exceptions")
    assert list_response.status_code == 200
    assert [e["id"] for e in list_response.json()] == [exception_id]

    delete_response = client.delete(f"/api/graphs/{graph_id}/policy-exceptions/{exception_id}")
    assert delete_response.status_code == 200
    assert delete_response.json() == {"deleted": True}

    delete_again_response = client.delete(
        f"/api/graphs/{graph_id}/policy-exceptions/{exception_id}"
    )
    assert delete_again_response.status_code == 404


def test_policy_exception_routes_404_for_unknown_graph() -> None:
    response = client.post(
        "/api/graphs/does-not-exist/policy-exceptions",
        json={
            "policy_code": "POLICY_LLM_MODEL_NOT_PINNED",
            "expires_at": "2099-01-01T00:00:00+00:00",
        },
    )
    assert response.status_code == 404

    assert client.get("/api/graphs/does-not-exist/policy-exceptions").status_code == 404
    assert client.delete("/api/graphs/does-not-exist/policy-exceptions/pexc_x").status_code == 404


def _chain(*nodes: GraphNode) -> GraphDefinition:
    return GraphDefinition(
        id="g_chain",
        name="g_chain",
        entry_node_id=nodes[0].id,
        nodes=list(nodes),
        edges=[
            GraphEdge(id=f"e_{a.id}_{b.id}", source=a.id, target=b.id)
            for a, b in zip(nodes, nodes[1:], strict=False)
        ],
    )


def _node(node_id: str, node_type: NodeType, **ports: list[GraphPort]) -> GraphNode:
    return GraphNode(id=node_id, type=node_type, position=NodePosition(x=0, y=0), **ports)


def _classified_input(classification: DataClassification) -> GraphNode:
    return _node("source", NodeType.INPUT, output_ports=[_sensitive_output_port(classification)])


def _codes(graph: GraphDefinition) -> list[tuple[str, str | None]]:
    return [(d.code, d.edge_id) for d in evaluate_graph_policies(graph) if d.blocking]


def test_classification_flows_through_intermediate_nodes_into_a_tool() -> None:
    graph = _chain(
        _classified_input(DataClassification.CONFIDENTIAL),
        _node("prompt", NodeType.PROMPT),
        _node("tool", NodeType.TOOL),
    )
    (diagnostic,) = [d for d in evaluate_graph_policies(graph) if d.blocking]
    assert diagnostic.code == "POLICY_SENSITIVE_DATA_INTO_TOOL"
    assert diagnostic.edge_id == "e_prompt_tool"
    assert "declared on 'source'" in diagnostic.message


def test_a_guardrail_declaring_a_lower_classification_declassifies() -> None:
    public_out = GraphPort(
        id="output",
        name="output",
        direction="output",
        contract=PortContract(kind=PortKind.MESSAGE, classification=DataClassification.PUBLIC),
    )
    source = _classified_input(DataClassification.CONFIDENTIAL)
    assert _codes(_chain(source, _node("guard", NodeType.GUARDRAIL), _node("tool", NodeType.TOOL)))
    guarded = _chain(
        source,
        _node("guard", NodeType.GUARDRAIL, output_ports=[public_out]),
        _node("tool", NodeType.TOOL),
    )
    assert _codes(guarded) == []


def test_a_non_guardrail_cannot_declassify_by_declaration() -> None:
    public_out = _sensitive_output_port(DataClassification.PUBLIC)
    graph = _chain(
        _classified_input(DataClassification.RESTRICTED),
        _node("prompt", NodeType.PROMPT, output_ports=[public_out]),
        _node("tool", NodeType.TOOL),
    )
    assert _codes(graph) == [("POLICY_SENSITIVE_DATA_INTO_TOOL", "e_prompt_tool")]


def test_input_clearance_blocks_higher_classified_data() -> None:
    def llm(clearance: DataClassification) -> GraphNode:
        port = GraphPort(
            id="input",
            name="input",
            direction="input",
            contract=PortContract(kind=PortKind.MESSAGE, classification=clearance),
        )
        return _node("llm", NodeType.LLM, input_ports=[port])

    source = _classified_input(DataClassification.CONFIDENTIAL)
    blocked = [
        d
        for d in evaluate_graph_policies(_chain(source, llm(DataClassification.INTERNAL)))
        if d.blocking
    ]
    assert [(d.code, d.node_id, d.port_id) for d in blocked] == [
        ("POLICY_CLASSIFICATION_ABOVE_CLEARANCE", "llm", "input")
    ]
    assert "cleared for internal" in blocked[0].message
    assert _codes(_chain(source, llm(DataClassification.CONFIDENTIAL))) == []


def test_classification_propagation_converges_on_a_loop() -> None:
    graph = _chain(
        _classified_input(DataClassification.CONFIDENTIAL),
        _node("a", NodeType.PROMPT),
        _node("b", NodeType.PROMPT),
    )
    graph.edges.append(GraphEdge(id="e_back", source="b", target="a"))
    carried = edge_classifications(graph)
    assert {edge: level[0].value for edge, level in carried.items()} == {
        "e_source_a": "confidential",
        "e_a_b": "confidential",
        "e_back": "confidential",
    }
