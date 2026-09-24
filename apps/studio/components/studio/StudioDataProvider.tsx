"use client";

import { AgentGraphProvider } from "@bstockwelldev/agent-graph-sdk/react";
import type { ReactNode } from "react";

import { client } from "@/lib/api-client";

/** SDK 6/7 (STO-618): the API client and query cache for `/react` hooks. */
export function StudioDataProvider({ children }: { children: ReactNode }) {
  return <AgentGraphProvider client={client}>{children}</AgentGraphProvider>;
}
