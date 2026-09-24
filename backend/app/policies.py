"""Cross-cutting policy overlays.

Part of P2 (docs/planning/roadmap.md's Strategic Roadmap Addendum):
"Security/privacy, reliability, cost/performance, and governance overlays
with compile/deploy gates and exception expiry."

Rules live in `POLICY_CATALOG`, one or more per overlay category. Since
STO-608 each rule's enforcement (off / warn / block_publish / block) and
parameters are configurable: catalog default → workspace settings →
per-graph override, resolved by `effective_policies`. Two gates:

- the compile gate (`evaluate_graph_policies`, from `compiler.py`'s
  `validate_graph`) -- `block_publish` rules are warnings here, so drafts
  still run;
- the publish gate (the same rules with `gate="publish"`, plus
  `evaluate_release_governance`, from `releases.py`'s `publish_release`)
  -- `block_publish` rules block here.

A stored, time-boxed `PolicyException` can waive a specific diagnostic on
a specific graph (optionally one node). A waived diagnostic still appears
-- with `blocking=False` and a note -- so a waiver is always visible, not
a silent exemption. An expired exception simply stops matching (ISO-8601
UTC string comparison against `now_iso()`) and the diagnostic blocks again.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Literal
from uuid import uuid4

from . import storage
from .events import now_iso
from .models import (
    DataClassification,
    Diagnostic,
    EffectivePolicyRule,
    GraphDefinition,
    NodeType,
    PolicyEnforcement,
    PolicyException,
    PolicyGate,
    PolicyParamSpec,
    PolicyParamValue,
    PolicyRuleInfo,
    PolicyRuleSetting,
    PolicySettings,
)
from .ports import default_output_port, find_output_port

# ---------------------------------------------------------------------------
# Rule catalog (STO-608). Each rule's thresholds are parameters, and its
# enforcement is configurable per workspace and per graph -- the rule
# functions below only find violations; `_enforce` decides severity and
# blocking from the effective enforcement and the gate being evaluated.
# ---------------------------------------------------------------------------

SENSITIVE_DATA_INTO_TOOL = "POLICY_SENSITIVE_DATA_INTO_TOOL"
LLM_MODEL_NOT_PINNED = "POLICY_LLM_MODEL_NOT_PINNED"
TOO_MANY_MODEL_NODES = "POLICY_TOO_MANY_MODEL_NODES"
RELEASE_MISSING_GOVERNANCE_METADATA = "POLICY_RELEASE_MISSING_GOVERNANCE_METADATA"

_CLASSIFICATION_ORDER = [c.value for c in DataClassification]

POLICY_CATALOG: tuple[PolicyRuleInfo, ...] = (
    PolicyRuleInfo(
        code=SENSITIVE_DATA_INTO_TOOL,
        category="security",
        title="Sensitive data into a tool",
        description=(
            "Flags an edge that carries classified data straight into a tool node, which may "
            "dispatch it to an external MCP server or echo it verbatim."
        ),
        gate="compile",
        default_enforcement="block",
        params=[
            PolicyParamSpec(
                name="min_classification",
                label="Minimum classification",
                type="choice",
                default=DataClassification.CONFIDENTIAL.value,
                choices=_CLASSIFICATION_ORDER,
                description="Data at or above this classification is flagged.",
            )
        ],
    ),
    PolicyRuleInfo(
        code=LLM_MODEL_NOT_PINNED,
        category="reliability",
        title="LLM model not pinned",
        description=(
            "Flags an LLM node with no explicit model, whose behavior then depends on the "
            "caller's default."
        ),
        gate="compile",
        default_enforcement="warn",
    ),
    PolicyRuleInfo(
        code=TOO_MANY_MODEL_NODES,
        category="cost",
        title="Too many model nodes",
        description="A proxy for per-run spend and latency: LLM and tool-loop nodes over a limit.",
        gate="compile",
        default_enforcement="warn",
        params=[
            PolicyParamSpec(
                name="max_model_nodes",
                label="Maximum model nodes",
                type="integer",
                default=5,
                minimum=1,
                description="More LLM/tool-loop nodes than this is flagged.",
            )
        ],
    ),
    PolicyRuleInfo(
        code=RELEASE_MISSING_GOVERNANCE_METADATA,
        category="governance",
        title="Release governance metadata",
        description="Flags a release published without both release notes and an author.",
        gate="publish",
        default_enforcement="warn",
    ),
)

_CATALOG_BY_CODE = {rule.code: rule for rule in POLICY_CATALOG}

WORKSPACE_SCOPE = "workspace"


def graph_scope(graph_id: str) -> str:
    return f"graph:{graph_id}"


class PolicySettingsInvalid(ValueError):
    pass


def validate_policy_settings(settings: PolicySettings) -> PolicySettings:
    """Rejects unknown rules/params and out-of-range values; drops empty
    entries so a stored document only holds real overrides."""
    cleaned: dict[str, PolicyRuleSetting] = {}
    for code, setting in settings.rules.items():
        rule = _CATALOG_BY_CODE.get(code)
        if rule is None:
            raise PolicySettingsInvalid(f"unknown policy rule {code!r}")
        specs = {spec.name: spec for spec in rule.params}
        for name, value in setting.params.items():
            spec = specs.get(name)
            if spec is None:
                raise PolicySettingsInvalid(f"rule {code!r} has no parameter {name!r}")
            if spec.type == "integer":
                if (
                    isinstance(value, bool)
                    or not isinstance(value, int | float)
                    or int(value) != value
                ):
                    raise PolicySettingsInvalid(f"{code}.{name} must be an integer")
                if spec.minimum is not None and value < spec.minimum:
                    raise PolicySettingsInvalid(f"{code}.{name} must be >= {spec.minimum}")
            elif spec.choices is not None and value not in spec.choices:
                raise PolicySettingsInvalid(f"{code}.{name} must be one of {spec.choices}")
        params = {
            k: (int(v) if specs[k].type == "integer" else v) for k, v in setting.params.items()
        }
        if setting.enforcement is not None or params:
            cleaned[code] = PolicyRuleSetting(enforcement=setting.enforcement, params=params)
    return PolicySettings(rules=cleaned, updated_at=settings.updated_at)


def get_policy_settings(scope: str) -> PolicySettings:
    payload = storage.get_policy_settings(scope)
    return PolicySettings.model_validate(payload) if payload else PolicySettings()


def save_policy_settings(scope: str, settings: PolicySettings) -> PolicySettings:
    cleaned = validate_policy_settings(settings)
    cleaned.updated_at = now_iso()
    storage.save_policy_settings(scope, cleaned.model_dump(mode="json"))
    return cleaned


def effective_policies(graph_id: str | None = None) -> dict[str, EffectivePolicyRule]:
    """Each rule's enforcement and params after catalog default →
    workspace → graph override, with where each value came from."""
    workspace = get_policy_settings(WORKSPACE_SCOPE)
    graph = get_policy_settings(graph_scope(graph_id)) if graph_id else PolicySettings()
    effective: dict[str, EffectivePolicyRule] = {}
    for rule in POLICY_CATALOG:
        enforcement: PolicyEnforcement = rule.default_enforcement
        source: Literal["default", "workspace", "graph"] = "default"
        params: dict[str, PolicyParamValue] = {spec.name: spec.default for spec in rule.params}
        param_sources: dict[str, Literal["default", "workspace", "graph"]] = {
            spec.name: "default" for spec in rule.params
        }
        for scope_name, scope in (("workspace", workspace), ("graph", graph)):
            setting = scope.rules.get(rule.code)
            if setting is None:
                continue
            if setting.enforcement is not None:
                enforcement, source = setting.enforcement, scope_name
            for name, value in setting.params.items():
                if name in params:
                    params[name], param_sources[name] = value, scope_name
        effective[rule.code] = EffectivePolicyRule(
            rule=rule,
            enforcement=enforcement,
            enforcement_source=source,
            params=params,
            param_sources=param_sources,
        )
    return effective


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


def _is_waived(exceptions: list[dict[str, object]], code: str, node_id: str | None) -> bool:
    now = now_iso()
    for exception in exceptions:
        if exception.get("policy_code") != code:
            continue
        exception_node_id = exception.get("node_id")
        if exception_node_id is not None and exception_node_id != node_id:
            continue
        if str(exception.get("expires_at", "")) > now:
            return True
    return False


def _enforce(
    diagnostics: list[Diagnostic],
    enforcement: PolicyEnforcement,
    gate: PolicyGate,
    exceptions: list[dict[str, object]],
) -> list[Diagnostic]:
    """Sets severity/blocking from the effective enforcement at `gate`, and
    applies waivers: a waived diagnostic stays visible (non-blocking, with a
    note) rather than disappearing."""
    if enforcement == "off":
        return []
    would_block_publish = enforcement in ("block", "block_publish")
    blocking = enforcement == "block" or (enforcement == "block_publish" and gate == "publish")
    enforced: list[Diagnostic] = []
    for diagnostic in diagnostics:
        message = diagnostic.message
        waived = would_block_publish and _is_waived(exceptions, diagnostic.code, diagnostic.node_id)
        if waived:
            message = f"{message} (waived by an active policy exception)"
        elif enforcement == "block_publish" and gate == "compile":
            message = f"{message} Publishing is blocked until this is fixed or waived."
        enforced.append(
            diagnostic.model_copy(
                update={
                    "severity": "error" if blocking and not waived else "warning",
                    "blocking": blocking and not waived,
                    "blocks_publish": would_block_publish and not waived,
                    "message": message,
                }
            )
        )
    return enforced


# ---------------------------------------------------------------------------
# Rules -- each returns its violations; severity/blocking are set by _enforce.
# ---------------------------------------------------------------------------


def _check_sensitive_data_into_tool(
    graph: GraphDefinition, params: dict[str, PolicyParamValue]
) -> list[Diagnostic]:
    """Security overlay: data classified at or above `min_classification`
    feeding directly into a `tool` node -- tool nodes may dispatch to an
    external MCP server or fall back to a mock-echo that surfaces its input
    verbatim (nodes.py's compute_tool), either of which can leak it."""
    minimum = str(params.get("min_classification", DataClassification.CONFIDENTIAL.value))
    threshold = _CLASSIFICATION_ORDER.index(minimum) if minimum in _CLASSIFICATION_ORDER else 2
    nodes_by_id = {n.id: n for n in graph.nodes}
    diagnostics: list[Diagnostic] = []
    for edge in graph.edges:
        target_node = nodes_by_id.get(edge.target)
        source_node = nodes_by_id.get(edge.source)
        if target_node is None or source_node is None or target_node.type != NodeType.TOOL:
            continue
        source_port = (
            find_output_port(source_node, edge.source_port)
            if edge.source_port
            else default_output_port(source_node)
        )
        classification = source_port.contract.classification if source_port else None
        if classification is None or _CLASSIFICATION_ORDER.index(classification.value) < threshold:
            continue
        diagnostics.append(
            Diagnostic(
                severity="error",
                category="policy",
                code=SENSITIVE_DATA_INTO_TOOL,
                node_id=target_node.id,
                edge_id=edge.id,
                port_id=source_port.id,
                message=(
                    f"Edge {edge.id!r} carries {classification.value} data "
                    f"from {source_node.id!r} directly into tool node {target_node.id!r}."
                ),
                remediation=(
                    "Route through a guardrail node first, bind the tool to a trusted MCP "
                    "server, or grant a time-boxed policy exception if this is intentional."
                ),
                blocking=True,
            )
        )
    return diagnostics


def _check_llm_model_not_pinned(
    graph: GraphDefinition, params: dict[str, PolicyParamValue]
) -> list[Diagnostic]:
    """Reliability overlay: an `llm` node with no explicit `model` silently
    depends on the caller's default at run time."""
    return [
        Diagnostic(
            severity="warning",
            category="policy",
            code=LLM_MODEL_NOT_PINNED,
            node_id=node.id,
            message=(
                f"LLM node {node.id!r} has no pinned model — "
                "behavior depends on the caller's default."
            ),
            remediation="Set an explicit model in this node's config.",
            blocking=False,
        )
        for node in graph.nodes
        if node.type == NodeType.LLM and not node.config.get("model")
    ]


def _check_model_node_count(
    graph: GraphDefinition, params: dict[str, PolicyParamValue]
) -> list[Diagnostic]:
    """Cost/performance overlay: LLM/tool_loop node count over a limit."""
    limit = int(params.get("max_model_nodes", 5))
    model_node_types = {NodeType.LLM, NodeType.TOOL_LOOP}
    count = sum(1 for n in graph.nodes if n.type in model_node_types)
    if count <= limit:
        return []
    return [
        Diagnostic(
            severity="warning",
            category="policy",
            code=TOO_MANY_MODEL_NODES,
            message=(
                f"Graph {graph.id!r} has {count} LLM/tool_loop nodes "
                f"(over {limit}) — review for cost/latency risk."
            ),
            remediation="Consolidate model calls, or raise the limit in this graph's policies.",
            blocking=False,
        )
    ]


_GRAPH_RULES: dict[
    str, Callable[[GraphDefinition, dict[str, PolicyParamValue]], list[Diagnostic]]
] = {
    SENSITIVE_DATA_INTO_TOOL: _check_sensitive_data_into_tool,
    LLM_MODEL_NOT_PINNED: _check_llm_model_not_pinned,
    TOO_MANY_MODEL_NODES: _check_model_node_count,
}


def evaluate_graph_policies(
    graph: GraphDefinition, *, gate: PolicyGate = "compile"
) -> list[Diagnostic]:
    """The compile gate (and, with `gate="publish"`, the graph half of the
    deploy gate): every graph rule at its effective enforcement, with any
    matching, non-expired `PolicyException` for `graph.id` applied. Called
    from `compiler.py`'s `validate_graph`."""
    effective = effective_policies(graph.id)
    exceptions = storage.list_policy_exceptions(graph.id)
    diagnostics: list[Diagnostic] = []
    for code, check in _GRAPH_RULES.items():
        rule = effective[code]
        if rule.enforcement == "off":
            continue
        diagnostics.extend(_enforce(check(graph, rule.params), rule.enforcement, gate, exceptions))
    return diagnostics


def evaluate_release_governance(
    graph_id: str, release_notes: str | None, author: str | None
) -> list[Diagnostic]:
    """The deploy gate's governance overlay. Called from `releases.py`'s
    `publish_release` only -- a draft has no release_notes/author."""
    rule = effective_policies(graph_id)[RELEASE_MISSING_GOVERNANCE_METADATA]
    if release_notes and author:
        return []
    diagnostics = [
        Diagnostic(
            severity="warning",
            category="policy",
            code=RELEASE_MISSING_GOVERNANCE_METADATA,
            message="Release published without both release_notes and an author.",
            remediation=(
                "Record who published this release and why before relying on it in production."
            ),
            blocking=False,
        )
    ]
    return _enforce(
        diagnostics, rule.enforcement, "publish", storage.list_policy_exceptions(graph_id)
    )


def create_policy_exception(
    graph_id: str, *, policy_code: str, node_id: str | None, reason: str | None, expires_at: str
) -> PolicyException:
    exception = PolicyException(
        id=f"pexc_{uuid4().hex[:12]}",
        graph_id=graph_id,
        policy_code=policy_code,
        node_id=node_id,
        reason=reason,
        created_at=now_iso(),
        expires_at=expires_at,
    )
    storage.save_policy_exception(graph_id, exception.id, exception.model_dump(mode="json"))
    return exception


def list_graph_policy_exceptions(graph_id: str) -> list[PolicyException]:
    return [PolicyException.model_validate(e) for e in storage.list_policy_exceptions(graph_id)]


def list_all_policy_exceptions() -> list[PolicyException]:
    return [PolicyException.model_validate(e) for e in storage.list_all_policy_exceptions()]


def update_policy_exception(
    graph_id: str, exception_id: str, *, expires_at: str, reason: str | None
) -> PolicyException | None:
    existing = storage.get_policy_exception(graph_id, exception_id)
    if existing is None:
        return None
    updated = PolicyException.model_validate(
        {
            **existing,
            "expires_at": expires_at,
            "reason": reason if reason is not None else existing.get("reason"),
        }
    )
    storage.update_policy_exception(graph_id, exception_id, updated.model_dump(mode="json"))
    return updated


def delete_policy_exception(graph_id: str, exception_id: str) -> bool:
    return storage.delete_policy_exception(graph_id, exception_id)


__all__ = [
    "POLICY_CATALOG",
    "WORKSPACE_SCOPE",
    "PolicySettingsInvalid",
    "graph_scope",
    "validate_policy_settings",
    "get_policy_settings",
    "save_policy_settings",
    "effective_policies",
    "list_all_policy_exceptions",
    "update_policy_exception",
    "evaluate_graph_policies",
    "evaluate_release_governance",
    "create_policy_exception",
    "list_graph_policy_exceptions",
    "delete_policy_exception",
]
