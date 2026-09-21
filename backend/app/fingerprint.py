"""Canonical-JSON serialization and content-addressed graph fingerprints.

Part of the P0 graph foundation program
(docs/planning/features/p0-graph-foundation-design-plan.md), Slice A. Mirrors
the SDK's existing `fingerprintGraph`/`fingerprintGraphSemantics`
(packages/agent-graph-sdk/src/schema.ts) payload shape field-for-field so
both sides produce comparable output once `GraphRelease` (Slice C) stores
these values — but returns a real SHA-256 hex digest, not a raw JSON string,
per the design doc's "SHA-256 over canonical JSON" fingerprint definition.

Slice A scope: operates on `GraphDefinition` only — there is no `GraphRelease`
model yet, so `resource_snapshots`/`release_notes`/`author` are not part of
either payload here. Slice C extends `_semantic_payload` additively when it
adds `GraphRelease`, not by rewriting this module.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .models import GraphDefinition


def _canonical_json(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


def fingerprint_payload(payload: dict[str, Any]) -> str:
    """SHA-256 over the canonical JSON of an arbitrary payload — the same
    canonicalization this module's graph-specific fingerprints use,
    generalized for non-graph payloads (e.g. resource_versions.py's
    versioned reusable entity registry, P1 rollout plan)."""
    return hashlib.sha256(_canonical_json(payload)).hexdigest()


def _num(value: float) -> float | int:
    """JSON doesn't distinguish int/float, but Python's json.dumps renders a
    whole-number float as "1.0" while JS's JSON.stringify renders the same
    value as "1" — without this normalization the two languages' canonical
    JSON (and therefore their SHA-256 digests) would disagree for any node
    at a whole-number canvas position, which is the common case (including
    every node's x=0, y=0 default)."""
    return int(value) if value == int(value) else value


def _port_payload(port: Any) -> dict[str, Any]:
    return {
        "id": port.id,
        "name": port.name,
        "direction": port.direction,
        "contract": {
            "kind": port.contract.kind.value,
            "schema": port.contract.schema_,
            "required": port.contract.required,
            "classification": port.contract.classification.value
            if port.contract.classification
            else None,
        },
    }


def _transform_payload(transform: Any) -> dict[str, Any]:
    return {
        "type": transform.type,
        "pointer": transform.pointer,
        "field": transform.field,
        "template": transform.template,
        "target_type": transform.target_type,
    }


def _document_payload(graph: GraphDefinition) -> dict[str, Any]:
    return {
        "id": graph.id,
        "name": graph.name,
        "entry_node_id": graph.entry_node_id,
        "orientation": graph.orientation,
        "nodes": [
            {
                "id": node.id,
                "type": node.type.value,
                "position": {"x": _num(node.position.x), "y": _num(node.position.y)},
                "config": node.config,
                "input_ports": [_port_payload(p) for p in node.input_ports]
                if node.input_ports
                else None,
                "output_ports": [_port_payload(p) for p in node.output_ports]
                if node.output_ports
                else None,
                "extensions": node.extensions,
            }
            for node in graph.nodes
        ],
        "edges": [
            {
                "id": edge.id,
                "source": edge.source,
                "target": edge.target,
                "kind": edge.kind.value,
                "condition": edge.condition,
                "source_port": edge.source_port,
                "target_port": edge.target_port,
                "transform": _transform_payload(edge.transform) if edge.transform else None,
                "extensions": edge.extensions,
            }
            for edge in graph.edges
        ],
    }


def _semantic_payload(graph: GraphDefinition) -> dict[str, Any]:
    # Excludes node.position (canvas layout) — "moving a node must not
    # invalidate runtime reproducibility" (design doc, Fingerprint section).
    payload = _document_payload(graph)
    for node in payload["nodes"]:
        node.pop("position", None)
    return payload


def document_fingerprint(graph: GraphDefinition) -> str:
    """SHA-256 over the full canonical graph payload, including
    display-only fields (canvas position). Identifies this literal graph
    state as authored."""
    return hashlib.sha256(_canonical_json(_document_payload(graph))).hexdigest()


def semantic_fingerprint(graph: GraphDefinition) -> str:
    """SHA-256 over the execution-relevant subset of the graph payload,
    excluding canvas position. Identifies "what will actually run."""
    return hashlib.sha256(_canonical_json(_semantic_payload(graph))).hexdigest()


def _release_document_payload(
    graph: GraphDefinition,
    resource_snapshots: dict[str, dict[str, Any]],
    release_notes: str | None,
    author: str | None,
) -> dict[str, Any]:
    return {
        **_document_payload(graph),
        "resource_snapshots": resource_snapshots,
        "release_notes": release_notes,
        "author": author,
    }


def _release_semantic_payload(
    graph: GraphDefinition, resource_snapshots: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    # design doc, "Fingerprint": resource_snapshots is included in BOTH
    # fingerprints, not only document_fingerprint — swapping a bound tool
    # changes execution behavior even when a graph's own nodes/edges are
    # byte-identical, so two releases with different tool bindings must not
    # collide on semantic_fingerprint.
    return {**_semantic_payload(graph), "resource_snapshots": resource_snapshots}


def release_document_fingerprint(
    graph: GraphDefinition,
    resource_snapshots: dict[str, dict[str, Any]],
    release_notes: str | None = None,
    author: str | None = None,
) -> str:
    """SHA-256 over the full release payload — graph, resource_snapshots,
    release_notes, and author. Identifies this literal release record."""
    payload = _release_document_payload(graph, resource_snapshots, release_notes, author)
    return hashlib.sha256(_canonical_json(payload)).hexdigest()


def release_semantic_fingerprint(
    graph: GraphDefinition, resource_snapshots: dict[str, dict[str, Any]]
) -> str:
    """SHA-256 over the execution-relevant release payload: the graph's
    semantic_fingerprint content plus resource_snapshots. Identifies "what
    will actually run" for a release, including its embedded resource
    bindings. Publish is idempotent on this value (see releases.py)."""
    payload = _release_semantic_payload(graph, resource_snapshots)
    return hashlib.sha256(_canonical_json(payload)).hexdigest()


def _node_payload_by_id(graph: GraphDefinition) -> dict[str, dict[str, Any]]:
    return {node["id"]: node for node in _semantic_payload(graph)["nodes"]}


def _edge_payload_by_id(graph: GraphDefinition) -> dict[str, dict[str, Any]]:
    return {edge["id"]: edge for edge in _semantic_payload(graph)["edges"]}


def _diff_by_id(
    before: dict[str, dict[str, Any]], after: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    """Categorizes each id present in either side as added, removed, or
    (when present on both sides but with differing field values) modified,
    with modified entries carrying a per-field {"from": ..., "to": ...}
    breakdown. `id` itself is never reported as a changed field — it's the
    key these two dicts are already matched on."""
    changes: list[dict[str, Any]] = []
    for element_id in sorted(set(before) | set(after)):
        if element_id not in before:
            changes.append({"id": element_id, "change": "added", "fields": {}})
            continue
        if element_id not in after:
            changes.append({"id": element_id, "change": "removed", "fields": {}})
            continue
        before_fields = before[element_id]
        after_fields = after[element_id]
        fields = {
            key: {"from": before_fields.get(key), "to": after_fields.get(key)}
            for key in sorted(set(before_fields) | set(after_fields))
            if key != "id" and before_fields.get(key) != after_fields.get(key)
        }
        if fields:
            changes.append({"id": element_id, "change": "modified", "fields": fields})
    return changes


def diff_graphs(
    graph_a: GraphDefinition,
    graph_b: GraphDefinition,
    resource_snapshots_a: dict[str, dict[str, Any]] | None = None,
    resource_snapshots_b: dict[str, dict[str, Any]] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Categorized behavior-level deltas between two graphs (P1 rollout
    plan, Slice A: "semantic release comparison"). Node and edge deltas are
    computed over `_semantic_payload`'s shape, so node config, edge/router
    config, and port/contract changes are all captured as field-level
    diffs, and canvas-position-only edits never appear. `resource_snapshots`
    deltas are computed the same way when both sides are given — each
    snapshot's payload is itself a flat-ish dict, so the same per-field
    diff applies. Returns raw dicts matching `GraphElementChange`'s shape
    (not the Pydantic model itself, which lives in `models.py` — callers
    that need the model validate these dicts into it, e.g.
    `releases.compare_releases`)."""
    return {
        "node_changes": _diff_by_id(_node_payload_by_id(graph_a), _node_payload_by_id(graph_b)),
        "edge_changes": _diff_by_id(_edge_payload_by_id(graph_a), _edge_payload_by_id(graph_b)),
        "resource_changes": _diff_by_id(resource_snapshots_a or {}, resource_snapshots_b or {}),
    }


__all__ = [
    "document_fingerprint",
    "semantic_fingerprint",
    "release_document_fingerprint",
    "release_semantic_fingerprint",
    "diff_graphs",
    "fingerprint_payload",
]
