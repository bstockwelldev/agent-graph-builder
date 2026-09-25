import { createAgentGraphClient } from "@bstockwelldev/agent-graph-sdk";
import type { AgentGraphClient } from "@bstockwelldev/agent-graph-sdk";

const BASE_URL = "";

/** The Studio's API client (same-origin). SDK 1.0 has only the namespaced
 * API (`client.graphs.get`, ...). */
export type StudioClient = AgentGraphClient;

export const client: StudioClient = createAgentGraphClient({ baseUrl: BASE_URL });

/** SDK 2/7: stream a run until it settles (stream + poll fallback). */
export const waitForRun = (runId: string, options: Parameters<typeof client.runs.wait>[1]) => client.runs.wait(runId, options);
