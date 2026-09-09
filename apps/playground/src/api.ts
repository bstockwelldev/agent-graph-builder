import { createAgentGraphClient, streamRunEvents as sdkStreamRunEvents } from "@bstockwelldev/agent-graph-sdk";
import type { PlatformEvent } from "@bstockwelldev/agent-graph-sdk";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export const api = createAgentGraphClient({ baseUrl: BASE_URL });

export function streamRunEvents(runId: string, onEvent: (event: PlatformEvent) => void, onClose?: () => void): () => void {
  return sdkStreamRunEvents(BASE_URL, runId, onEvent, onClose);
}
