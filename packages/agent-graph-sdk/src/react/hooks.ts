import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type { AgentGraphNamespaces as AgentGraphClient } from "../api.js";
import { isSettledRun } from "../runs.js";
import { documentFingerprint } from "../schema.js";
import type { EffectivePolicyRule, GraphDefinition, PlatformEvent, PolicyException, PolicySettings } from "../types.js";
import { agentGraphInvalidation, agentGraphKeys } from "./keys.js";
import { useAgentGraphClient } from "./provider.js";

/**
 * React hooks over the namespaced client (SDK 6/7, STO-618), built on
 * TanStack Query: each hook is one cached query, so two components asking
 * for the same data share a single request, and a hook passes through
 * TanStack's query options (`enabled`, `staleTime`, `select`, ...).
 */

type QueryOptions<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn">;

export function useGraphs(options: QueryOptions<GraphDefinition[]> = {}) {
  const client = useAgentGraphClient();
  return useQuery({ queryKey: agentGraphKeys.graphs(), queryFn: () => client.graphs.list(), ...options });
}

/** Disabled until `graphId` is set. */
export function useGraph(graphId: string | null | undefined, options: QueryOptions<GraphDefinition> = {}) {
  const client = useAgentGraphClient();
  return useQuery({ queryKey: agentGraphKeys.graph(graphId ?? ""), queryFn: () => client.graphs.get(graphId!), enabled: Boolean(graphId), ...options });
}

/** A graph's runs, or every run when `graphId` is omitted (newest first, the server's unpaged cap). */
export function useRuns(graphId?: string | null, options: QueryOptions<Awaited<ReturnType<AgentGraphClient["runs"]["list"]>>> = {}) {
  const client = useAgentGraphClient();
  return useQuery({
    queryKey: agentGraphKeys.runs(graphId ?? undefined),
    queryFn: () => client.runs.list(graphId ? { graphId } : {}),
    ...options,
  });
}

export type UseRunOptions = {
  /** Stream the run's events (default true). */
  live?: boolean;
};

/**
 * One run, kept live: while `live`, it streams the run's events
 * (`client.runs.stream`, resumable) into `events`, and refetches the run
 * when the stream ends so `data` holds the settled summary. The stream
 * replays a finished run's history too.
 */
export function useRun(runId: string | null | undefined, { live = true }: UseRunOptions = {}) {
  const client = useAgentGraphClient();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: agentGraphKeys.run(runId ?? ""), queryFn: () => client.runs.get(runId!), enabled: Boolean(runId) });
  const [events, setEvents] = useState<{ runId: string; list: PlatformEvent[] }>({ runId: "", list: [] });
  const loaded = query.data !== undefined;

  useEffect(() => {
    if (!runId || !live || !loaded) return;
    const controller = new AbortController();
    setEvents({ runId, list: [] });
    void (async () => {
      try {
        for await (const event of client.runs.stream(runId, { signal: controller.signal })) {
          setEvents((previous) => ({ runId, list: previous.runId === runId ? [...previous.list, event] : [event] }));
        }
      } catch {
        // A dropped stream falls back to the refetch below.
      } finally {
        if (!controller.signal.aborted) {
          const current = queryClient.getQueryData<{ status: string }>(agentGraphKeys.run(runId));
          if (!current || !isSettledRun(current as never)) void queryClient.invalidateQueries({ queryKey: agentGraphKeys.run(runId) });
        }
      }
    })();
    return () => controller.abort();
  }, [client, queryClient, runId, live, loaded]);

  return { ...query, events: events.runId === runId ? events.list : [] };
}

export function useReleases(graphId: string | null | undefined, options: QueryOptions<Awaited<ReturnType<AgentGraphClient["releases"]["list"]>>> = {}) {
  const client = useAgentGraphClient();
  return useQuery({ queryKey: agentGraphKeys.releases(graphId ?? ""), queryFn: () => client.releases.list(graphId!), enabled: Boolean(graphId), ...options });
}

/**
 * A draft to analyse: the graph itself (keyed by its document fingerprint),
 * or a function evaluated at fetch time plus your own `draftKey` -- for a
 * live canvas you don't want to fingerprint on every render.
 */
export type DraftInput = { draft: GraphDefinition; draftKey?: string } | { draft: () => GraphDefinition; draftKey: string };

function useDraftKey(input: DraftInput): string {
  const { draft, draftKey } = input;
  return useMemo(() => draftKey ?? documentFingerprint(draft as GraphDefinition), [draft, draftKey]);
}

const resolveDraft = (input: DraftInput) => (typeof input.draft === "function" ? input.draft() : input.draft);

export function useGraphHealth(graphId: string | null | undefined, input: DraftInput, options: QueryOptions<Awaited<ReturnType<AgentGraphClient["graphs"]["health"]>>> = {}) {
  const client = useAgentGraphClient();
  const draftKey = useDraftKey(input);
  return useQuery({
    queryKey: agentGraphKeys.health(graphId ?? "", draftKey),
    queryFn: () => client.graphs.health(graphId!, resolveDraft(input)),
    enabled: Boolean(graphId),
    ...options,
  });
}

export function useNodeImpact(
  graphId: string | null | undefined,
  nodeId: string | null | undefined,
  input: DraftInput,
  options: QueryOptions<Awaited<ReturnType<AgentGraphClient["graphs"]["impact"]>>> = {},
) {
  const client = useAgentGraphClient();
  const draftKey = useDraftKey(input);
  return useQuery({
    queryKey: agentGraphKeys.impact(graphId ?? "", nodeId ?? "", draftKey),
    queryFn: () => client.graphs.impact(graphId!, { nodeId: nodeId!, draft: resolveDraft(input) }),
    enabled: Boolean(graphId && nodeId),
    ...options,
  });
}

export type PoliciesData = {
  /** Effective rules for the graph (or the workspace when no graph). */
  effective: EffectivePolicyRule[];
  /** The workspace's effective rules -- what a graph override replaces. */
  workspace: EffectivePolicyRule[];
  /** The scope's own settings: the graph's overrides, or the workspace defaults. */
  settings: PolicySettings;
  /** The graph's exceptions, or every graph's. */
  exceptions: PolicyException[];
};

/** A graph's (or the workspace's) policies in one query. */
export function usePolicies(graphId?: string | null, options: QueryOptions<PoliciesData> = {}) {
  const client = useAgentGraphClient();
  return useQuery({
    queryKey: agentGraphKeys.policies(graphId ?? undefined),
    queryFn: async (): Promise<PoliciesData> => {
      const scope = graphId ? { graphId } : {};
      const [effective, workspace, settings, exceptions] = await Promise.all([
        client.policies.effective(scope),
        graphId ? client.policies.effective() : Promise.resolve(null),
        graphId ? client.policies.graph.get(graphId) : client.policies.workspace.get(),
        client.policies.exceptions.list(scope),
      ]);
      return { effective, workspace: workspace ?? effective, settings, exceptions };
    },
    ...options,
  });
}

/** The client's resource namespaces, by name (`"prompts"`, `"llmProfiles"`, ...). */
export type ResourceKind = "prompts" | "tools" | "mcpServers" | "agents" | "llmProfiles" | "datasets" | "chatSessions";
type ResourceOf<K extends ResourceKind> = Awaited<ReturnType<AgentGraphClient[K]["list"]>>;

export function useResources<K extends ResourceKind>(kind: K, options: QueryOptions<ResourceOf<K>> = {}) {
  const client = useAgentGraphClient();
  return useQuery({ queryKey: agentGraphKeys.resources(kind), queryFn: () => client[kind].list() as Promise<ResourceOf<K>>, ...options });
}

/** Invalidation helpers bound to the current QueryClient (see `agentGraphInvalidation`). */
export function useAgentGraphInvalidation() {
  const queryClient = useQueryClient();
  return useMemo(() => agentGraphInvalidation(queryClient), [queryClient]);
}
