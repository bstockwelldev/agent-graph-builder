import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

import { edgeKindSchema, nodeTypeSchema } from "./schemas.js";
import type {
  EdgeKind,
  EdgeTransform,
  GraphDefinition,
  GraphEdge,
  GraphNode,
  GraphPort,
  NodeType,
} from "./types.js";

export const NODE_TYPES = nodeTypeSchema.options;
export const EDGE_KINDS = edgeKindSchema.options;

export function isNodeType(value: string): value is NodeType {
  return (NODE_TYPES as readonly string[]).includes(value);
}

export function isEdgeKind(value: string): value is EdgeKind {
  return (EDGE_KINDS as readonly string[]).includes(value);
}

export function getNodeById(graph: GraphDefinition, nodeId: string): GraphNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

export function getOutgoingEdges(graph: GraphDefinition, nodeId: string): GraphEdge[] {
  return graph.edges.filter((edge) => edge.source === nodeId);
}

export function getIncomingEdges(graph: GraphDefinition, nodeId: string): GraphEdge[] {
  return graph.edges.filter((edge) => edge.target === nodeId);
}

export function fingerprintGraphSemantics(graph: GraphDefinition): string {
  const payload = {
    id: graph.id,
    name: graph.name,
    entry_node_id: graph.entry_node_id,
    orientation: graph.orientation ?? "auto",
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      config: node.config,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
      condition: edge.condition ?? null,
    })),
  };
  return JSON.stringify(payload);
}

export function fingerprintGraph(graph: GraphDefinition): string {
  const payload = {
    id: graph.id,
    name: graph.name,
    entry_node_id: graph.entry_node_id,
    orientation: graph.orientation ?? "auto",
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      config: node.config,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
      condition: edge.condition ?? null,
    })),
  };
  return JSON.stringify(payload);
}

/**
 * P0 graph foundation, Slice A (docs/planning/features/p0-graph-foundation-design-plan.md).
 * Distinct from fingerprintGraph/fingerprintGraphSemantics above, which stay
 * untouched — those are apps/studio's synchronous local dirty-check helpers
 * (no hashing, just JSON.stringify) and remain unchanged so nothing there
 * regresses. documentFingerprint/semanticFingerprint mirror
 * backend/app/fingerprint.py's payload shape field-for-field and produce a
 * real SHA-256 hex digest, matching the design doc's "SHA-256 over
 * canonical JSON" fingerprint definition — for a future GraphRelease
 * (Slice C), not for UI dirty-checking.
 */

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

// Matches Python's json.dumps(..., sort_keys=True, separators=(",", ":"))
// byte-for-byte: recursively sorted keys, no whitespace (JSON.stringify's
// default with no indent argument already omits whitespace).
function canonicalJson(payload: unknown): string {
  return JSON.stringify(sortKeysDeep(payload));
}

function portPayload(port: GraphPort) {
  return {
    id: port.id,
    name: port.name,
    direction: port.direction,
    contract: {
      kind: port.contract.kind,
      schema: port.contract.schema ?? null,
      required: port.contract.required ?? true,
      classification: port.contract.classification ?? null,
    },
  };
}

function transformPayload(transform: EdgeTransform) {
  return {
    type: transform.type,
    pointer: transform.pointer ?? null,
    field: transform.field ?? null,
    template: transform.template ?? null,
    target_type: transform.target_type ?? null,
  };
}

function documentPayload(graph: GraphDefinition) {
  return {
    id: graph.id,
    name: graph.name,
    entry_node_id: graph.entry_node_id,
    orientation: graph.orientation ?? "auto",
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      config: node.config,
      input_ports:
        node.input_ports && node.input_ports.length > 0 ? node.input_ports.map(portPayload) : null,
      output_ports:
        node.output_ports && node.output_ports.length > 0 ? node.output_ports.map(portPayload) : null,
      extensions: node.extensions ?? null,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
      condition: edge.condition ?? null,
      source_port: edge.source_port ?? null,
      target_port: edge.target_port ?? null,
      transform: edge.transform ? transformPayload(edge.transform) : null,
      extensions: edge.extensions ?? null,
    })),
  };
}

function semanticPayload(graph: GraphDefinition) {
  const payload = documentPayload(graph);
  return {
    ...payload,
    nodes: payload.nodes.map(({ position: _position, ...rest }) => rest),
  };
}

function sha256Hex(payload: unknown): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJson(payload))));
}

/** SHA-256 over the full canonical graph payload, including display-only
 * fields (canvas position). Identifies this literal graph state as authored. */
export function documentFingerprint(graph: GraphDefinition): string {
  return sha256Hex(documentPayload(graph));
}

/** SHA-256 over the execution-relevant subset of the graph payload,
 * excluding canvas position. Identifies "what will actually run". */
export function semanticFingerprint(graph: GraphDefinition): string {
  return sha256Hex(semanticPayload(graph));
}
