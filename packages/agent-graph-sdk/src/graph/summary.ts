import type { GraphDefinition, GraphSummary } from "../types.js";
import { runInputVariables } from "./runInputs.js";

/**
 * A graph's summary, as GET /api/graph-summaries returns it (backend
 * `GraphCatalogEntry.summary()`), for a graph already in hand -- e.g. one
 * just returned by `graphs.create`, to add to a summary list.
 */
export function summarizeGraph(graph: GraphDefinition): GraphSummary {
  const subgraphIds = graph.nodes
    .filter((node) => node.type === "subgraph")
    .map((node) => String(node.config?.graphId ?? ""))
    .filter(Boolean);
  return {
    id: graph.id,
    name: graph.name,
    updated_at: graph.updated_at ?? null,
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
    input_variables: runInputVariables(graph.nodes),
    subgraph_ids: [...new Set(subgraphIds)],
  };
}
