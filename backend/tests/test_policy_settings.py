"""Configurable policies (STO-608): enforcement levels, workspace defaults
and per-graph overrides, rule parameters, the block_publish gate, and the
settings/effective/exception-update routes."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import storage
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
    PolicyRuleSetting,
    PolicySettings,
    PortContract,
    PortKind,
)
from app.policies import (
    LLM_MODEL_NOT_PINNED,
    RELEASE_MISSING_GOVERNANCE_METADATA,
    SENSITIVE_DATA_INTO_TOOL,
    TOO_MANY_MODEL_NODES,
    WORKSPACE_SCOPE,
    PolicySettingsInvalid,
    create_policy_exception,
    effective_policies,
    evaluate_graph_policies,
    evaluate_release_governance,
    graph_scope,
    save_policy_settings,
)
from app.releases import ReleasePublishBlocked, publish_release

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _settings(**rules: PolicyRuleSetting) -> PolicySettings:
    return PolicySettings(rules=dict(rules))


def _codes(diagnostics, code):
    return [d for d in diagnostics if d.code == code]


def _graph_with_sensitive_data_into_tool(classification: DataClassification) -> GraphDefinition:
    port = GraphPort(
        id="output",
        name="output",
        direction="output",
        contract=PortContract(kind=PortKind.MESSAGE, classification=classification),
    )
    return GraphDefinition(
        id="g1",
        name="g1",
        entry_node_id="source",
        nodes=[
            GraphNode(
                id="source",
                type=NodeType.INPUT,
                position=NodePosition(x=0, y=0),
                output_ports=[port],
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


def _unpinned_demo() -> GraphDefinition:
    graph = build_demo_graph()
    next(n for n in graph.nodes if n.type == NodeType.LLM).config.pop("model", None)
    return graph


def _model_heavy_graph(count: int) -> GraphDefinition:
    nodes = [
        GraphNode(id="entry", type=NodeType.INPUT, position=NodePosition(x=0, y=0)),
        *(
            GraphNode(
                id=f"llm{i}",
                type=NodeType.LLM,
                position=NodePosition(x=i, y=1),
                config={"model": "m"},
            )
            for i in range(count)
        ),
    ]
    return GraphDefinition(id="heavy", name="heavy", entry_node_id="entry", nodes=nodes, edges=[])


def test_defaults_come_from_the_catalog() -> None:
    effective = effective_policies("g1")
    assert effective[SENSITIVE_DATA_INTO_TOOL].enforcement == "block"
    assert effective[LLM_MODEL_NOT_PINNED].enforcement == "warn"
    assert effective[TOO_MANY_MODEL_NODES].params == {"max_model_nodes": 5}
    assert all(rule.enforcement_source == "default" for rule in effective.values())


def test_workspace_setting_applies_and_graph_override_wins() -> None:
    save_policy_settings(
        WORKSPACE_SCOPE, _settings(**{LLM_MODEL_NOT_PINNED: PolicyRuleSetting(enforcement="block")})
    )
    graph = _unpinned_demo()

    [diagnostic] = _codes(evaluate_graph_policies(graph), LLM_MODEL_NOT_PINNED)
    assert diagnostic.blocking and diagnostic.severity == "error"
    assert effective_policies(graph.id)[LLM_MODEL_NOT_PINNED].enforcement_source == "workspace"

    save_policy_settings(
        graph_scope(graph.id),
        _settings(**{LLM_MODEL_NOT_PINNED: PolicyRuleSetting(enforcement="warn")}),
    )
    [diagnostic] = _codes(evaluate_graph_policies(graph), LLM_MODEL_NOT_PINNED)
    assert not diagnostic.blocking and diagnostic.severity == "warning"
    assert effective_policies(graph.id)[LLM_MODEL_NOT_PINNED].enforcement_source == "graph"
    # Another graph still sees the workspace setting.
    assert effective_policies("other")[LLM_MODEL_NOT_PINNED].enforcement == "block"


def test_off_suppresses_the_rule() -> None:
    graph = _graph_with_sensitive_data_into_tool(DataClassification.CONFIDENTIAL)
    save_policy_settings(
        graph_scope(graph.id),
        _settings(**{SENSITIVE_DATA_INTO_TOOL: PolicyRuleSetting(enforcement="off")}),
    )
    assert _codes(evaluate_graph_policies(graph), SENSITIVE_DATA_INTO_TOOL) == []


def test_block_publish_warns_on_draft_and_blocks_publish() -> None:
    graph = _graph_with_sensitive_data_into_tool(DataClassification.CONFIDENTIAL)
    save_policy_settings(
        graph_scope(graph.id),
        _settings(**{SENSITIVE_DATA_INTO_TOOL: PolicyRuleSetting(enforcement="block_publish")}),
    )
    [draft] = _codes(validate_graph(graph), SENSITIVE_DATA_INTO_TOOL)
    assert draft.blocking is False and draft.severity == "warning"
    assert "Publishing is blocked" in draft.message
    assert draft.blocks_publish is True

    [publish] = _codes(evaluate_graph_policies(graph, gate="publish"), SENSITIVE_DATA_INTO_TOOL)
    assert publish.blocking is True

    with pytest.raises(ReleasePublishBlocked) as exc_info:
        publish_release(graph, release_notes="n", author="a")
    assert any(
        d.code == SENSITIVE_DATA_INTO_TOOL and d.blocking for d in exc_info.value.diagnostics
    )


def test_governance_rule_can_block_publish() -> None:
    save_policy_settings(
        WORKSPACE_SCOPE,
        _settings(**{RELEASE_MISSING_GOVERNANCE_METADATA: PolicyRuleSetting(enforcement="block")}),
    )
    [diagnostic] = evaluate_release_governance("g1", None, None)
    assert diagnostic.blocking is True
    with pytest.raises(ReleasePublishBlocked):
        publish_release(build_demo_graph())
    release, created = publish_release(build_demo_graph(), release_notes="n", author="a")
    assert created and release.id


def test_threshold_param_changes_behavior() -> None:
    graph = _model_heavy_graph(4)
    assert _codes(evaluate_graph_policies(graph), TOO_MANY_MODEL_NODES) == []
    save_policy_settings(
        graph_scope(graph.id),
        _settings(**{TOO_MANY_MODEL_NODES: PolicyRuleSetting(params={"max_model_nodes": 3})}),
    )
    [diagnostic] = _codes(evaluate_graph_policies(graph), TOO_MANY_MODEL_NODES)
    assert "over 3" in diagnostic.message
    effective = effective_policies(graph.id)[TOO_MANY_MODEL_NODES]
    assert effective.params == {"max_model_nodes": 3}
    assert effective.param_sources == {"max_model_nodes": "graph"}
    assert effective.enforcement_source == "default"


def test_min_classification_param() -> None:
    internal = _graph_with_sensitive_data_into_tool(DataClassification.INTERNAL)
    assert _codes(evaluate_graph_policies(internal), SENSITIVE_DATA_INTO_TOOL) == []
    save_policy_settings(
        WORKSPACE_SCOPE,
        _settings(
            **{
                SENSITIVE_DATA_INTO_TOOL: PolicyRuleSetting(
                    params={"min_classification": "internal"}
                )
            }
        ),
    )
    assert len(_codes(evaluate_graph_policies(internal), SENSITIVE_DATA_INTO_TOOL)) == 1

    confidential = _graph_with_sensitive_data_into_tool(DataClassification.CONFIDENTIAL)
    save_policy_settings(
        WORKSPACE_SCOPE,
        _settings(
            **{
                SENSITIVE_DATA_INTO_TOOL: PolicyRuleSetting(
                    params={"min_classification": "restricted"}
                )
            }
        ),
    )
    assert _codes(evaluate_graph_policies(confidential), SENSITIVE_DATA_INTO_TOOL) == []


def test_exception_still_waives_under_configured_enforcement() -> None:
    graph = _unpinned_demo()
    save_policy_settings(
        graph_scope(graph.id),
        _settings(**{LLM_MODEL_NOT_PINNED: PolicyRuleSetting(enforcement="block")}),
    )
    create_policy_exception(
        graph.id,
        policy_code=LLM_MODEL_NOT_PINNED,
        node_id=None,
        reason=None,
        expires_at="2099-01-01T00:00:00+00:00",
    )
    [diagnostic] = _codes(evaluate_graph_policies(graph), LLM_MODEL_NOT_PINNED)
    assert diagnostic.blocking is False
    assert "waived" in diagnostic.message


@pytest.mark.parametrize(
    "rules",
    [
        {"POLICY_NOPE": {"enforcement": "warn"}},
        {TOO_MANY_MODEL_NODES: {"params": {"nope": 1}}},
        {TOO_MANY_MODEL_NODES: {"params": {"max_model_nodes": 0}}},
        {TOO_MANY_MODEL_NODES: {"params": {"max_model_nodes": 2.5}}},
        {SENSITIVE_DATA_INTO_TOOL: {"params": {"min_classification": "secret"}}},
    ],
)
def test_invalid_settings_are_rejected(rules) -> None:
    with pytest.raises(PolicySettingsInvalid):
        save_policy_settings(WORKSPACE_SCOPE, PolicySettings.model_validate({"rules": rules}))
    response = client.put("/api/policies/workspace", json={"rules": rules})
    assert response.status_code == 422


def test_empty_rule_entries_are_dropped() -> None:
    saved = save_policy_settings(
        WORKSPACE_SCOPE,
        _settings(
            **{
                LLM_MODEL_NOT_PINNED: PolicyRuleSetting(),
                TOO_MANY_MODEL_NODES: PolicyRuleSetting(enforcement="off"),
            }
        ),
    )
    assert list(saved.rules) == [TOO_MANY_MODEL_NODES]
    assert saved.updated_at


def test_settings_routes_round_trip() -> None:
    storage.save_graph(build_demo_graph())
    graph_id = build_demo_graph().id

    catalog = client.get("/api/policies/catalog").json()
    assert {rule["code"] for rule in catalog} >= {
        SENSITIVE_DATA_INTO_TOOL,
        RELEASE_MISSING_GOVERNANCE_METADATA,
    }
    assert client.get("/api/policies/workspace").json()["rules"] == {}

    put = client.put(
        "/api/policies/workspace",
        json={"rules": {LLM_MODEL_NOT_PINNED: {"enforcement": "block_publish"}}},
    )
    assert put.status_code == 200, put.text
    assert (
        client.get("/api/policies/workspace").json()["rules"][LLM_MODEL_NOT_PINNED]["enforcement"]
        == "block_publish"
    )

    put = client.put(
        f"/api/graphs/{graph_id}/policies",
        json={"rules": {TOO_MANY_MODEL_NODES: {"params": {"max_model_nodes": 9}}}},
    )
    assert put.status_code == 200, put.text
    effective = {
        r["rule"]["code"]: r
        for r in client.get(f"/api/graphs/{graph_id}/policies/effective").json()
    }
    assert effective[LLM_MODEL_NOT_PINNED]["enforcement"] == "block_publish"
    assert effective[LLM_MODEL_NOT_PINNED]["enforcement_source"] == "workspace"
    assert effective[TOO_MANY_MODEL_NODES]["params"] == {"max_model_nodes": 9}

    workspace_effective = {
        r["rule"]["code"]: r for r in client.get("/api/policies/effective").json()
    }
    assert workspace_effective[TOO_MANY_MODEL_NODES]["params"] == {"max_model_nodes": 5}

    assert client.get("/api/graphs/missing/policies").status_code == 404
    assert client.put("/api/graphs/missing/policies", json={"rules": {}}).status_code == 404
    assert client.get("/api/graphs/missing/policies/effective").status_code == 404


def test_exception_update_and_list_all_routes() -> None:
    storage.save_graph(build_demo_graph())
    graph_id = build_demo_graph().id
    created = client.post(
        f"/api/graphs/{graph_id}/policy-exceptions",
        json={
            "policy_code": LLM_MODEL_NOT_PINNED,
            "reason": "first",
            "expires_at": "2000-01-01T00:00:00+00:00",
        },
    ).json()

    graph = _unpinned_demo()
    save_policy_settings(
        graph_scope(graph.id),
        _settings(**{LLM_MODEL_NOT_PINNED: PolicyRuleSetting(enforcement="block")}),
    )
    assert (
        _codes(evaluate_graph_policies(graph), LLM_MODEL_NOT_PINNED)[0].blocking is True
    )  # expired

    patched = client.patch(
        f"/api/graphs/{graph_id}/policy-exceptions/{created['id']}",
        json={"expires_at": "2099-01-01T00:00:00+00:00"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["expires_at"] == "2099-01-01T00:00:00+00:00"
    assert patched.json()["reason"] == "first"
    assert (
        _codes(evaluate_graph_policies(graph), LLM_MODEL_NOT_PINNED)[0].blocking is False
    )  # extended

    all_exceptions = client.get("/api/policy-exceptions").json()
    assert [(e["graph_id"], e["id"]) for e in all_exceptions] == [(graph_id, created["id"])]

    missing = client.patch(
        f"/api/graphs/{graph_id}/policy-exceptions/pexc_x",
        json={"expires_at": "2099-01-01T00:00:00+00:00"},
    )
    assert missing.status_code == 404


def test_waiving_a_block_publish_warning_clears_the_publish_block() -> None:
    graph = _graph_with_sensitive_data_into_tool(DataClassification.CONFIDENTIAL)
    save_policy_settings(
        graph_scope(graph.id),
        _settings(**{SENSITIVE_DATA_INTO_TOOL: PolicyRuleSetting(enforcement="block_publish")}),
    )
    create_policy_exception(
        graph.id,
        policy_code=SENSITIVE_DATA_INTO_TOOL,
        node_id="tool",
        reason=None,
        expires_at="2099-01-01T00:00:00+00:00",
    )
    [draft] = _codes(validate_graph(graph), SENSITIVE_DATA_INTO_TOOL)
    assert draft.blocks_publish is False
    assert "waived" in draft.message and "Publishing is blocked" not in draft.message
    release, created = publish_release(graph, release_notes="n", author="a")
    assert created and release.id


def test_warn_rules_never_block_publish() -> None:
    [diagnostic] = _codes(evaluate_graph_policies(_unpinned_demo()), LLM_MODEL_NOT_PINNED)
    assert diagnostic.blocks_publish is False
