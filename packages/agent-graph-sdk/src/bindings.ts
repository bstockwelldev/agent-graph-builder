/**
 * Node ↔ resource-registry bindings (studio-graph-workbench-redesign-plan.md,
 * Wave 4a / STO-605). TypeScript mirror of backend/app/bindings.py
 * `BINDING_FIELDS`; both sides are checked against
 * `contract/node-bindings.json` (bindings.test.ts, and
 * backend/tests/test_resource_bindings.py).
 *
 * A binding is a live reference: draft runs read the resource's current
 * content, and a published release freezes it in `resource_snapshots`.
 */
export type BindableResourceKind = "prompts" | "llm_profiles" | "tools" | "transforms";

export const NODE_BINDING_FIELDS: Readonly<Record<string, readonly (readonly [string, BindableResourceKind])[]>> = {
  prompt: [["promptId", "prompts"]],
  llm: [
    ["llmProfileId", "llm_profiles"],
    ["systemPromptId", "prompts"],
  ],
  tool_loop: [
    ["llmProfileId", "llm_profiles"],
    ["systemPromptId", "prompts"],
  ],
  tool: [["toolName", "tools"]],
};

/** The API path segment for each bindable registry (backend/app/main.py `_RESOURCE_ROUTE_PATHS`). */
export const RESOURCE_KIND_PATH: Readonly<Record<BindableResourceKind, string>> = {
  prompts: "prompts",
  llm_profiles: "llm-profiles",
  tools: "tools",
  transforms: "transforms",
};

/** Tool ids that are code, not stored resources (backend/app/bindings.py `CODE_TOOL_IDS`). */
export const CODE_TOOL_IDS: readonly string[] = ["lookup_topic", "web_search", "calculator"];

export type NodeBinding = { field: string; kind: BindableResourceKind; resourceId: string };

/** The registry references a node's config holds (empty values and code tools skipped). */
export function nodeBindings(nodeType: string, config: Record<string, unknown>): NodeBinding[] {
  const bindings: NodeBinding[] = [];
  for (const [field, kind] of NODE_BINDING_FIELDS[nodeType] ?? []) {
    const value = config[field];
    if (typeof value !== "string" || !value.trim()) continue;
    if (kind === "tools" && CODE_TOOL_IDS.includes(value)) continue;
    bindings.push({ field, kind, resourceId: value });
  }
  return bindings;
}
