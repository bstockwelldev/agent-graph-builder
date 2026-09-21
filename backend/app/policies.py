"""Cross-cutting policy overlays.

Part of P2 (docs/planning/roadmap.md's Strategic Roadmap Addendum):
"Security/privacy, reliability, cost/performance, and governance overlays
with compile/deploy gates and exception expiry." A first, deliberately
small vertical slice — one concrete rule per overlay category, not a
general-purpose configurable rule engine — proving the shape end to end:
policy diagnostics reuse the `category="policy"` field Slice A already
reserved on `Diagnostic` (never populated by anything until now), a
compile-time pass (`evaluate_graph_policies`, called from `compiler.py`'s
existing `validate_graph`) and a publish-time pass
(`evaluate_release_governance`, called from `releases.py`'s
`publish_release`) are the two gates the design doc names, and a stored,
time-boxed `PolicyException` can waive a specific diagnostic on a specific
graph (optionally one node) rather than either hard-blocking forever or
silently dropping the check.

A waived diagnostic still appears — with `blocking=False` and a note that
an exception is active — rather than disappearing, so a waiver is always
visible, not a silent exemption. An expired exception simply stops
matching (plain ISO-8601 UTC string comparison against `now_iso()`, the
same comparison convention `storage.py`'s created_at ordering already
relies on) and the diagnostic goes back to blocking.
"""

from __future__ import annotations

from uuid import uuid4

from . import storage
from .events import now_iso
from .models import DataClassification, Diagnostic, GraphDefinition, NodeType, PolicyException
from .ports import default_output_port, find_output_port

# Reliability/cost thresholds are deliberately simple constants for this
# first slice, not per-graph configurable policy parameters.
_SENSITIVE_CLASSIFICATIONS = frozenset(
    {DataClassification.CONFIDENTIAL, DataClassification.RESTRICTED}
)
_MAX_MODEL_NODES_BEFORE_COST_WARNING = 5


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


def _apply_exceptions(
    diagnostics: list[Diagnostic], exceptions: list[dict[str, object]]
) -> list[Diagnostic]:
    applied: list[Diagnostic] = []
    for diagnostic in diagnostics:
        if diagnostic.blocking and _is_waived(exceptions, diagnostic.code, diagnostic.node_id):
            diagnostic = diagnostic.model_copy(
                update={
                    "blocking": False,
                    "message": f"{diagnostic.message} (waived by an active policy exception)",
                }
            )
        applied.append(diagnostic)
    return applied


def _check_sensitive_data_into_tool(graph: GraphDefinition) -> list[Diagnostic]:
    """Security/privacy overlay: a CONFIDENTIAL- or RESTRICTED-classified
    output feeding directly into a `tool` node is flagged — tool nodes may
    dispatch to an external MCP server or fall back to a mock-echo that
    surfaces its input verbatim (nodes.py's compute_tool), either of which
    can leak sensitive data outside the graph's own trust boundary."""
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
        if classification not in _SENSITIVE_CLASSIFICATIONS:
            continue
        diagnostics.append(
            Diagnostic(
                severity="error",
                category="policy",
                code="POLICY_SENSITIVE_DATA_INTO_TOOL",
                node_id=target_node.id,
                edge_id=edge.id,
                port_id=source_port.id,
                message=(
                    f"Edge {edge.id!r} carries {source_port.contract.classification.value} data "
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


def _check_llm_model_not_pinned(graph: GraphDefinition) -> list[Diagnostic]:
    """Reliability overlay: an `llm` node with no explicit `model` silently
    depends on the caller's default at run time — different behavior for
    the same graph depending on who runs it."""
    diagnostics: list[Diagnostic] = []
    for node in graph.nodes:
        if node.type != NodeType.LLM or node.config.get("model"):
            continue
        diagnostics.append(
            Diagnostic(
                severity="warning",
                category="policy",
                code="POLICY_LLM_MODEL_NOT_PINNED",
                node_id=node.id,
                message=(
                    f"LLM node {node.id!r} has no pinned model — "
                    "behavior depends on the caller's default."
                ),
                remediation="Set an explicit model in this node's config.",
                blocking=False,
            )
        )
    return diagnostics


def _check_model_node_count(graph: GraphDefinition) -> list[Diagnostic]:
    """Cost/performance overlay: a rough proxy for per-run spend and
    latency risk — count of LLM/tool_loop nodes above a fixed threshold."""
    model_node_types = {NodeType.LLM, NodeType.TOOL_LOOP}
    count = sum(1 for n in graph.nodes if n.type in model_node_types)
    if count <= _MAX_MODEL_NODES_BEFORE_COST_WARNING:
        return []
    return [
        Diagnostic(
            severity="warning",
            category="policy",
            code="POLICY_TOO_MANY_MODEL_NODES",
            message=(
                f"Graph {graph.id!r} has {count} LLM/tool_loop nodes "
                f"(over {_MAX_MODEL_NODES_BEFORE_COST_WARNING}) — review for cost/latency risk."
            ),
            blocking=False,
        )
    ]


def evaluate_graph_policies(graph: GraphDefinition) -> list[Diagnostic]:
    """The compile gate: security, reliability, and cost overlays, with any
    matching, non-expired `PolicyException` for `graph.id` already applied.
    Called from `compiler.py`'s `validate_graph`, so every existing caller
    (`/validate`, `/compile`, publish) gets policy diagnostics for free —
    the same wiring `contracts.py`'s `validate_contracts` already uses."""
    diagnostics = [
        *_check_sensitive_data_into_tool(graph),
        *_check_llm_model_not_pinned(graph),
        *_check_model_node_count(graph),
    ]
    exceptions = storage.list_policy_exceptions(graph.id)
    return _apply_exceptions(diagnostics, exceptions)


def evaluate_release_governance(
    graph_id: str, release_notes: str | None, author: str | None
) -> list[Diagnostic]:
    """The deploy gate: governance overlay. Called from `releases.py`'s
    `publish_release` only — a draft compile has no release_notes/author
    to check, so this never runs at compile time."""
    if release_notes and author:
        diagnostics: list[Diagnostic] = []
    else:
        diagnostics = [
            Diagnostic(
                severity="warning",
                category="policy",
                code="POLICY_RELEASE_MISSING_GOVERNANCE_METADATA",
                message="Release published without both release_notes and an author.",
                remediation=(
                    "Record who published this release and why before relying on it in production."
                ),
                blocking=False,
            )
        ]
    exceptions = storage.list_policy_exceptions(graph_id)
    return _apply_exceptions(diagnostics, exceptions)


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


def delete_policy_exception(graph_id: str, exception_id: str) -> bool:
    return storage.delete_policy_exception(graph_id, exception_id)


__all__ = [
    "evaluate_graph_policies",
    "evaluate_release_governance",
    "create_policy_exception",
    "list_graph_policy_exceptions",
    "delete_policy_exception",
]
