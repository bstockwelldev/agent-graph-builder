import type { Node } from "@xyflow/react";
import type { ChatProvider } from "../types";
import type { GraphNodeData } from "../components/nodes/GraphNodeView";

/** Providers whose models are loaded from `/api/providers/{provider}/models`. */
export const CATALOG_PROVIDERS: ChatProvider[] = ["ollama", "groq", "azure", "google"];

export function showModelCatalog(provider: ChatProvider): boolean {
  return CATALOG_PROVIDERS.includes(provider);
}

export function applyRunSelectionToLlmNodes(
  nodes: Node<GraphNodeData>[],
  provider: ChatProvider,
  model?: string,
): Node<GraphNodeData>[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.data.nodeType !== "llm") return node;
    const config: Record<string, unknown> = { ...node.data.config, provider };
    if (model) config.model = model;
    const prevProvider = node.data.config.provider;
    const prevModel = node.data.config.model;
    if (prevProvider === config.provider && prevModel === config.model) return node;
    changed = true;
    return {
      ...node,
      data: {
        ...node.data,
        config,
        label: String(config.model ?? "llm"),
      },
    };
  });
  return changed ? next : nodes;
}
