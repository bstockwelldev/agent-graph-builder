import type { NodeType } from "@bstockwelldev/agent-graph-sdk";
import { NODE_TYPE_TAXONOMY } from "@/content/taxonomy";
import { client } from "@/lib/api-client";
import { NODE_TYPE_GROUPS } from "./canvasMenuActions";
import { listBindable } from "./resourceBindings";

// The node palette's sections (canvas-workbench-ergonomics-plan.md §4). The
// palette renders whatever is registered here, so a new kind of thing to
// drop on the canvas is one more entry, not a palette edit.

/** Something the palette can add: a node type, optionally pre-configured (a bound library item). */
export type PaletteItem = {
  key: string;
  label: string;
  detail: string;
  nodeType: NodeType;
  /** Merged over the node type's defaults. */
  config?: Record<string, unknown>;
  /** A caption above the first item of a run (e.g. "Model"). */
  group?: string;
};

export type PaletteSection = {
  id: string;
  title: string;
  /** Static sections return items; library sections fetch them. */
  load: (context: {
    graphId: string | null;
  }) => PaletteItem[] | Promise<PaletteItem[]>;
  emptyLabel: string;
};

/** Drag payload MIME type for palette items dropped on the canvas. */
export const PALETTE_DRAG_TYPE = "application/x-agb-palette-item";

export type PaletteDrop = Pick<PaletteItem, "nodeType" | "config">;

export function nodeTypeItems(): PaletteItem[] {
  return NODE_TYPE_GROUPS.flatMap((group) =>
    group.types.map((type, index) => ({
      key: `node:${type}`,
      label: NODE_TYPE_TAXONOMY[type].title.replace(/ node$/, ""),
      detail: NODE_TYPE_TAXONOMY[type].summary,
      nodeType: type,
      group: index === 0 ? group.label : undefined,
    })),
  );
}

export const PALETTE_SECTIONS: PaletteSection[] = [
  {
    id: "nodes",
    title: "Nodes",
    load: nodeTypeItems,
    emptyLabel: "No node types match.",
  },
  {
    id: "library",
    title: "Library",
    emptyLabel: "No prompts, LLM profiles or tools yet.",
    load: async () => {
      const [prompts, profiles, tools] = await Promise.all([
        listBindable("prompts").catch(() => []),
        listBindable("llm_profiles").catch(() => []),
        listBindable("tools").catch(() => []),
      ]);
      return [
        ...prompts.map((prompt, index) => ({
          key: `prompt:${prompt.id}`,
          label: prompt.name,
          detail: prompt.detail,
          nodeType: "prompt" as const,
          config: { promptId: prompt.id },
          group: index === 0 ? "Prompts" : undefined,
        })),
        ...profiles.map((profile, index) => ({
          key: `llm:${profile.id}`,
          label: profile.name,
          detail: profile.detail,
          nodeType: "llm" as const,
          config: { llmProfileId: profile.id },
          group: index === 0 ? "LLM profiles" : undefined,
        })),
        ...tools.map((tool, index) => ({
          key: `tool:${tool.id}`,
          label: tool.name,
          detail: tool.detail,
          nodeType: "tool" as const,
          config: { toolName: tool.id },
          group: index === 0 ? "Tools" : undefined,
        })),
      ];
    },
  },
  {
    id: "transforms",
    title: "Transforms",
    emptyLabel: "No library transforms yet.",
    load: async () =>
      (await listBindable("transforms").catch(() => [])).map((transform) => ({
        key: `transform:${transform.id}`,
        label: transform.name,
        detail: transform.detail,
        nodeType: "transform" as const,
        config: { transformId: transform.id },
      })),
  },
  {
    id: "subgraphs",
    title: "Subgraphs",
    emptyLabel: "No other saved graphs.",
    load: async ({ graphId }) =>
      (await client.graphs.summaries.list().catch(() => []))
        .filter((graph) => graph.id !== graphId)
        .map((graph) => ({
          key: `subgraph:${graph.id}`,
          label: graph.name,
          detail: "Run this graph as one step",
          nodeType: "subgraph" as const,
          config: { graphId: graph.id, version: "latest" },
        })),
  },
];

/** Items whose label, detail or node type match every word of the query. */
export function filterPaletteItems(
  items: PaletteItem[],
  query: string,
): PaletteItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items
    .filter((item) => {
      const haystack =
        `${item.label} ${item.detail} ${item.nodeType} ${item.group ?? ""}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .map((item) => ({ ...item, group: undefined }));
}
