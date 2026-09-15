import type { Edge, Node } from "@xyflow/react";
import type { GraphNodeData } from "@/components/graph/nodes/GraphNodeView";
import { EDGE_KIND_TAXONOMY } from "../content/taxonomy";
import type { EdgeKind, GraphOrientation } from "@bstockwelldev/agent-graph-sdk";

export type CanvasSnapshot = {
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
  graphName: string;
  graphOrientation: GraphOrientation;
};

export function flowEdgeLabel(kind: EdgeKind, condition: string | null | undefined): string {
  if (kind === "conditional") {
    const match = condition?.trim();
    return match ? `Match: ${match}` : EDGE_KIND_TAXONOMY.conditional.title;
  }
  return EDGE_KIND_TAXONOMY[kind].title;
}

export function cloneCanvasSnapshot(
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  graphName: string,
  graphOrientation: GraphOrientation,
): CanvasSnapshot {
  return {
    nodes: nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data },
      style: node.style ? { ...node.style } : node.style,
    })),
    edges: edges.map((edge) => ({
      ...edge,
      data: edge.data ? { ...edge.data } : edge.data,
      style: edge.style ? { ...edge.style } : edge.style,
    })),
    graphName,
    graphOrientation,
  };
}

export function isBlankGraphPattern(nodes: Node<GraphNodeData>[], edges: Edge[]): boolean {
  if (nodes.length !== 2 || edges.length !== 1) return false;
  const input = nodes.find((node) => node.data.nodeType === "input");
  const output = nodes.find((node) => node.data.nodeType === "output");
  if (!input || !output) return false;
  const edge = edges[0];
  const kind = (edge.data?.kind as EdgeKind | undefined) ?? "sequence";
  return edge.source === input.id && edge.target === output.id && kind === "sequence";
}

export function shouldRunDagre(input: {
  rankDirChanged: boolean;
  graphIdChanged: boolean;
  relayoutRequested: boolean;
  topologyChanged: boolean;
}): boolean {
  void input.topologyChanged;
  return input.rankDirChanged || input.graphIdChanged || input.relayoutRequested;
}

function adjacency(edges: Edge[]): Map<string, string[]> {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const list = next.get(edge.source) ?? [];
    list.push(edge.target);
    next.set(edge.source, list);
  }
  return next;
}

export function hasMinimalRunnablePath(nodes: Node<GraphNodeData>[], edges: Edge[]): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = adjacency(edges);
  const inputs = nodes.filter((node) => node.data.nodeType === "input");

  const visit = (id: string, seen: Set<string>, sawPrompt: boolean, sawLlm: boolean): boolean => {
    if (seen.has(id)) return false;
    const node = byId.get(id);
    if (!node) return false;
    const nextSeen = new Set(seen);
    nextSeen.add(id);
    const type = node.data.nodeType;
    const prompt = sawPrompt || type === "prompt";
    const llm = sawLlm || type === "llm";
    if (type === "output" && prompt && llm) return true;
    for (const target of outgoing.get(id) ?? []) {
      if (visit(target, nextSeen, prompt, llm)) return true;
    }
    return false;
  };

  return inputs.some((node) => visit(node.id, new Set(), false, false));
}

export type CoachStep = {
  title: string;
  stepLabel: string;
  lines: string[];
};

export function coachStep(nodes: Node<GraphNodeData>[], edges: Edge[]): CoachStep {
  const types = new Set(nodes.map((node) => node.data.nodeType));
  const hasPrompt = types.has("prompt");
  const hasLlm = types.has("llm");
  const hasRouter = types.has("router");
  const blank = isBlankGraphPattern(nodes, edges);
  const glossary = [
    "Always (sequence): follow this path every run.",
    "Match text (conditional): Router takes this path when upstream LLM text contains the condition.",
    "Fallback (default): Router takes this path when no condition matches. Each Router needs exactly one.",
    "This playground only allows acyclic graphs (no loops).",
  ];

  if (blank || (!hasPrompt && !hasLlm)) {
    return {
      title: "Build this graph",
      stepLabel: "Step 1 of 4",
      lines: [
        "Next: add a Prompt between Input and Output, then connect it.",
        "Prompt fills {question} (and {upstream}); a Router later matches LLM output text — not the Prompt template.",
        ...glossary,
      ],
    };
  }
  if (hasPrompt && !hasLlm) {
    return {
      title: "Build this graph",
      stepLabel: "Step 2 of 4",
      lines: [
        "Next: add an LLM after the Prompt and connect Prompt → LLM (Always).",
        "The LLM reads the rendered Prompt. Router conditions (optional) match that LLM text.",
        ...glossary,
      ],
    };
  }
  if (hasPrompt && hasLlm && !hasMinimalRunnablePath(nodes, edges)) {
    return {
      title: "Build this graph",
      stepLabel: "Step 3 of 4",
      lines: [
        "Next: connect LLM → Output (Always), or add a Router with one Fallback edge and one or more Match-text edges.",
        "Branching: Router, then one default edge and one or more conditional edges.",
        ...glossary,
      ],
    };
  }
  if (hasRouter && hasMinimalRunnablePath(nodes, edges)) {
    return {
      title: "Build this graph",
      stepLabel: "Step 4 of 4",
      lines: [
        "Optional: add a Router, then one Fallback edge and Match-text edges (substring of LLM output).",
        ...glossary,
      ],
    };
  }
  return {
    title: "Build this graph",
    stepLabel: "Guide",
    lines: glossary,
  };
}

export function isCoachVisible(
  graphId: string | null,
  dismissed: boolean,
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
): boolean {
  if (!graphId || dismissed || nodes.length === 0) return false;
  if (hasMinimalRunnablePath(nodes, edges)) return false;
  return true;
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function coachDismissStorageKey(graphId: string): string {
  return `agb-coach-dismissed:${graphId}`;
}

export function isCoachDismissed(graphId: string | null): boolean {
  if (!graphId || typeof window === "undefined") return false;
  return window.localStorage.getItem(coachDismissStorageKey(graphId)) === "1";
}

export function dismissCoach(graphId: string): void {
  window.localStorage.setItem(coachDismissStorageKey(graphId), "1");
}
