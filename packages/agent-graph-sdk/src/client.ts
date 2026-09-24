import { buildNamespaces, type AgentGraphNamespaces } from "./api.js";
import { CONTRACT_API_VERSION } from "./generated/openapi.js";
import { streamRun } from "./runs.js";
import { createTransport, type RequestOptions, type Transport, type TransportOptions } from "./transport.js";
import type {
  ChatContext,
  ChatProvider,
  Fixture,
  GraphDefinition,
  PlatformEvent,
  PolicySettings,
  ReplayRequest,
} from "./types.js";

export type {
  AgentGraphNamespaces,
  ChatMessageRequest,
  CreateGraphRequest,
  CreatePolicyExceptionRequest,
  DatasetFromRunsRequest,
  ExtractSubgraphRequest,
  ImpactRequest,
  KnowledgeLineageRequest,
  PolicyRules,
  PublishReleaseRequest,
  ReleaseRunRequest,
  ResumeRunRequest,
  RoutingCompareReleaseRequest,
  RoutingCompareRequest,
  RoutingDatasetRequest,
  RunHandle,
  RunListRequest,
  StartRunRequest,
  UpdatePolicyExceptionRequest,
} from "./api.js";

/** SDK 1/7: transport options (injectable fetch, headers/auth, timeout,
 * retries, hooks) -- see transport.ts. SDK 3/7 adds `onVersionSkew`: called
 * (once per client) when the server's API version is ahead of the contract
 * this SDK was generated from; defaults to a console warning. Pass `false`
 * to silence it. */
export type AgentGraphClientOptions = TransportOptions & {
  onVersionSkew?: ((skew: VersionSkew) => void) | false;
};

export type VersionSkew = { serverVersion: string; clientVersion: string };

/** True when `server` is ahead of `client` by major or minor (x.y.z). */
export function isServerAhead(server: string, client: string): boolean {
  const parse = (version: string) => version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const [sMajor, sMinor] = parse(server);
  const [cMajor, cMinor] = parse(client);
  return sMajor > cMajor || (sMajor === cMajor && sMinor > cMinor);
}

/**
 * The pre-SDK 4/7 flat methods, kept as deprecated aliases of the
 * namespaces (api.ts) for one minor version. Each keeps its old positional
 * signature and return type, and sends exactly the request it always did.
 */
function buildAliases(api: AgentGraphNamespaces) {
  return {
    /** @deprecated Use `client.graphs.list()`. */
    listGraphs: () => api.graphs.list(),
    /** @deprecated Use `client.graphs.get(id)`. */
    getGraph: (id: string) => api.graphs.get(id),
    /** @deprecated Use `client.graphs.create({ name, template })`. */
    createGraph: (name: string, template: "blank" | "demo") => api.graphs.create({ name, template }),
    /** @deprecated Use `client.graphs.update(graph)`. */
    saveGraph: (graph: GraphDefinition) => api.graphs.update(graph),
    /** @deprecated Use `client.graphs.delete(id)`. */
    deleteGraph: (id: string) => api.graphs.delete(id),
    /** @deprecated Use `client.graphs.validate(graph, { signal })`. */
    validateGraph: (graph: GraphDefinition, init?: { signal?: AbortSignal }) => api.graphs.validate(graph, init),
    /** @deprecated Use `client.graphs.compile(id)`. */
    compileGraph: (id: string) => api.graphs.compile(id),
    /** @deprecated Use `client.graphs.health(graphId, draft)`. */
    getGraphHealth: (graphId: string, draft: GraphDefinition) => api.graphs.health(graphId, draft),
    /** @deprecated Use `client.graphs.impact(graphId, { nodeId, draft })`. */
    getNodeImpact: (graphId: string, nodeId: string, draft: GraphDefinition) => api.graphs.impact(graphId, { nodeId, draft }),
    /** @deprecated Use `client.graphs.extractSubgraph(graphId, { draft, nodeIds, name })`. */
    extractSubgraph: (graphId: string, draft: GraphDefinition, request: { node_ids: string[]; name: string }) =>
      api.graphs.extractSubgraph(graphId, { draft, nodeIds: request.node_ids, name: request.name }),
    /** @deprecated Use `client.graphs.usedBy(graphId)`. */
    getGraphUsedBy: (graphId: string) => api.graphs.usedBy(graphId),
    /** @deprecated Use `client.graphs.simulate(graphId, fixture)`. */
    simulateGraph: (graphId: string, fixture: Fixture) => api.graphs.simulate(graphId, fixture),

    /** @deprecated Use `client.runs.list({ graphId })`. */
    listRuns: (graphId: string) => api.runs.list({ graphId }),
    /** @deprecated Use `client.runs.list()`. */
    listAllRuns: () => api.runs.list(),
    /** @deprecated Use `client.runs.get(runId)`. */
    getRun: (runId: string) => api.runs.get(runId),
    /** @deprecated Use `client.runs.start({ graphId, input, ... })` (returns a handle; the run is `.run`). */
    startRun: async (
      graphId: string,
      input: Record<string, unknown>,
      provider?: ChatProvider,
      model?: string,
      apiKey?: string,
      nodeOutputs?: Record<string, unknown>,
    ) => (await api.runs.start({ graphId, input, provider, model, apiKey, nodeOutputs })).run,
    /** @deprecated Use `client.runs.traces(runId)`. */
    getRunNodeTraces: (runId: string) => api.runs.traces(runId),
    /** @deprecated Use `client.runs.snapshot(runId)`. */
    getRunGraphSnapshot: (runId: string) => api.runs.snapshot(runId),
    /** @deprecated Use `client.runs.resume(runId, { approve, reason })`. */
    resumeRun: (runId: string, approve = true, reason?: string) => api.runs.resume(runId, { approve, reason }),
    /** @deprecated Use `client.runs.replay(runId, request)`. */
    replayRun: (runId: string, request?: ReplayRequest) => api.runs.replay(runId, request),

    /** @deprecated Use `client.releases.publish(graphId, { notes, author })`. */
    publishRelease: (graphId: string, releaseNotes?: string, author?: string) =>
      api.releases.publish(graphId, { notes: releaseNotes, author }),
    /** @deprecated Use `client.releases.list(graphId)`. */
    listReleases: (graphId: string) => api.releases.list(graphId),
    /** @deprecated Use `client.releases.get(graphId, releaseId)`. */
    getRelease: (graphId: string, releaseId: string) => api.releases.get(graphId, releaseId),
    /** @deprecated Use `client.releases.compile(releaseId)`. */
    compileRelease: (releaseId: string) => api.releases.compile(releaseId),
    /** @deprecated Use `client.releases.run(releaseId, { input, ... })` (returns a handle; the run is `.run`). */
    startReleaseRun: async (releaseId: string, input: Record<string, unknown>, provider?: ChatProvider, model?: string, apiKey?: string) =>
      (await api.releases.run(releaseId, { input, provider, model, apiKey })).run,
    /** @deprecated Use `client.releases.compare(releaseId, otherReleaseId)`. */
    compareReleases: (releaseId: string, otherReleaseId: string) => api.releases.compare(releaseId, otherReleaseId),
    /** @deprecated Use `client.releases.compareDraft(releaseId, draft)`. */
    compareDraftToRelease: (releaseId: string, draft: GraphDefinition) => api.releases.compareDraft(releaseId, draft),
    /** @deprecated Use `client.releases.simulate(releaseId, fixture)`. */
    simulateRelease: (releaseId: string, fixture: Fixture) => api.releases.simulate(releaseId, fixture),

    /** @deprecated Use `client.policies.catalog()`. */
    getPolicyCatalog: () => api.policies.catalog(),
    /** @deprecated Use `client.policies.workspace.get()`. */
    getWorkspacePolicies: () => api.policies.workspace.get(),
    /** @deprecated Use `client.policies.workspace.save(settings)`. */
    saveWorkspacePolicies: (settings: Pick<PolicySettings, "rules">) => api.policies.workspace.save(settings),
    /** @deprecated Use `client.policies.graph.get(graphId)`. */
    getGraphPolicies: (graphId: string) => api.policies.graph.get(graphId),
    /** @deprecated Use `client.policies.graph.save(graphId, settings)`. */
    saveGraphPolicies: (graphId: string, settings: Pick<PolicySettings, "rules">) => api.policies.graph.save(graphId, settings),
    /** @deprecated Use `client.policies.effective({ graphId })`. */
    getEffectivePolicies: (graphId?: string) => api.policies.effective({ graphId }),
    /** @deprecated Use `client.policies.exceptions.create(graphId, { code, expiresAt, nodeId, reason })`. */
    createPolicyException: (graphId: string, policyCode: string, expiresAt: string, nodeId?: string, reason?: string) =>
      api.policies.exceptions.create(graphId, { code: policyCode, expiresAt, nodeId, reason }),
    /** @deprecated Use `client.policies.exceptions.list({ graphId })`. */
    listPolicyExceptions: (graphId: string) => api.policies.exceptions.list({ graphId }),
    /** @deprecated Use `client.policies.exceptions.list()`. */
    listAllPolicyExceptions: () => api.policies.exceptions.list(),
    /** @deprecated Use `client.policies.exceptions.update(graphId, exceptionId, { expiresAt, reason })`. */
    updatePolicyException: (graphId: string, exceptionId: string, expiresAt: string, reason?: string) =>
      api.policies.exceptions.update(graphId, exceptionId, { expiresAt, reason }),
    /** @deprecated Use `client.policies.exceptions.delete(graphId, exceptionId)`. */
    deletePolicyException: (graphId: string, exceptionId: string) => api.policies.exceptions.delete(graphId, exceptionId),

    /** @deprecated Use `client.routingLab.run(graphId, { dataset })`. */
    runRoutingDataset: (graphId: string, dataset: Fixture[]) => api.routingLab.run(graphId, { dataset }),
    /** @deprecated Use `client.routingLab.compareRelease(graphId, { releaseId, dataset })`. */
    compareRoutingToRelease: (graphId: string, releaseId: string, dataset: Fixture[]) =>
      api.routingLab.compareRelease(graphId, { releaseId, dataset }),
    /** @deprecated Use `client.routingLab.compare(graphId, { otherGraphId, dataset })`. */
    compareRoutingDatasets: (graphId: string, otherGraphId: string, dataset: Fixture[]) =>
      api.routingLab.compare(graphId, { otherGraphId, dataset }),

    /** @deprecated Use `client.knowledge.get(graphId)`. */
    getKnowledge: (graphId: string) => api.knowledge.get(graphId),
    /** @deprecated Use `client.knowledge.upload(graphId, file)`. */
    uploadKnowledgeDocument: (graphId: string, file: File) => api.knowledge.upload(graphId, file),
    /** @deprecated Use `client.knowledge.delete(graphId, documentId)`. */
    deleteKnowledgeDocument: (graphId: string, documentId: string) => api.knowledge.delete(graphId, documentId),
    /** @deprecated Use `client.knowledge.lineage(graphId, { documentId })`. */
    getKnowledgeLineage: (graphId: string, documentId?: string) => api.knowledge.lineage(graphId, { documentId }),

    /** @deprecated Use `client.analytics.dashboard()`. */
    getAnalytics: () => api.analytics.dashboard(),
    /** @deprecated Use `client.analytics.graph(graphId, { window })`. */
    getGraphAnalytics: (graphId: string, window?: number) => api.analytics.graph(graphId, { window }),
    /** @deprecated Use `client.analytics.nodeHistory(graphId, nodeId, { limit })`. */
    getNodeHistory: (graphId: string, nodeId: string, limit?: number) => api.analytics.nodeHistory(graphId, nodeId, { limit }),

    /** @deprecated Use `client.providers.ready(provider)`. */
    providerReady: (provider: ChatProvider) => api.providers.ready(provider),
    /** @deprecated Use `client.providers.credentials(provider)`. */
    providerCredentials: (provider: ChatProvider) => api.providers.credentials(provider),
    /** @deprecated Use `client.providers.models(provider, { graphId })`. */
    listProviderModels: (provider: ChatProvider, graphId?: string) => api.providers.models(provider, { graphId }),
    /** @deprecated Use `client.runtimeTargets.capabilities(targetId)`. */
    getRuntimeTargetCapabilities: (targetId: string) => api.runtimeTargets.capabilities(targetId),

    /** @deprecated Use `client.datasets.fromRuns(request)`. */
    createDatasetFromRuns: (request: { name: string; description?: string; runIds: string[]; includeNodeOutputs?: boolean }) =>
      api.datasets.fromRuns(request),
    /** @deprecated Use `client.chatSessions.send(sessionId, { content, context })`. */
    sendChatMessage: (sessionId: string, content: string, context?: ChatContext) => api.chatSessions.send(sessionId, { content, context }),
  };
}

/** The deprecated flat methods -- `Omit<AgentGraphClient, keyof
 * DeprecatedClientMethods>` is a client type that can't call them. */
export type DeprecatedClientMethods = ReturnType<typeof buildAliases>;

export type AgentGraphClient = AgentGraphNamespaces &
  ReturnType<typeof buildAliases> & {
    /** SDK 1/7: the same client with per-call options applied to every call
     * made through it -- e.g. `client.with({ signal }).graphs.get(id)`. */
    with(options: RequestOptions): AgentGraphClient;
  };

/** @deprecated SDK 4/7 -- the run namespace is `AgentGraphClient["runs"]`. */
export type RunsClient = AgentGraphClient["runs"];

function scopedClient(transport: Transport): AgentGraphClient {
  const api = buildNamespaces(transport);
  return { ...api, ...buildAliases(api), with: (options) => scopedClient(transport.with(options)) };
}

export function createAgentGraphClient(options: AgentGraphClientOptions = {}): AgentGraphClient {
  const { onVersionSkew, ...transportOptions } = options;
  let warned = false;
  const report =
    onVersionSkew === false
      ? undefined
      : (onVersionSkew ??
        ((skew: VersionSkew) =>
          console.warn(
            `[agent-graph-sdk] API server is at ${skew.serverVersion}, ahead of this SDK's contract ${skew.clientVersion}; upgrade the SDK for new fields and routes.`,
          )));
  return scopedClient(
    createTransport({
      ...transportOptions,
      onApiVersion: (serverVersion) => {
        transportOptions.onApiVersion?.(serverVersion);
        if (warned || !report || !isServerAhead(serverVersion, CONTRACT_API_VERSION)) return;
        warned = true;
        report({ serverVersion, clientVersion: CONTRACT_API_VERSION });
      },
    }),
  );
}

/**
 * @deprecated SDK 2/7 -- use `client.runs.stream(runId)` (an async
 * iterator that works outside the browser and resumes after drops) or
 * `client.runs.wait(runId, { onEvent })`. Kept as a callback wrapper over
 * the same resumable stream; `onClose` fires once the stream ends for any
 * reason (settled run, no live bus, or error).
 */
export function streamRunEvents(
  baseUrl: string,
  runId: string,
  onEvent: (event: PlatformEvent) => void,
  onClose?: () => void,
): () => void {
  const controller = new AbortController();
  void (async () => {
    try {
      for await (const event of streamRun(createTransport({ baseUrl }), runId, { signal: controller.signal })) onEvent(event);
    } catch {
      // Reported via onClose; callers poll getRun for the outcome.
    } finally {
      if (!controller.signal.aborted) onClose?.();
    }
  })();
  return () => controller.abort();
}
