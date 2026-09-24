import type { GraphHealth } from "@bstockwelldev/agent-graph-sdk";

import { color } from "@/lib/graph-theme";

/** Presentation for the graph health score (Wave 7a, STO-610). */
export const HEALTH_BAND: Record<GraphHealth["band"], { label: string; color: string }> = {
  healthy: { label: "Healthy", color: color.success[500] },
  attention: { label: "Needs attention", color: color.warning[500] },
  at_risk: { label: "At risk", color: color.error[500] },
};

/** Factors that actually cost points, largest first; then the rest. */
export function orderedFactors(health: GraphHealth): GraphHealth["factors"] {
  return [...health.factors].sort((a, b) => b.deduction - a.deduction || a.label.localeCompare(b.label));
}
