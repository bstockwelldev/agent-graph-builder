import { graphDefinitionSchema, type Diagnostic, type GraphDefinition } from "@bstockwelldev/agent-graph-sdk";
import { LineCounter, isMap, isScalar, isSeq, parseDocument, type Node as YamlNode } from "yaml";
import { derivedEntryNodeId } from "./graphJsonPortability";
import { toCanonicalJson, type RawSyntax } from "./jsonEditor";

// Code mode (canvas-workbench-ergonomics-plan.md §5): the whole graph as
// JSON or YAML text, with problems pinned to lines. JSON is a subset of
// YAML 1.2, so one YAML document parse gives source ranges for both views.

/** A path into the graph text: keys, array indexes, or `{ id }` for the array item with that id. */
export type CodePathSegment = string | number | { id: string };

export type CodeProblem = {
  severity: "error" | "warning";
  message: string;
  /** 1-based line, when the problem can be placed. */
  line: number | null;
  /** Graph diagnostics only: the canvas element it is about. */
  nodeId?: string | null;
  edgeId?: string | null;
};

export type CodeCheck = { ok: true; graph: GraphDefinition } | { ok: false; problems: CodeProblem[] };

function rangeStart(node: unknown): number | undefined {
  return (node as { range?: [number, number, number] } | null)?.range?.[0];
}

/**
 * The line `path` starts on in `text`, or the deepest part of it that exists
 * (a missing key points at its parent). Null when the text has no structure.
 */
export function lineOfPath(text: string, path: CodePathSegment[]): number | null {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  let node: unknown = doc.contents;
  let offset = rangeStart(node);
  for (const segment of path) {
    if (isMap(node) && (typeof segment === "string" || typeof segment === "number")) {
      const pair = node.items.find((item) => isScalar(item.key) && String(item.key.value) === String(segment));
      if (!pair) break;
      offset = rangeStart(pair.key) ?? offset;
      node = pair.value;
    } else if (isSeq(node)) {
      const item =
        typeof segment === "number"
          ? node.items[segment]
          : typeof segment === "object"
            ? node.items.find((entry) => isMap(entry) && (entry as YamlNode & { get: (key: string) => unknown }).get("id") === segment.id)
            : undefined;
      if (!item) break;
      offset = rangeStart(item) ?? offset;
      node = item;
    } else {
      break;
    }
  }
  return offset === undefined ? null : lineCounter.linePos(offset).line;
}

/** Where a compile diagnostic belongs in the text: its node or edge. */
export function diagnosticPath(diagnostic: Pick<Diagnostic, "node_id" | "edge_id">): CodePathSegment[] | null {
  if (diagnostic.edge_id) return ["edges", { id: diagnostic.edge_id }];
  if (diagnostic.node_id) return ["nodes", { id: diagnostic.node_id }];
  return null;
}

/** Compile diagnostics as problems on lines of `text`. */
export function diagnosticProblems(text: string, diagnostics: Diagnostic[]): CodeProblem[] {
  return diagnostics.map((diagnostic) => {
    const path = diagnosticPath(diagnostic);
    return {
      severity: diagnostic.severity,
      message: diagnostic.message,
      line: path ? lineOfPath(text, path) : null,
      nodeId: diagnostic.node_id ?? null,
      edgeId: diagnostic.edge_id ?? null,
    };
  });
}

function lineOfOffset(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

/** A syntax error with its line: V8 reports a position (and, lately, a line). */
function syntaxProblem(text: string, syntax: RawSyntax): CodeProblem | null {
  if (syntax === "json") {
    try {
      JSON.parse(text);
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const line = /line (\d+)/.exec(message)?.[1];
      const position = /position (\d+)/.exec(message)?.[1];
      return {
        severity: "error",
        message: `Invalid JSON: ${message}`,
        line: line ? Number(line) : position ? lineOfOffset(text, Number(position)) : null,
      };
    }
  }
  const doc = parseDocument(text, { prettyErrors: true });
  const error = doc.errors[0];
  if (!error) return null;
  return { severity: "error", message: `Invalid YAML: ${error.message.split("\n")[0]}`, line: error.linePos?.[0].line ?? null };
}

/**
 * Validates graph text the way Apply and Save need it: syntax, the graph
 * schema, and the two fields the editor can't change (id, entry node).
 * Every problem carries the line it starts on, when it has one.
 */
export function checkGraphCode(text: string, syntax: RawSyntax, graphId: string): CodeCheck {
  const syntaxError = syntaxProblem(text, syntax);
  if (syntaxError) return { ok: false, problems: [syntaxError] };
  const converted = toCanonicalJson(text, syntax);
  if (!converted.ok) return { ok: false, problems: [{ severity: "error", message: converted.error, line: null }] };
  const result = graphDefinitionSchema.safeParse(JSON.parse(converted.json));
  if (!result.success) {
    return {
      ok: false,
      problems: result.error.issues.map((issue) => ({
        severity: "error" as const,
        message: `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`,
        line: lineOfPath(text, issue.path),
      })),
    };
  }
  const graph = result.data;
  if (graph.id !== graphId) {
    return {
      ok: false,
      problems: [{ severity: "error", message: `"id" can't be changed here (expected "${graphId}"). Export and import to create a copy.`, line: lineOfPath(text, ["id"]) }],
    };
  }
  const entry = derivedEntryNodeId(graph);
  if (graph.entry_node_id !== entry) {
    return {
      ok: false,
      problems: [
        {
          severity: "error",
          message: `"entry_node_id" must be "${entry}": the entry is the first input node (or the first node).`,
          line: lineOfPath(text, ["entry_node_id"]),
        },
      ],
    };
  }
  return { ok: true, graph };
}
