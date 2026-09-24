import { createAgentGraphClient, streamRunEvents as sdkStreamRunEvents } from "@bstockwelldev/agent-graph-sdk";
import type { AgentGraphClient, DeprecatedClientMethods, PlatformEvent } from "@bstockwelldev/agent-graph-sdk";

const BASE_URL = "";

/** SDK 4/7: typed without the deprecated flat methods, so Studio can only
 * use the namespaces (`client.graphs.get`, ...) -- tsc enforces it. */
export type StudioClient = Omit<AgentGraphClient, keyof DeprecatedClientMethods>;

export const client: StudioClient = createAgentGraphClient({ baseUrl: BASE_URL });

/** SDK 2/7: stream a run until it settles (stream + poll fallback). */
export const waitForRun = (runId: string, options: Parameters<typeof client.runs.wait>[1]) => client.runs.wait(runId, options);

/** @deprecated SDK 2/7 -- use `client.runs.stream` / `waitForRun`. */
export function streamRunEvents(
  runId: string,
  onEvent: (event: PlatformEvent) => void,
  onClose?: () => void,
): () => void {
  return sdkStreamRunEvents(BASE_URL, runId, onEvent, onClose);
}
