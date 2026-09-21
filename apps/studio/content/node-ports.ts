import type { GraphNode, GraphPort, NodeType, PortKind } from "@bstockwelldev/agent-graph-sdk";

/**
 * Phase 10 Slice B (docs/planning/features/studio-shell-ux-gap-analysis.md):
 * a frontend mirror of backend/app/ports.py's `_DEFAULT_PORT_CATALOG`, for
 * the selection dock's I/O tab. Read-only/display-only here -- port
 * resolution and contract validation stay backend-owned (`ports.py`,
 * `contracts.py`); this just lets Studio show a node's declared port names
 * without a round trip, the same "small, stable catalog mirrored for
 * display" precedent `content/taxonomy.ts` already established for node-type
 * copy. Keep in sync with `_DEFAULT_PORT_CATALOG` by hand -- `test_ports.py`
 * asserts full NodeType coverage on the backend side; there is no shared
 * source of truth between the two languages.
 */
function singleIo(inputKind: PortKind, outputKind: PortKind): { input: GraphPort[]; output: GraphPort[] } {
  return {
    input: [{ id: "input", name: "input", direction: "input", contract: { kind: inputKind } }],
    output: [{ id: "output", name: "output", direction: "output", contract: { kind: outputKind } }],
  };
}

function routerLikeIo(inputKind: PortKind): { input: GraphPort[]; output: GraphPort[] } {
  return {
    input: [{ id: "input", name: "input", direction: "input", contract: { kind: inputKind } }],
    output: [
      { id: "passthrough", name: "passthrough", direction: "output", contract: { kind: inputKind } },
      { id: "decision", name: "decision", direction: "output", contract: { kind: "decision" } },
    ],
  };
}

export const NODE_PORT_CATALOG: Record<NodeType, { input: GraphPort[]; output: GraphPort[] }> = {
  input: {
    input: [],
    output: [{ id: "output", name: "output", direction: "output", contract: { kind: "message" } }],
  },
  prompt: singleIo("message", "message"),
  llm: singleIo("message", "message"),
  tool: singleIo("structured-json", "tool-result"),
  router: routerLikeIo("message"),
  output: {
    input: [{ id: "input", name: "input", direction: "input", contract: { kind: "message" } }],
    output: [],
  },
  guardrail: singleIo("message", "message"),
  rubric: singleIo("message", "message"),
  human_gate: singleIo("approval", "approval"),
  tool_loop: singleIo("message", "message"),
  code_exec: singleIo("structured-json", "artifact"),
  branch: routerLikeIo("message"),
};

/** The node's declared input ports: an explicit `input_ports` override, else the catalog default. */
export function inputPortsFor(node: Pick<GraphNode, "type" | "input_ports">): GraphPort[] {
  return node.input_ports ?? NODE_PORT_CATALOG[node.type].input;
}

/** The node's declared output ports: an explicit `output_ports` override, else the catalog default. */
export function outputPortsFor(node: Pick<GraphNode, "type" | "output_ports">): GraphPort[] {
  return node.output_ports ?? NODE_PORT_CATALOG[node.type].output;
}
