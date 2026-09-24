import { createAgentGraphClient, streamRunEvents as sdkStreamRunEvents } from "@bstockwelldev/agent-graph-sdk";
import type { PlatformEvent } from "@bstockwelldev/agent-graph-sdk";

const BASE_URL = "";

export const client = createAgentGraphClient({ baseUrl: BASE_URL });

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
