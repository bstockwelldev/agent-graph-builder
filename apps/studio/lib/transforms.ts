import type { EdgeTransform } from "@bstockwelldev/agent-graph-sdk";

/** One-line summary of what a transform does, e.g. `select /answer`. */
export function describeTransform(transform: Pick<EdgeTransform, "type" | "pointer" | "field" | "template" | "target_type">): string {
  if (transform.type === "select") return `select ${transform.pointer ?? ""}`;
  if (transform.type === "wrap") return `wrap as ${transform.field ?? ""}`;
  if (transform.type === "coerce") return `to ${transform.target_type ?? ""}`;
  if (transform.type === "format_message") return `format "${(transform.template ?? "").slice(0, 40)}"`;
  return "library transform";
}
