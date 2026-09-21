"""Release publishing.

Part of the P0 graph foundation program
(docs/planning/features/p0-graph-foundation-design-plan.md), Slice C:
"Immutable releases and capability reports". Orchestrates the publish
pipeline — validate, resolve and embed resource_snapshots, fingerprint,
dedupe — that `main.py`'s `/api/graphs/{id}/releases` route calls.
"""

from __future__ import annotations

import copy
from typing import Any
from uuid import uuid4

from . import storage
from .builtin_tools import BUILTIN_TOOL_IDS
from .compiler import validate_graph
from .events import now_iso
from .fingerprint import diff_graphs, release_document_fingerprint, release_semantic_fingerprint
from .models import Diagnostic, GraphDefinition, GraphRelease, NodeType, ReleaseDiff
from .policies import evaluate_release_governance
from .resource_models import ToolDefinition

# The original POC demo tool — like the two builtins, it's code, not a
# stored resource (see compiler.py's _KNOWN_TOOL_IDS), so it never needs a
# resource_snapshots entry.
_DEMO_TOOL_ID = "lookup_topic"


class ReleasePublishBlocked(Exception):
    """Raised when structural, contract, or resource-resolution diagnostics
    block a publish. `diagnostics` is the full report, mirroring
    CompileResult's shape for the route layer to translate into a 422."""

    def __init__(self, diagnostics: list[Diagnostic]) -> None:
        self.diagnostics = diagnostics
        super().__init__("release publish blocked by diagnostics")


def resolve_resource_snapshots(
    graph: GraphDefinition,
) -> tuple[dict[str, dict[str, Any]], list[Diagnostic]]:
    """Deep-copies every `tools`/`mcp_servers`/`knowledge` resource this
    graph's nodes resolve live today (design doc, "Resource
    reproducibility") — everything `nodes.py`'s `compute_tool` and
    knowledge augmentation would otherwise fetch from live storage at
    execution time. A reference that doesn't resolve produces a blocking
    `RELEASE_RESOURCE_UNRESOLVED` diagnostic instead of silently shipping a
    release that isn't actually reproducible.
    """
    snapshots: dict[str, dict[str, Any]] = {}
    diagnostics: list[Diagnostic] = []

    for node in graph.nodes:
        if node.type != NodeType.TOOL:
            continue
        tool_name = node.config.get("toolName")
        if tool_name is None or tool_name == _DEMO_TOOL_ID or tool_name in BUILTIN_TOOL_IDS:
            continue

        resource = storage.get_resource("tools", tool_name)
        if resource is None:
            diagnostics.append(
                Diagnostic(
                    severity="error",
                    category="capability",
                    code="RELEASE_RESOURCE_UNRESOLVED",
                    node_id=node.id,
                    message=f"Tool node {node.id!r} references unresolved tool {tool_name!r}",
                    blocking=True,
                )
            )
            continue
        snapshots[f"tools:{tool_name}"] = copy.deepcopy(resource)

        tool_def = ToolDefinition.model_validate(resource)
        if tool_def.mcp_server_id:
            server = storage.get_resource("mcp_servers", tool_def.mcp_server_id)
            if server is None:
                diagnostics.append(
                    Diagnostic(
                        severity="error",
                        category="capability",
                        code="RELEASE_RESOURCE_UNRESOLVED",
                        node_id=node.id,
                        message=(
                            f"Tool node {node.id!r} (tool {tool_name!r}) references unresolved "
                            f"MCP server {tool_def.mcp_server_id!r}"
                        ),
                        blocking=True,
                    )
                )
            else:
                snapshots[f"mcp_servers:{tool_def.mcp_server_id}"] = copy.deepcopy(server)

    knowledge = storage.get_resource("knowledge", graph.id)
    if knowledge is not None:
        snapshots[f"knowledge:{graph.id}"] = copy.deepcopy(knowledge)

    return snapshots, diagnostics


def publish_release(
    graph: GraphDefinition, *, release_notes: str | None = None, author: str | None = None
) -> tuple[GraphRelease, bool]:
    """Publishes an immutable release for `graph`. Returns `(release,
    created)`: `created=False` when an existing release for this `graph_id`
    already has the candidate's `semantic_fingerprint` — publish is
    idempotent on that value alone (design doc, "Fingerprint"), so
    republishing an unchanged graph never creates a duplicate even if
    `release_notes`/`author` differ.

    Raises `ReleasePublishBlocked` when structural, contract, or
    resource-resolution diagnostics are blocking — a release is only
    created "after clean LangGraph capability validation" (design doc,
    Slice C).
    """
    diagnostics = validate_graph(graph)
    resource_snapshots, resource_diagnostics = resolve_resource_snapshots(graph)
    # P2, "Cross-cutting policy overlays": the deploy gate. validate_graph
    # above already ran the compile-gate policies (security/reliability/
    # cost, via compiler.py); this is the one governance check that only
    # makes sense at publish time, since a draft has no release_notes/author.
    governance_diagnostics = evaluate_release_governance(graph.id, release_notes, author)
    diagnostics = [*diagnostics, *resource_diagnostics, *governance_diagnostics]
    if any(d.blocking for d in diagnostics):
        raise ReleasePublishBlocked(diagnostics)

    semantic_fp = release_semantic_fingerprint(graph, resource_snapshots)
    for entry in storage.get_release_index(graph.id):
        if entry["semantic_fingerprint"] != semantic_fp:
            continue
        existing_payload = storage.get_release(entry["release_id"], graph.id)
        if existing_payload is not None:
            return GraphRelease.model_validate(existing_payload), False

    document_fp = release_document_fingerprint(graph, resource_snapshots, release_notes, author)
    release_id = f"rel_{uuid4().hex[:12]}"
    created_at = now_iso()
    release = GraphRelease(
        id=release_id,
        graph_id=graph.id,
        graph=graph,
        document_fingerprint=document_fp,
        semantic_fingerprint=semantic_fp,
        resource_snapshots=resource_snapshots,
        release_notes=release_notes,
        author=author,
        created_at=created_at,
        diagnostics=diagnostics,
    )
    storage.save_release(
        release_id,
        graph.id,
        release.model_dump(mode="json"),
        semantic_fingerprint=semantic_fp,
        document_fingerprint=document_fp,
        created_at=created_at,
    )
    return release, True


def get_release(release_id: str, graph_id: str) -> GraphRelease | None:
    payload = storage.get_release(release_id, graph_id)
    if payload is None:
        return None
    return GraphRelease.model_validate(payload)


def list_releases(graph_id: str) -> list[dict[str, Any]]:
    return storage.get_release_index(graph_id)


def compare_releases(from_release: GraphRelease, to_release: GraphRelease) -> ReleaseDiff:
    """P1 rollout plan, Slice A: a categorized behavior-level diff between
    two releases — node config, edge/router, and port/contract deltas from
    `fingerprint.diff_graphs`, plus resource_snapshots deltas. `identical`
    is true exactly when the two releases' `semantic_fingerprint` match,
    the same equality `publish_release` already uses for idempotency."""
    deltas = diff_graphs(
        from_release.graph,
        to_release.graph,
        from_release.resource_snapshots,
        to_release.resource_snapshots,
    )
    return ReleaseDiff(
        from_release_id=from_release.id,
        to_release_id=to_release.id,
        from_semantic_fingerprint=from_release.semantic_fingerprint,
        to_semantic_fingerprint=to_release.semantic_fingerprint,
        identical=from_release.semantic_fingerprint == to_release.semantic_fingerprint,
        node_changes=deltas["node_changes"],
        edge_changes=deltas["edge_changes"],
        resource_changes=deltas["resource_changes"],
    )


__all__ = [
    "ReleasePublishBlocked",
    "resolve_resource_snapshots",
    "publish_release",
    "get_release",
    "list_releases",
    "compare_releases",
]
