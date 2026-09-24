/**
 * `@bstockwelldev/agent-graph-sdk/react` (SDK 6/7, STO-618): React hooks on
 * TanStack Query. Needs the `react` (18+) and `@tanstack/react-query` (v5)
 * peer dependencies; the SDK's core entry never imports this one.
 */
export { AgentGraphProvider, useAgentGraphClient } from "./provider.js";
export { agentGraphInvalidation, agentGraphKeys } from "./keys.js";
export {
  useAgentGraphInvalidation,
  useGraph,
  useGraphHealth,
  useGraphs,
  useNodeImpact,
  usePolicies,
  useReleases,
  useResources,
  useRun,
  useRuns,
} from "./hooks.js";
export type { DraftInput, PoliciesData, ResourceKind, UseRunOptions } from "./hooks.js";
