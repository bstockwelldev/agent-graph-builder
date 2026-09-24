import type { GraphDefinition } from "@bstockwelldev/agent-graph-sdk";
import { runInputVariables } from "@bstockwelldev/agent-graph-sdk/graph";

/**
 * Pure helpers for running graphs from Chat (studio-ux-gap-remediation-
 * plan.md §4-5, STO-600/601). The run itself goes through the same run API
 * the Run panel uses (`client.runs.start` / `client.releases.run`); this
 * module only resolves *what* to run and turns a run's events/traces into
 * the chat card's step rows.
 */

/** `latest` = newest published release; `rel_…` = a specific release; null = the draft. */
export type ReleaseSelector = "latest" | string | null;

export type RunTarget = {
  graph: Pick<GraphDefinition, "id" | "name" | "nodes">;
  release: ReleaseSelector;
  input: Record<string, string>;
  /** Proposed from free text ("run the support flow") rather than an
   * explicit picker or `/run` command -- always confirmed first. */
  inferred: boolean;
};

export type ParsedRunCommand = { ok: true; target: RunTarget } | { ok: false; error: string };

/** The graph's input variables (one per input node), from a stored graph. */
export function graphInputVariables(graph: Pick<GraphDefinition, "nodes">): string[] {
  return runInputVariables(graph.nodes);
}

/**
 * Run input from the text after the graph: `key=value` pairs (quoted
 * values allowed) map to variables; anything else becomes the first
 * input variable's value.
 */
export function buildRunInput(variables: readonly string[], raw: string): Record<string, string> {
  const text = raw.trim();
  const input: Record<string, string> = {};
  const pairs = [...text.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|(\S+))/g)];
  if (pairs.length > 0 && pairs.every((pair) => variables.includes(pair[1]))) {
    for (const pair of pairs) input[pair[1]] = pair[2] ?? pair[3] ?? pair[4] ?? "";
    return input;
  }
  if (text && variables.length > 0) input[variables[0]] = text;
  return input;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** A graph by exact id, or by name ignoring case and punctuation. */
export function findGraph<G extends Pick<GraphDefinition, "id" | "name">>(graphs: readonly G[], query: string): G | null {
  const q = query.trim();
  if (!q) return null;
  const byId = graphs.find((graph) => graph.id === q);
  if (byId) return byId;
  const normalized = normalizeName(q);
  return graphs.find((graph) => normalizeName(graph.name) === normalized) ?? null;
}

/**
 * `/run <graph>[@latest|@rel_…] [input]`. The graph is an id, a quoted
 * name, or (unquoted) the longest leading run of words naming a graph.
 */
export function parseRunCommand<G extends Pick<GraphDefinition, "id" | "name" | "nodes">>(
  text: string,
  graphs: readonly G[],
): ParsedRunCommand | null {
  const match = text.trim().match(/^\/run(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const rest = (match[1] ?? "").trim();
  if (!rest) return { ok: false, error: "Usage: /run <graph>[@latest|@release_id] [input or key=value …]" };

  let graphPart: string;
  let tail: string;
  const quoted = rest.match(/^"([^"]+)"(@\S+)?\s*([\s\S]*)$/);
  let graph: G | null = null;
  let selectorPart: string | undefined;
  if (quoted) {
    graphPart = quoted[1];
    selectorPart = quoted[2];
    tail = quoted[3];
    graph = findGraph(graphs, graphPart);
  } else {
    const words = rest.split(/\s+/);
    tail = "";
    graphPart = words[0];
    for (let count = words.length; count >= 1; count--) {
      const candidate = words.slice(0, count).join(" ");
      const [name, selector] = splitSelector(candidate);
      const found = findGraph(graphs, name);
      if (found) {
        graph = found;
        graphPart = name;
        selectorPart = selector;
        tail = words.slice(count).join(" ");
        break;
      }
    }
  }
  if (!graph) return { ok: false, error: `No graph named "${splitSelector(graphPart)[0]}".` };

  const selector = (selectorPart ?? "").replace(/^@/, "");
  const release: ReleaseSelector = !selector || selector === "draft" ? null : selector === "latest" || selector === "release" ? "latest" : selector;
  return { ok: true, target: { graph, release, input: buildRunInput(graphInputVariables(graph), tail), inferred: false } };
}

/** `name@selector`, where the selector is a single token (`@latest`, `@rel_…`). */
function splitSelector(value: string): [string, string | undefined] {
  const match = value.match(/^([\s\S]+?)(@\S+)$/);
  return match ? [match[1], match[2]] : [value, undefined];
}

/**
 * Plain-text intent: "run <graph>", "please run the <graph> graph". Only
 * exact graph matches count; the result is always `inferred`, so Chat
 * proposes it as a confirm card instead of executing.
 */
export function matchRunIntent<G extends Pick<GraphDefinition, "id" | "name" | "nodes">>(
  text: string,
  graphs: readonly G[],
): RunTarget | null {
  const match = text.trim().match(/^(?:please\s+|can you\s+|could you\s+)?(?:run|execute|start)\s+(?:the\s+)?(.+?)\s*[.!?]*$/i);
  if (!match) return null;
  // The whole remainder first ("Support flow" is a name), then without a
  // trailing "graph"/"flow"/"workflow" ("the Explain graph").
  const rest = match[1];
  const graph = findGraph(graphs, rest) ?? findGraph(graphs, rest.replace(/\s+(?:graph|flow|workflow)$/i, ""));
  return graph ? { graph, release: null, input: {}, inferred: true } : null;
}

/** Release runs and free-text proposals need an explicit Confirm (product decision, STO-600). */
export function needsConfirmation(target: Pick<RunTarget, "release" | "inferred">): boolean {
  return target.release !== null || target.inferred;
}

// Run steps moved to the SDK (SDK 2/7, STO-615); re-exported so existing
// imports keep working.
export { applyRunEvent, formatStepDuration, stepsFromTraces, type RunStep } from "@bstockwelldev/agent-graph-sdk";
