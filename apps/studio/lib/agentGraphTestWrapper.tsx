import { AgentGraphProvider } from "@bstockwelldev/agent-graph-sdk/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

/** Test helper (SDK 6/7): wraps a component that uses `/react` hooks in a
 * provider with `client` (usually a namespaced mock) and a fresh cache. */
export function agentGraphWrapper(client: object) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AgentGraphProvider client={client as never} queryClient={queryClient}>
        {children}
      </AgentGraphProvider>
    );
  };
}
