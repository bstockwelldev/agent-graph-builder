import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";

import type { AgentGraphNamespaces as AgentGraphClient } from "../api.js";

const ClientContext = createContext<AgentGraphClient | null>(null);

/**
 * Makes `client` (any client with the namespaces -- `createAgentGraphClient()`
 * or one scoped with `.with()`) available to the `/react` hooks (SDK 6/7,
 * STO-618). Pass your app's `queryClient` to share one cache; without it
 * the provider creates its own (no retries -- the client already retries
 * idempotent requests -- and 30s freshness).
 */
export function AgentGraphProvider({
  client,
  queryClient,
  children,
}: {
  client: AgentGraphClient;
  queryClient?: QueryClient;
  children: ReactNode;
}) {
  const [ownQueryClient] = useState(
    () => queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false } } }),
  );
  return (
    <ClientContext.Provider value={client}>
      <QueryClientProvider client={queryClient ?? ownQueryClient}>{children}</QueryClientProvider>
    </ClientContext.Provider>
  );
}

/** The client given to the nearest AgentGraphProvider. */
export function useAgentGraphClient(): AgentGraphClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error("useAgentGraphClient must be used inside <AgentGraphProvider client={...}>");
  return client;
}
