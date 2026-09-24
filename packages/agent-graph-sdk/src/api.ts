import type { z } from "zod";

import { listReader, type IterateRequest, type PageRequest } from "./pagination.js";
import { streamRun, waitForRun, type RunStreamOptions, type WaitForRunOptions } from "./runs.js";
import {
  agentProfileSchema,
  analyticsDashboardPayloadSchema,
  capabilityMatrixSchema,
  chatSessionSchema,
  compileResultSchema,
  counterfactualResultSchema,
  deletedSchema,
  effectivePolicyRuleSchema,
  fixtureDatasetSchema,
  graphAnalyticsSchema,
  graphDefinitionSchema,
  graphHealthSchema,
  graphReleaseSchema,
  graphSummarySchema,
  graphUsedBySchema,
  knowledgeDeleteResponseSchema,
  knowledgeLineageEntrySchema,
  knowledgeSummarySchema,
  knowledgeUploadResponseSchema,
  llmProfileSchema,
  mcpServerConfigSchema,
  nodeExecutionSchema,
  nodeImpactSchema,
  nodeTraceSchema,
  policyExceptionSchema,
  policyRuleInfoSchema,
  policySettingsSchema,
  promptTemplateSchema,
  providerCredentialsSchema,
  providerModelCatalogSchema,
  providerReadySchema,
  publishReleaseResponseSchema,
  publishResourceVersionResponseSchema,
  releaseDiffSchema,
  releaseIndexEntrySchema,
  resourceUsageSchema,
  resourceVersionIndexEntrySchema,
  resourceVersionSchema,
  routingComparisonSchema,
  routingLabReportSchema,
  runGraphSnapshotSchema,
  runSummarySchema,
  simulateResultSchema,
  subgraphExtractResponseSchema,
  toolDefinitionSchema,
} from "./schemas.js";
import { path, query, type Transport } from "./transport.js";
import type {
  ChatContext,
  ChatProvider,
  Fixture,
  GraphDefinition,
  PlatformEvent,
  PolicySettings,
  ReplayRequest,
  RunSummary,
} from "./types.js";

/**
 * The namespaced client API (SDK 4/7 -- docs/planning/features/
 * sdk-hardening-plan.md, Phase 2, STO-617): `client.graphs.get(id)`,
 * `client.releases.publish(graphId, { notes })`, ... Conventions:
 *
 * - The resource's own id(s) are positional; everything else is one
 *   camelCase request object (the SDK maps it to the API's snake_case).
 * - Every list has `list()` (the whole list, as before), `listPage({ limit,
 *   cursor })` (one page + `nextCursor`) and `iterate()` (every item, a page
 *   at a time -- the only way past the runs routes' unpaged caps).
 *
 * The flat methods (`client.getGraph`, ...) are deprecated aliases of these
 * (see aliases.ts).
 */

// ------------------------------------------------------------ request types

export type CreateGraphRequest = { name: string; template?: "blank" | "demo" };
export type ImpactRequest = { nodeId: string; draft: GraphDefinition };
export type ExtractSubgraphRequest = { draft: GraphDefinition; nodeIds: string[]; name: string };

export type StartRunRequest = {
  graphId: string;
  input: Record<string, unknown>;
  provider?: ChatProvider;
  model?: string;
  apiKey?: string;
  /** Pre-seeded node outputs ("run from selected node"): these nodes are skipped. */
  nodeOutputs?: Record<string, unknown>;
};
export type RunListRequest = { graphId?: string };
export type ResumeRunRequest = { approve?: boolean; reason?: string };

export type PublishReleaseRequest = { notes?: string; author?: string };
export type ReleaseRunRequest = Omit<StartRunRequest, "graphId" | "nodeOutputs">;

export type PolicyRules = Pick<PolicySettings, "rules">;
export type CreatePolicyExceptionRequest = { code: string; expiresAt: string; nodeId?: string; reason?: string };
export type UpdatePolicyExceptionRequest = { expiresAt: string; reason?: string };

export type RoutingDatasetRequest = { dataset: Fixture[] };
export type RoutingCompareRequest = RoutingDatasetRequest & { otherGraphId: string };
export type RoutingCompareReleaseRequest = RoutingDatasetRequest & { releaseId: string };

export type KnowledgeLineageRequest = { documentId?: string };
export type DatasetFromRunsRequest = { name: string; description?: string; runIds: string[]; includeNodeOutputs?: boolean };
export type ChatMessageRequest = { content: string; context?: ChatContext };

export type RunHandle = {
  /** The run as the start call returned it (usually queued or running). */
  run: RunSummary;
  stream(options?: RunStreamOptions): AsyncGenerator<PlatformEvent>;
  wait(options?: WaitForRunOptions): Promise<RunSummary>;
};

// ------------------------------------------------------------ builders

const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

function paged<T, P extends object = object>(
  transport: Transport,
  route: (params: P) => string,
  schema: z.ZodType<T>,
  toQuery: (params: P) => Record<string, string | undefined> = () => ({}),
) {
  const reader = (params: P) => listReader(transport, route(params), schema);
  return {
    list: (params = {} as P) => reader(params).list(toQuery(params)),
    listPage: (request: P & PageRequest) => reader(request).page(toQuery(request), request),
    iterate: (request = {} as P & IterateRequest) => reader(request).iterate(toQuery(request), request),
  };
}

function resourceNamespace<T extends { id: string }>(transport: Transport, route: string, schema: z.ZodType<T>) {
  return {
    ...paged(transport, () => `/api/${route}`, schema),
    get: (id: string) => transport.request(`/api/${route}${path`/${id}`}`, undefined, schema),
    create: (resource: T) => transport.request(`/api/${route}`, json(resource), schema),
    update: (resource: T) =>
      transport.request(`/api/${route}${path`/${resource.id}`}`, { method: "PUT", body: JSON.stringify(resource) }, schema),
    delete: (id: string) => transport.request(`/api/${route}${path`/${id}`}`, { method: "DELETE" }, deletedSchema),
    /** Wave 4a "used by": draft graph nodes bound to this resource. */
    usages: (id: string) => transport.request(`/api/${route}${path`/${id}/usages`}`, undefined, resourceUsageSchema.array()),
  };
}

/** A reusable entity's immutable publish history (never chat sessions or datasets). */
function versionNamespace(transport: Transport, route: string) {
  const versions = (resourceId: string) => `/api/${route}${path`/${resourceId}/versions`}`;
  const reader = paged(transport, (p: { resourceId: string }) => versions(p.resourceId), resourceVersionIndexEntrySchema);
  return {
    publish: (resourceId: string) => transport.request(versions(resourceId), { method: "POST" }, publishResourceVersionResponseSchema),
    list: (resourceId: string) => reader.list({ resourceId }),
    listPage: (resourceId: string, request: PageRequest) => reader.listPage({ resourceId, ...request }),
    iterate: (resourceId: string, request?: IterateRequest) => reader.iterate({ resourceId, ...request }),
    get: (resourceId: string, versionId: string) =>
      transport.request(`${versions(resourceId)}${path`/${versionId}`}`, undefined, resourceVersionSchema),
  };
}

export function buildNamespaces(transport: Transport) {
  const getRun = (runId: string) => transport.request(path`/api/runs/${runId}`, undefined, runSummarySchema);
  const stream = (runId: string, options?: RunStreamOptions) => streamRun(transport, runId, options);
  const wait = (runId: string, options?: WaitForRunOptions) => waitForRun({ transport, getRun }, runId, options);
  const handle = (run: RunSummary): RunHandle => ({
    run,
    stream: (options) => stream(run.run_id, options),
    wait: (options) => wait(run.run_id, options),
  });
  const runs = paged(
    transport,
    (p: RunListRequest) => (p.graphId ? path`/api/graphs/${p.graphId}/runs` : "/api/runs"),
    runSummarySchema,
  );
  const releases = paged(transport, (p: { graphId: string }) => path`/api/graphs/${p.graphId}/releases`, releaseIndexEntrySchema);
  const exceptions = paged(
    transport,
    (p: { graphId?: string }) => (p.graphId ? path`/api/graphs/${p.graphId}/policy-exceptions` : "/api/policy-exceptions"),
    policyExceptionSchema,
  );
  const lineage = paged(
    transport,
    (p: { graphId: string } & KnowledgeLineageRequest) => path`/api/graphs/${p.graphId}/knowledge/lineage`,
    knowledgeLineageEntrySchema,
    (p) => ({ document_id: p.documentId }),
  );

  return {
    graphs: {
      ...paged(transport, () => "/api/graphs", graphDefinitionSchema),
      get: (graphId: string) => transport.request(path`/api/graphs/${graphId}`, undefined, graphDefinitionSchema),
      /** Every graph without nodes/edges -- prefer this over `list()` for
       * lists and pickers: the server reads one catalog, not every graph. */
      summaries: paged(transport, () => "/api/graph-summaries", graphSummarySchema),
      create: (request: CreateGraphRequest) =>
        transport.request("/api/graphs", json({ name: request.name, template: request.template ?? "blank" }), graphDefinitionSchema),
      update: (graph: GraphDefinition) =>
        transport.request(path`/api/graphs/${graph.id}`, { method: "PUT", body: JSON.stringify(graph) }, graphDefinitionSchema),
      delete: (graphId: string) => transport.request(path`/api/graphs/${graphId}`, { method: "DELETE" }, deletedSchema),
      /** Compile diagnostics for an unsaved graph. */
      validate: (graph: GraphDefinition, init?: { signal?: AbortSignal }) =>
        transport.request("/api/graphs/validate", { ...json(graph), signal: init?.signal }, compileResultSchema),
      compile: (graphId: string) => transport.request(path`/api/graphs/${graphId}/compile`, { method: "POST" }, compileResultSchema),
      /** Wave 7a: 0-100 health score for a draft (unsaved edits included). */
      health: (graphId: string, draft: GraphDefinition) =>
        transport.request(path`/api/graphs/${graphId}/health`, json(draft), graphHealthSchema),
      /** Wave 7a: what changing `nodeId` reaches, against a draft. */
      impact: (graphId: string, request: ImpactRequest) =>
        transport.request(path`/api/graphs/${graphId}/nodes/${request.nodeId}/impact`, json(request.draft), nodeImpactSchema),
      /** Wave 7c: move a connected selection into a new saved graph; returns
       * it plus the parent with a subgraph node in its place (unsaved). */
      extractSubgraph: (graphId: string, request: ExtractSubgraphRequest) =>
        transport.request(
          path`/api/graphs/${graphId}/extract-subgraph`,
          json({ draft: request.draft, node_ids: request.nodeIds, name: request.name }),
          subgraphExtractResponseSchema,
        ),
      /** Wave 7c: saved graphs whose subgraph nodes reference `graphId`. */
      usedBy: (graphId: string) => transport.request(path`/api/graphs/${graphId}/used-by`, undefined, graphUsedBySchema),
      /** Runs the draft with no live tool/LLM calls (`fixture.node_outputs` stubs nodes). */
      simulate: (graphId: string, fixture: Fixture) =>
        transport.request(path`/api/graphs/${graphId}/simulate`, json(fixture), simulateResultSchema),
    },

    runs: {
      ...runs,
      start: async (request: StartRunRequest): Promise<RunHandle> =>
        handle(
          await transport.request(
            "/api/runs",
            json({
              graph_id: request.graphId,
              input: request.input,
              provider: request.provider,
              model: request.model,
              api_key: request.apiKey,
              ...(request.nodeOutputs ? { node_outputs: request.nodeOutputs } : {}),
            }),
            runSummarySchema,
          ),
        ),
      get: getRun,
      traces: (runId: string) => transport.request(path`/api/runs/${runId}/nodes`, undefined, nodeTraceSchema.array()),
      /** The exact graph (and resolved bindings) the run started from. */
      snapshot: (runId: string) => transport.request(path`/api/runs/${runId}/snapshot`, undefined, runGraphSnapshotSchema),
      /** Read-only re-execution of a past run; with a request, counterfactual
       * (forced routes and/or model overrides). */
      replay: (runId: string, request?: ReplayRequest) =>
        transport.request(path`/api/runs/${runId}/replay`, request ? json(request) : { method: "POST" }, counterfactualResultSchema),
      /** Resolves a `human_gate` checkpoint; `approve: false` fails the run. */
      resume: (runId: string, request: ResumeRunRequest = {}) =>
        transport.request(path`/api/runs/${runId}/resume`, json({ approve: request.approve ?? true, reason: request.reason }), runSummarySchema),
      stream,
      wait,
    },

    releases: {
      publish: (graphId: string, request: PublishReleaseRequest = {}) =>
        transport.request(
          path`/api/graphs/${graphId}/releases`,
          json({ release_notes: request.notes, author: request.author }),
          publishReleaseResponseSchema,
        ),
      list: (graphId: string) => releases.list({ graphId }),
      listPage: (graphId: string, request: PageRequest) => releases.listPage({ graphId, ...request }),
      iterate: (graphId: string, request?: IterateRequest) => releases.iterate({ graphId, ...request }),
      get: (graphId: string, releaseId: string) =>
        transport.request(path`/api/graphs/${graphId}/releases/${releaseId}`, undefined, graphReleaseSchema),
      compile: (releaseId: string) => transport.request(path`/api/graph-releases/${releaseId}/compile`, { method: "POST" }, compileResultSchema),
      /** Categorized behavior-level diff between two releases. */
      compare: (releaseId: string, otherReleaseId: string) =>
        transport.request(path`/api/graph-releases/${releaseId}/compare/${otherReleaseId}`, undefined, releaseDiffSchema),
      /** Diff from a release to a draft (e.g. the live canvas). */
      compareDraft: (releaseId: string, draft: GraphDefinition) =>
        transport.request(path`/api/graph-releases/${releaseId}/compare-draft`, json(draft), releaseDiffSchema),
      run: async (releaseId: string, request: ReleaseRunRequest): Promise<RunHandle> =>
        handle(
          await transport.request(
            path`/api/graph-releases/${releaseId}/runs`,
            json({ input: request.input, provider: request.provider, model: request.model, api_key: request.apiKey }),
            runSummarySchema,
          ),
        ),
      simulate: (releaseId: string, fixture: Fixture) =>
        transport.request(path`/api/graph-releases/${releaseId}/simulate`, json(fixture), simulateResultSchema),
    },

    policies: {
      catalog: () => transport.request("/api/policies/catalog", undefined, policyRuleInfoSchema.array()),
      workspace: {
        get: () => transport.request("/api/policies/workspace", undefined, policySettingsSchema),
        save: (settings: PolicyRules) =>
          transport.request("/api/policies/workspace", { method: "PUT", body: JSON.stringify({ rules: settings.rules }) }, policySettingsSchema),
      },
      graph: {
        get: (graphId: string) => transport.request(path`/api/graphs/${graphId}/policies`, undefined, policySettingsSchema),
        save: (graphId: string, settings: PolicyRules) =>
          transport.request(path`/api/graphs/${graphId}/policies`, { method: "PUT", body: JSON.stringify({ rules: settings.rules }) }, policySettingsSchema),
      },
      /** Resolved rules: the workspace's, or a graph's with its overrides. */
      effective: (request: { graphId?: string } = {}) =>
        transport.request(
          request.graphId ? path`/api/graphs/${request.graphId}/policies/effective` : "/api/policies/effective",
          undefined,
          effectivePolicyRuleSchema.array(),
        ),
      /** Time-boxed waivers for a policy diagnostic; `list()` without a
       * graphId is every graph's. */
      exceptions: {
        ...exceptions,
        create: (graphId: string, request: CreatePolicyExceptionRequest) =>
          transport.request(
            path`/api/graphs/${graphId}/policy-exceptions`,
            json({ policy_code: request.code, node_id: request.nodeId, reason: request.reason, expires_at: request.expiresAt }),
            policyExceptionSchema,
          ),
        /** Extend (or shorten) a waiver; `reason` is kept when omitted. */
        update: (graphId: string, exceptionId: string, request: UpdatePolicyExceptionRequest) =>
          transport.request(
            path`/api/graphs/${graphId}/policy-exceptions/${exceptionId}`,
            { method: "PATCH", body: JSON.stringify({ expires_at: request.expiresAt, reason: request.reason }) },
            policyExceptionSchema,
          ),
        delete: (graphId: string, exceptionId: string) =>
          transport.request(path`/api/graphs/${graphId}/policy-exceptions/${exceptionId}`, { method: "DELETE" }, deletedSchema),
      },
    },

    /** Runs a dataset of fixtures (via simulate) and aggregates route decisions. */
    routingLab: {
      run: (graphId: string, request: RoutingDatasetRequest) =>
        transport.request(path`/api/graphs/${graphId}/routing-lab/run`, json({ dataset: request.dataset }), routingLabReportSchema),
      compare: (graphId: string, request: RoutingCompareRequest) =>
        transport.request(
          path`/api/graphs/${graphId}/routing-lab/compare/${request.otherGraphId}`,
          json({ dataset: request.dataset }),
          routingComparisonSchema,
        ),
      /** The dataset on a release (baseline; `"latest"` allowed) vs the saved draft. */
      compareRelease: (graphId: string, request: RoutingCompareReleaseRequest) =>
        transport.request(
          path`/api/graphs/${graphId}/routing-lab/compare-release/${request.releaseId}`,
          json({ dataset: request.dataset }),
          routingComparisonSchema,
        ),
    },

    /** Per-graph .txt/.md documents, chunked + embedded on upload. */
    knowledge: {
      get: (graphId: string) => transport.request(path`/api/graphs/${graphId}/knowledge`, undefined, knowledgeSummarySchema),
      upload: (graphId: string, file: File) => {
        const form = new FormData();
        form.append("file", file);
        // Not a string body, so the runtime sets the multipart boundary.
        return transport.request(path`/api/graphs/${graphId}/knowledge`, { method: "POST", body: form }, knowledgeUploadResponseSchema);
      },
      delete: (graphId: string, documentId: string) =>
        transport.request(path`/api/graphs/${graphId}/knowledge/${documentId}`, { method: "DELETE" }, knowledgeDeleteResponseSchema),
      /** Which runs/nodes retrieved from this knowledge base (or one document). */
      lineage: (graphId: string, request: KnowledgeLineageRequest = {}) => lineage.list({ graphId, ...request }),
      lineagePage: (graphId: string, request: KnowledgeLineageRequest & PageRequest) => lineage.listPage({ graphId, ...request }),
      iterateLineage: (graphId: string, request: KnowledgeLineageRequest & IterateRequest = {}) => lineage.iterate({ graphId, ...request }),
    },

    analytics: {
      /** Workspace run analytics and spend estimates. */
      dashboard: () => transport.request("/api/analytics", undefined, analyticsDashboardPayloadSchema),
      /** Per-node rollups over the graph's most recent `window` runs. */
      graph: (graphId: string, request: { window?: number } = {}) =>
        transport.request(`${path`/api/graphs/${graphId}/analytics`}${query({ window: request.window || undefined })}`, undefined, graphAnalyticsSchema),
      /** One node's most recent executions, newest first. */
      nodeHistory: (graphId: string, nodeId: string, request: { limit?: number } = {}) =>
        transport.request(
          `${path`/api/graphs/${graphId}/nodes/${nodeId}/history`}${query({ limit: request.limit || undefined })}`,
          undefined,
          nodeExecutionSchema.array(),
        ),
    },

    providers: {
      ready: (provider: ChatProvider) => transport.request(path`/api/providers/${provider}/ready`, undefined, providerReadySchema),
      credentials: (provider: ChatProvider) => transport.request(path`/api/providers/${provider}/credentials`, undefined, providerCredentialsSchema),
      models: (provider: ChatProvider, request: { graphId?: string } = {}) =>
        transport.request(`${path`/api/providers/${provider}/models`}${query({ graph_id: request.graphId })}`, undefined, providerModelCatalogSchema),
    },

    runtimeTargets: {
      capabilities: (targetId: string) => transport.request(path`/api/runtime-targets/${targetId}/capabilities`, undefined, capabilityMatrixSchema),
    },

    // Stored resources. `.versions` is a reusable entity's immutable publish history.
    prompts: { ...resourceNamespace(transport, "prompts", promptTemplateSchema), versions: versionNamespace(transport, "prompts") },
    tools: { ...resourceNamespace(transport, "tools", toolDefinitionSchema), versions: versionNamespace(transport, "tools") },
    mcpServers: { ...resourceNamespace(transport, "mcp-servers", mcpServerConfigSchema), versions: versionNamespace(transport, "mcp-servers") },
    agents: { ...resourceNamespace(transport, "agents", agentProfileSchema), versions: versionNamespace(transport, "agents") },
    llmProfiles: { ...resourceNamespace(transport, "llm-profiles", llmProfileSchema), versions: versionNamespace(transport, "llm-profiles") },
    /** Saved Routing Lab fixture datasets. */
    datasets: {
      ...resourceNamespace(transport, "datasets", fixtureDatasetSchema),
      /** Captures a dataset from historical runs. */
      fromRuns: (request: DatasetFromRunsRequest) =>
        transport.request(
          "/api/datasets/from-runs",
          json({
            name: request.name,
            description: request.description,
            run_ids: request.runIds,
            include_node_outputs: request.includeNodeOutputs ?? true,
          }),
          fixtureDatasetSchema,
        ),
    },
    /** The direct-model scratchpad. */
    chatSessions: {
      ...resourceNamespace(transport, "chat-sessions", chatSessionSchema),
      send: (sessionId: string, request: ChatMessageRequest) =>
        transport.request(path`/api/chat-sessions/${sessionId}/messages`, json({ content: request.content, context: request.context }), chatSessionSchema),
    },
  };
}

export type AgentGraphNamespaces = ReturnType<typeof buildNamespaces>;
