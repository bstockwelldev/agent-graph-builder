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


__all__ = ["document_fingerprint", "semantic_fingerprint"]
