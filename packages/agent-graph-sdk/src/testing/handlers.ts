import { http, HttpResponse, type HttpHandler } from "msw";

import { summarizeGraph } from "../graph/summary.js";
import { downstream, upstream } from "../graph/traverse.js";
import { validateStructure } from "../graph/validate.js";
import { documentFingerprint, semanticFingerprint } from "../schema.js";
import type {
  ChatSession,
  CompileResult,
  Diagnostic,
  EffectivePolicyRule,
  Fixture,
  FixtureDataset,
  GraphDefinition,
  GraphRelease,
  KnowledgeLineageEntry,
  NodeTrace,
  PlatformEvent,
  PolicyException,
  PolicySettings,
  ReleaseDiff,
  ResourceVersion,
  RouteDecision,
  RoutingLabReport,
  RunGraphSnapshot,
  RunSummary,
} from "../types.js";
import { demoGraph, FIXED_TIME, makeEffectivePolicy, makePolicyCatalog, releaseIndexEntry } from "./fixtures.js";

/**
 * MSW handlers for every API route (SDK 5/7, STO-620), backed by an
 * in-memory store: graphs, runs, releases, policies, knowledge and every
 * resource kind keep state across requests, so a test can create, run,
 * publish and list with no backend. A test in this package checks the
 * handler table against contract/openapi.json, so a new route can't ship
 * without a mock.
 *
 *     import { setupServer } from "msw/node";
 *     import { createHandlers, createMockStore } from "@bstockwelldev/agent-graph-sdk/testing";
 *     const store = createMockStore();
 *     const server = setupServer(...createHandlers({ store }));
 *
 * Runs finish synchronously: `POST /api/runs` returns a succeeded run with
 * a stub trace per reachable node (routers take their default edge), and
 * `GET /api/runs/{id}/events` replays its events as SSE. Validation and
 * compile use the SDK's local `validateStructure`, so they report
 * structural diagnostics only.
 */

type Json = Record<string, unknown>;
type RunRecord = { summary: RunSummary; traces: NodeTrace[]; events: PlatformEvent[]; snapshot: RunGraphSnapshot };

export const RESOURCE_KINDS = ["prompts", "tools", "mcp-servers", "agents", "llm-profiles", "transforms", "datasets", "chat-sessions"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
const VERSIONED: ReadonlySet<ResourceKind> = new Set(["prompts", "tools", "mcp-servers", "agents", "llm-profiles", "transforms"]);

/** Server-side defaults the backend's resource models apply on create. */
const RESOURCE_DEFAULTS: Record<ResourceKind, () => Json> = {
  prompts: () => ({}),
  tools: () => ({ description: "", parameters_json: "{}", requires_approval: false }),
  "mcp-servers": () => ({ transport: "http", enabled: true }),
  agents: () => ({ optional_elements: [] }),
  "llm-profiles": () => ({}),
  transforms: () => ({}),
  datasets: () => ({ fixtures: [], source: "manual", source_run_ids: [], created_at: now(), updated_at: now() }),
  "chat-sessions": () => ({ messages: [], created_at: now(), updated_at: now() }),
};

export type MockStore = {
  graphs: Map<string, GraphDefinition>;
  runs: Map<string, RunRecord>;
  releases: Map<string, GraphRelease>;
  resources: Record<ResourceKind, Map<string, Json>>;
  versions: Map<string, ResourceVersion[]>;
  workspacePolicies: PolicySettings;
  graphPolicies: Map<string, PolicySettings>;
  exceptions: Map<string, PolicyException>;
  knowledge: Map<string, { id: string; name: string; mime_type: string; uploaded_at: string; char_count: number }[]>;
  lineage: KnowledgeLineageEntry[];
  sequence: number;
};

export type MockSeed = {
  /** Default: the demo graph. */
  graphs?: GraphDefinition[];
  resources?: Partial<Record<ResourceKind, Json[]>>;
  exceptions?: PolicyException[];
};

export function createMockStore(seed: MockSeed = {}): MockStore {
  const resources = Object.fromEntries(RESOURCE_KINDS.map((kind) => [kind, new Map<string, Json>()])) as MockStore["resources"];
  for (const [kind, items] of Object.entries(seed.resources ?? {}) as [ResourceKind, Json[]][]) {
    for (const item of items) resources[kind].set(String(item.id), { ...RESOURCE_DEFAULTS[kind](), ...item });
  }
  return {
    graphs: new Map((seed.graphs ?? [demoGraph()]).map((graph) => [graph.id, graph])),
    runs: new Map(),
    releases: new Map(),
    resources,
    versions: new Map(),
    workspacePolicies: { rules: {}, updated_at: null },
    graphPolicies: new Map(),
    exceptions: new Map((seed.exceptions ?? []).map((exception) => [exception.id, exception])),
    knowledge: new Map(),
    lineage: [],
    sequence: 0,
  };
}

// ------------------------------------------------------------ helpers

function now(): string {
  return FIXED_TIME;
}

function nextId(store: MockStore, prefix: string): string {
  store.sequence += 1;
  return `${prefix}_${String(store.sequence).padStart(4, "0")}`;
}

const notFound = (what: string) => HttpResponse.json({ detail: `${what} not found` }, { status: 404 });

/** The API's opt-in cursor pagination (backend/app/pagination.py), over the list's current order. */
function listResponse<T>(request: Request, items: readonly T[]): Response {
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  if (!limit && !url.searchParams.has("cursor")) return HttpResponse.json(items as unknown[]);
  const start = url.searchParams.has("cursor") ? Number(url.searchParams.get("cursor")) : 0;
  if (!Number.isInteger(start) || start < 0) return HttpResponse.json({ detail: "invalid cursor" }, { status: 400 });
  const size = Number(limit ?? 500);
  const page = items.slice(start, start + size);
  const headers: Record<string, string> = start + size < items.length ? { "X-Next-Cursor": String(start + size) } : {};
  return HttpResponse.json(page as unknown[], { headers });
}

function compile(graph: GraphDefinition): CompileResult {
  const diagnostics = validateStructure(graph);
  const ok = !diagnostics.some((diagnostic) => diagnostic.blocking);
  return { graph_id: graph.id, compiled_workflow_id: ok ? `wf_${graph.id}` : null, diagnostics, ok };
}

function blocked(diagnostics: Diagnostic[], message: string): Response {
  return HttpResponse.json({ detail: { message, diagnostics } }, { status: 422 });
}

/** Deterministic stub execution: every node on the path the default
 * routes take, in dependency order, each echoing the run input. */
function execute(graph: GraphDefinition, input: Json, nodeOutputs: Json = {}): { traces: NodeTrace[]; routes: RouteDecision[]; result: string } {
  const traces: NodeTrace[] = [];
  const routes: RouteDecision[] = [];
  const visited = new Set<string>();
  const question = String(input.question ?? Object.values(input)[0] ?? "");
  const queue = graph.nodes.some((node) => node.id === graph.entry_node_id) ? [graph.entry_node_id] : [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = graph.nodes.find((candidate) => candidate.id === id)!;
    const output = id in nodeOutputs ? nodeOutputs[id] : node.type === "output" ? `stub answer: ${question}` : question;
    traces.push({ node_id: id, node_type: node.type, status: "succeeded", input, output, started_at: now(), completed_at: now(), error: null });
    const outgoing = graph.edges.filter((edge) => edge.source === id);
    if (node.type === "router" || node.type === "branch") {
      const taken = outgoing.find((edge) => edge.kind === "default") ?? outgoing[0];
      if (taken) {
        routes.push({ nodeId: id, selectedEdgeId: taken.id, selectedTargetNodeId: taken.target });
        queue.push(taken.target);
      }
    } else {
      queue.push(...outgoing.map((edge) => edge.target));
    }
  }
  return { traces, routes, result: `stub answer: ${question}` };
}

function startRun(store: MockStore, graph: GraphDefinition, body: Json, releaseId: string | null): RunRecord {
  const runId = nextId(store, "run");
  const input = (body.input as Json) ?? {};
  const { traces, routes, result } = execute(graph, input, (body.node_outputs as Json) ?? {});
  const fingerprint = semanticFingerprint(graph);
  const summary: RunSummary = {
    run_id: runId,
    graph_id: graph.id,
    status: "succeeded",
    result,
    input,
    provider: typeof body.provider === "string" ? body.provider : "stub",
    error: null,
    started_at: now(),
    completed_at: now(),
    route_decisions: routes,
    graph_release_id: releaseId,
    graph_fingerprint: fingerprint,
    source: releaseId ? "release" : "draft_snapshot",
    runtime_target: "langgraph",
  };
  let sequence = 0;
  const event = (event_type: PlatformEvent["event_type"], node_id: string | null = null, payload: Json = {}): PlatformEvent => ({
    event_type,
    run_id: runId,
    node_id,
    occurred_at: now(),
    sequence: ++sequence,
    payload,
  });
  const events = [
    event("run.started"),
    ...traces.flatMap((trace) => [event("node.started", trace.node_id), event("node.completed", trace.node_id, { output: trace.output })]),
    event("run.completed", null, { result }),
  ];
  const snapshot: RunGraphSnapshot = {
    run_id: runId,
    graph_id: graph.id,
    source: summary.source!,
    graph_fingerprint: fingerprint,
    release_id: releaseId,
    graph: releaseId ? null : graph,
    resource_snapshots: releaseId ? null : {},
    created_at: now(),
  };
  const record = { summary, traces, events, snapshot };
  store.runs.set(runId, record);
  return record;
}

function effectivePolicies(store: MockStore, graphId?: string): EffectivePolicyRule[] {
  const graph = graphId ? store.graphPolicies.get(graphId)?.rules ?? {} : {};
  return makePolicyCatalog().map((rule) => {
    const base = makeEffectivePolicy(rule);
    const workspace = store.workspacePolicies.rules[rule.code];
    const local = graph[rule.code];
    const enforcement = local?.enforcement ?? workspace?.enforcement ?? rule.default_enforcement;
    const enforcement_source = local?.enforcement ? "graph" : workspace?.enforcement ? "workspace" : "default";
    const params = { ...base.params };
    const param_sources = { ...base.param_sources };
    for (const [source, settings] of [["workspace", workspace], ["graph", local]] as const) {
      for (const [name, value] of Object.entries(settings?.params ?? {})) {
        params[name] = value;
        param_sources[name] = source;
      }
    }
    return { ...base, enforcement, enforcement_source, params, param_sources };
  });
}

function diffGraphs(fromId: string, from: GraphDefinition, toId: string | null, to: GraphDefinition): ReleaseDiff {
  const changes = <T extends { id: string }>(a: readonly T[], b: readonly T[]) => {
    const before = new Map(a.map((item) => [item.id, JSON.stringify(item)]));
    const after = new Map(b.map((item) => [item.id, JSON.stringify(item)]));
    return [
      ...[...after.keys()].filter((id) => !before.has(id)).map((id) => ({ id, change: "added" as const, fields: {} })),
      ...[...before.keys()].filter((id) => !after.has(id)).map((id) => ({ id, change: "removed" as const, fields: {} })),
      ...[...after.keys()].filter((id) => before.has(id) && before.get(id) !== after.get(id)).map((id) => ({ id, change: "modified" as const, fields: {} })),
    ];
  };
  const fromFingerprint = semanticFingerprint(from);
  const toFingerprint = semanticFingerprint(to);
  return {
    from_release_id: fromId,
    to_release_id: toId,
    to_label: toId ? null : "Draft",
    from_semantic_fingerprint: fromFingerprint,
    to_semantic_fingerprint: toFingerprint,
    identical: fromFingerprint === toFingerprint,
    node_changes: changes(from.nodes, to.nodes),
    edge_changes: changes(from.edges, to.edges),
    resource_changes: [],
  };
}

function routingReport(store: MockStore, graph: GraphDefinition, dataset: Fixture[]): RoutingLabReport {
  const counts = new Map<string, Map<string, number>>();
  const runs = dataset.map((fixture, fixture_index) => {
    const record = startRun(store, graph, { input: fixture.input, node_outputs: fixture.node_outputs, provider: "stub" }, null);
    for (const decision of record.summary.route_decisions ?? []) {
      const targets = counts.get(decision.nodeId) ?? new Map<string, number>();
      targets.set(decision.selectedTargetNodeId, (targets.get(decision.selectedTargetNodeId) ?? 0) + 1);
      counts.set(decision.nodeId, targets);
    }
    return { fixture_index, run_id: record.summary.run_id, status: "succeeded", route_decisions: record.summary.route_decisions ?? [], estimated_usd: 0, duration_ms: 0 };
  });
  return {
    graph_id: graph.id,
    dataset_size: dataset.length,
    distributions: [...counts].map(([node_id, targets]) => ({
      node_id,
      total: [...targets.values()].reduce((a, b) => a + b, 0),
      targets: [...targets].map(([target_node_id, count]) => ({ target_node_id, count })),
    })),
    total_estimated_usd: 0,
    runs,
  };
}

function compareReports(baseline: RoutingLabReport, candidate: RoutingLabReport) {
  const nodes = new Set([...baseline.distributions, ...candidate.distributions].map((d) => d.node_id));
  const count = (report: RoutingLabReport, node: string, target: string) =>
    report.distributions.find((d) => d.node_id === node)?.targets.find((t) => t.target_node_id === target)?.count ?? 0;
  return {
    baseline,
    candidate,
    distribution_deltas: [...nodes].map((node_id) => {
      const targets = new Set(
        [...baseline.distributions, ...candidate.distributions].filter((d) => d.node_id === node_id).flatMap((d) => d.targets.map((t) => t.target_node_id)),
      );
      return {
        node_id,
        targets: [...targets].map((target_node_id) => ({
          target_node_id,
          baseline_count: count(baseline, node_id, target_node_id),
          candidate_count: count(candidate, node_id, target_node_id),
        })),
      };
    }),
  };
}

function knowledgeSummary(store: MockStore, graphId: string) {
  const documents = store.knowledge.get(graphId) ?? [];
  return {
    documents,
    chunkCount: documents.reduce((sum, doc) => sum + Math.max(1, Math.ceil(doc.char_count / 500)), 0),
    embeddingProvider: documents.length ? "stub" : null,
    embeddingModelId: documents.length ? "stub-embedding" : null,
  };
}

function latestRelease(store: MockStore, graphId: string): GraphRelease | undefined {
  return [...store.releases.values()].filter((release) => release.graph_id === graphId).at(-1);
}

function resolveRelease(store: MockStore, graphId: string, releaseId: string): GraphRelease | undefined {
  return releaseId === "latest" ? latestRelease(store, graphId) : store.releases.get(releaseId);
}

async function body(request: Request): Promise<Json> {
  const text = await request.text();
  return text ? (JSON.parse(text) as Json) : {};
}

// ------------------------------------------------------- transforms

type TransformJson = { type?: string | null; pointer?: string | null; field?: string | null; template?: string | null; target_type?: string | null; transform_id?: string | null };

/** A small stand-in for backend app/transforms.py, enough for UI tests. */
function mockApplyTransform(transform: TransformJson, value: unknown): unknown {
  const read = (current: unknown, key: string) => {
    if (current && typeof current === "object" && key in current) return (current as Record<string, unknown>)[key];
    throw new Error(`no field '${key}'`);
  };
  switch (transform.type) {
    case "select":
      return (transform.pointer ?? "").split("/").slice(1).reduce(read, typeof value === "string" ? JSON.parse(value) : value);
    case "wrap":
      return { [transform.field ?? "value"]: value };
    case "format_message":
      return (transform.template ?? "").replace(/\{value((?:\.[\w-]+)*)\}/g, (_match, path: string) => {
        const resolved = path.split(".").slice(1).reduce(read, value);
        return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
      });
    case "coerce":
      if (transform.target_type === "string") return typeof value === "string" ? value : JSON.stringify(value);
      if (transform.target_type === "number" && !Number.isNaN(Number(value))) return Number(value);
      if (transform.target_type === "boolean" && ["true", "false"].includes(String(value).toLowerCase())) return String(value).toLowerCase() === "true";
      throw new Error(`'${String(value)}' can't be coerced to ${String(transform.target_type)}`);
    default:
      throw new Error("transform needs a type");
  }
}

// ------------------------------------------------------------ routes

type Handler = (args: { request: Request; params: Record<string, string>; store: MockStore }) => Response | Promise<Response>;
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Every route the mock serves, keyed like the OpenAPI contract (`METHOD /path/{param}`). */
export function mockRoutes(): Record<string, Handler> {
  const routes: Record<string, Handler> = {
    "GET /api/health": () => HttpResponse.json({ ok: true, storage_backend: "memory" }),

    "POST /api/transforms/preview": async ({ request, store }) => {
      const { transform, value } = (await body(request)) as { transform: TransformJson; value: unknown };
      const spec = transform.transform_id ? (store.resources.transforms.get(transform.transform_id) as TransformJson | undefined) : transform;
      if (!spec) return HttpResponse.json({ ok: false, output: null, error: `library transform '${transform.transform_id}' not found` });
      try {
        return HttpResponse.json({ ok: true, output: mockApplyTransform(spec, value), error: null });
      } catch (err) {
        return HttpResponse.json({ ok: false, output: null, error: err instanceof Error ? err.message : String(err) });
      }
    },

    // Graphs
    "GET /api/graphs": ({ request, store }) => listResponse(request, [...store.graphs.values()]),
    "GET /api/graph-summaries": ({ request, store }) =>
      listResponse(request, [...store.graphs.values()].map(summarizeGraph)),
    "POST /api/graphs": async ({ request, store }) => {
      const { name, template } = await body(request);
      const id = nextId(store, "graph");
      const base = template === "demo" ? demoGraph() : { entry_node_id: "input_1", nodes: [{ id: "input_1", type: "input" as const, position: { x: 0, y: 0 }, config: { variableName: "question" } }], edges: [] };
      const graph = { ...base, id, name: String(name ?? "Untitled graph") } as GraphDefinition;
      store.graphs.set(id, graph);
      return HttpResponse.json(graph);
    },
    "POST /api/graphs/validate": async ({ request }) => HttpResponse.json(compile((await body(request)) as unknown as GraphDefinition)),
    "GET /api/graphs/{graph_id}": ({ params, store }) => {
      const graph = store.graphs.get(params.graph_id);
      return graph ? HttpResponse.json(graph) : notFound("graph");
    },
    "PUT /api/graphs/{graph_id}": async ({ request, params, store }) => {
      const graph = { ...((await body(request)) as unknown as GraphDefinition), id: params.graph_id, updated_at: now() };
      store.graphs.set(params.graph_id, graph);
      return HttpResponse.json(graph);
    },
    "DELETE /api/graphs/{graph_id}": ({ params, store }) => HttpResponse.json({ deleted: store.graphs.delete(params.graph_id) }),
    "POST /api/graphs/{graph_id}/compile": ({ params, store }) => {
      const graph = store.graphs.get(params.graph_id);
      return graph ? HttpResponse.json(compile(graph)) : notFound("graph");
    },
    "POST /api/graphs/{graph_id}/health": async ({ request, params }) => {
      const draft = (await body(request)) as unknown as GraphDefinition;
      const items = validateStructure(draft).map((d) => ({ node_id: d.node_id ?? null, edge_id: d.edge_id ?? null, message: d.message }));
      const deduction = Math.min(40, items.length * 10);
      const score = 100 - deduction;
      return HttpResponse.json({
        graph_id: params.graph_id,
        score,
        band: score >= 80 ? "healthy" : score >= 60 ? "attention" : "at_risk",
        factors: [{ id: "structure", label: "Structure", deduction, max: 40, items }],
        computed_at: now(),
      });
    },
    "POST /api/graphs/{graph_id}/nodes/{node_id}/impact": async ({ request, params, store }) => {
      const draft = (await body(request)) as unknown as GraphDefinition;
      const reached = [...downstream(draft, params.node_id)];
      const typeOf = (id: string) => draft.nodes.find((node) => node.id === id)?.type;
      const executions = [...store.runs.values()].filter((run) => run.traces.some((trace) => trace.node_id === params.node_id));
      return HttpResponse.json({
        node_id: params.node_id,
        downstream: reached,
        outputs_reached: reached.filter((id) => typeOf(id) === "output"),
        routers_downstream: reached.filter((id) => typeOf(id) === "router" || typeOf(id) === "branch"),
        upstream_count: upstream(draft, params.node_id).size,
        bindings: [],
        runs: { executions: executions.length, last_run_id: executions.at(-1)?.summary.run_id ?? null, last_run_at: executions.at(-1)?.summary.started_at ?? null },
        releases: [...store.releases.values()].filter((r) => r.graph_id === params.graph_id).map((r) => ({ release_id: r.id, created_at: r.created_at, changed_since: false })),
        datasets: [],
        uses_graph: null,
      });
    },
    "POST /api/graphs/{graph_id}/extract-subgraph": async ({ request, params, store }) => {
      const { draft, node_ids, name } = (await body(request)) as { draft: GraphDefinition; node_ids: string[]; name: string };
      const picked = new Set(node_ids);
      const childId = nextId(store, "graph");
      const child: GraphDefinition = {
        id: childId,
        name,
        entry_node_id: node_ids[0],
        nodes: draft.nodes.filter((node) => picked.has(node.id)),
        edges: draft.edges.filter((edge) => picked.has(edge.source) && picked.has(edge.target)),
      };
      store.graphs.set(childId, child);
      const subgraphId = `subgraph_${childId}`;
      const retarget = (id: string) => (picked.has(id) ? subgraphId : id);
      const proposed: GraphDefinition = {
        ...draft,
        id: params.graph_id,
        nodes: [...draft.nodes.filter((node) => !picked.has(node.id)), { id: subgraphId, type: "subgraph", position: { x: 0, y: 0 }, config: { graphId: childId, version: "draft" } }],
        edges: draft.edges
          .filter((edge) => !(picked.has(edge.source) && picked.has(edge.target)))
          .map((edge) => ({ ...edge, source: retarget(edge.source), target: retarget(edge.target) })),
      };
      return HttpResponse.json({ child_graph: child, proposed_parent: proposed });
    },
    "GET /api/graphs/{graph_id}/used-by": ({ params, store }) =>
      HttpResponse.json(
        [...store.graphs.values()]
          .map((graph) => ({ graph_id: graph.id, name: graph.name, node_ids: graph.nodes.filter((n) => n.type === "subgraph" && n.config.graphId === params.graph_id).map((n) => n.id) }))
          .filter((row) => row.node_ids.length > 0),
      ),
    "POST /api/graphs/{graph_id}/simulate": async ({ request, params, store }) => {
      const graph = store.graphs.get(params.graph_id);
      if (!graph) return notFound("graph");
      const record = startRun(store, graph, { ...(await body(request)), provider: "stub" }, null);
      return HttpResponse.json({ run: record.summary, traces: record.traces });
    },

    // Runs
    "GET /api/runs": ({ request, store }) => listResponse(request, [...store.runs.values()].map((run) => run.summary).reverse()),
    "GET /api/graphs/{graph_id}/runs": ({ request, params, store }) =>
      store.graphs.has(params.graph_id)
        ? listResponse(request, [...store.runs.values()].map((run) => run.summary).filter((run) => run.graph_id === params.graph_id).reverse())
        : notFound("graph"),
    "POST /api/runs": async ({ request, store }) => {
      const payload = await body(request);
      const graph = store.graphs.get(String(payload.graph_id));
      if (!graph) return notFound("graph");
      const result = compile(graph);
      if (!result.ok) return blocked(result.diagnostics, "graph has blocking diagnostics");
      return HttpResponse.json(startRun(store, graph, payload, null).summary);
    },
    "GET /api/runs/{run_id}": ({ params, store }) => {
      const run = store.runs.get(params.run_id);
      return run ? HttpResponse.json(run.summary) : notFound("run");
    },
    "GET /api/runs/{run_id}/nodes": ({ params, store }) => HttpResponse.json(store.runs.get(params.run_id)?.traces ?? []),
    "GET /api/runs/{run_id}/snapshot": ({ params, store }) => {
      const run = store.runs.get(params.run_id);
      return run ? HttpResponse.json(run.snapshot) : notFound("run snapshot");
    },
    "GET /api/runs/{run_id}/events": ({ request, params, store }) => {
      const run = store.runs.get(params.run_id);
      const url = new URL(request.url);
      const after = Number(request.headers.get("Last-Event-ID") ?? url.searchParams.get("after") ?? 0);
      const events = (run?.events ?? []).filter((event) => event.sequence > after);
      const text = `retry: 1000\n\n${events.map((event) => `id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`).join("")}`;
      return new HttpResponse(text, { headers: { "Content-Type": "text/event-stream" } });
    },
    "POST /api/runs/{run_id}/resume": ({ params, store }) => {
      const run = store.runs.get(params.run_id);
      return run ? HttpResponse.json(run.summary) : notFound("paused run");
    },
    "POST /api/runs/{run_id}/replay": async ({ request, params, store }) => {
      const original = store.runs.get(params.run_id);
      if (!original) return notFound("run");
      const graph = original.snapshot.graph ?? store.releases.get(original.snapshot.release_id ?? "")?.graph;
      if (!graph) return notFound("run snapshot");
      const payload = await body(request);
      const replay = startRun(store, graph, { input: original.summary.input, provider: "stub" }, original.snapshot.release_id ?? null);
      return HttpResponse.json({
        run: replay.summary,
        traces: replay.traces,
        original_run_id: params.run_id,
        counterfactual: Object.keys(payload).length > 0,
        original_traces: original.traces,
        changed_nodes: [],
        node_modes: Object.fromEntries(replay.traces.map((trace) => [trace.node_id, "frozen"])),
      });
    },

    // Releases
    "GET /api/graphs/{graph_id}/releases": ({ request, params, store }) =>
      store.graphs.has(params.graph_id)
        ? listResponse(request, [...store.releases.values()].filter((r) => r.graph_id === params.graph_id).map(releaseIndexEntry))
        : notFound("graph"),
    "POST /api/graphs/{graph_id}/releases": async ({ request, params, store }) => {
      const graph = store.graphs.get(params.graph_id);
      if (!graph) return notFound("graph");
      const { release_notes, author } = await body(request);
      const result = compile(graph);
      if (!result.ok) return blocked(result.diagnostics, "publish blocked");
      const semantic = semanticFingerprint(graph);
      const existing = latestRelease(store, graph.id);
      if (existing?.semantic_fingerprint === semantic) return HttpResponse.json({ release: existing, created: false });
      const release: GraphRelease = {
        id: nextId(store, "rel"),
        graph_id: graph.id,
        graph,
        document_fingerprint: documentFingerprint(graph),
        semantic_fingerprint: semantic,
        resource_snapshots: {},
        release_notes: (release_notes as string | undefined) ?? null,
        author: (author as string | undefined) ?? null,
        created_at: now(),
        diagnostics: result.diagnostics,
      };
      store.releases.set(release.id, release);
      return HttpResponse.json({ release, created: true });
    },
    "GET /api/graphs/{graph_id}/releases/{release_id}": ({ params, store }) => {
      const release = resolveRelease(store, params.graph_id, params.release_id);
      return release && release.graph_id === params.graph_id ? HttpResponse.json(release) : notFound("release");
    },
    "POST /api/graph-releases/{release_id}/compile": ({ params, store }) => {
      const release = store.releases.get(params.release_id);
      return release ? HttpResponse.json(compile(release.graph)) : notFound("release");
    },
    "POST /api/graph-releases/{release_id}/runs": async ({ request, params, store }) => {
      const release = store.releases.get(params.release_id);
      return release ? HttpResponse.json(startRun(store, release.graph, await body(request), release.id).summary) : notFound("release");
    },
    "POST /api/graph-releases/{release_id}/simulate": async ({ request, params, store }) => {
      const release = store.releases.get(params.release_id);
      if (!release) return notFound("release");
      const record = startRun(store, release.graph, { ...(await body(request)), provider: "stub" }, release.id);
      return HttpResponse.json({ run: record.summary, traces: record.traces });
    },
    "GET /api/graph-releases/{release_id}/compare/{other_release_id}": ({ params, store }) => {
      const from = store.releases.get(params.release_id);
      const to = store.releases.get(params.other_release_id);
      return from && to ? HttpResponse.json(diffGraphs(from.id, from.graph, to.id, to.graph)) : notFound("release");
    },
    "POST /api/graph-releases/{release_id}/compare-draft": async ({ request, params, store }) => {
      const from = store.releases.get(params.release_id);
      return from ? HttpResponse.json(diffGraphs(from.id, from.graph, null, (await body(request)) as unknown as GraphDefinition)) : notFound("release");
    },

    // Routing lab
    "POST /api/graphs/{graph_id}/routing-lab/run": async ({ request, params, store }) => {
      const graph = store.graphs.get(params.graph_id);
      return graph ? HttpResponse.json(routingReport(store, graph, ((await body(request)).dataset as Fixture[]) ?? [])) : notFound("graph");
    },
    "POST /api/graphs/{graph_id}/routing-lab/compare/{other_graph_id}": async ({ request, params, store }) => {
      const baseline = store.graphs.get(params.graph_id);
      const candidate = store.graphs.get(params.other_graph_id);
      if (!baseline || !candidate) return notFound("graph");
      const dataset = ((await body(request)).dataset as Fixture[]) ?? [];
      return HttpResponse.json(compareReports(routingReport(store, baseline, dataset), routingReport(store, candidate, dataset)));
    },
    "POST /api/graphs/{graph_id}/routing-lab/compare-release/{release_id}": async ({ request, params, store }) => {
      const draft = store.graphs.get(params.graph_id);
      const release = resolveRelease(store, params.graph_id, params.release_id);
      if (!draft || !release) return notFound("release");
      const dataset = ((await body(request)).dataset as Fixture[]) ?? [];
      return HttpResponse.json(compareReports(routingReport(store, release.graph, dataset), routingReport(store, draft, dataset)));
    },

    // Policies
    "GET /api/policies/catalog": () => HttpResponse.json(makePolicyCatalog()),
    "GET /api/policies/workspace": ({ store }) => HttpResponse.json(store.workspacePolicies),
    "PUT /api/policies/workspace": async ({ request, store }) => {
      store.workspacePolicies = { rules: ((await body(request)).rules as PolicySettings["rules"]) ?? {}, updated_at: now() };
      return HttpResponse.json(store.workspacePolicies);
    },
    "GET /api/policies/effective": ({ store }) => HttpResponse.json(effectivePolicies(store)),
    "GET /api/graphs/{graph_id}/policies": ({ params, store }) => HttpResponse.json(store.graphPolicies.get(params.graph_id) ?? { rules: {}, updated_at: null }),
    "PUT /api/graphs/{graph_id}/policies": async ({ request, params, store }) => {
      const settings = { rules: ((await body(request)).rules as PolicySettings["rules"]) ?? {}, updated_at: now() };
      store.graphPolicies.set(params.graph_id, settings);
      return HttpResponse.json(settings);
    },
    "GET /api/graphs/{graph_id}/policies/effective": ({ params, store }) => HttpResponse.json(effectivePolicies(store, params.graph_id)),
    "GET /api/policy-exceptions": ({ request, store }) => listResponse(request, [...store.exceptions.values()]),
    "GET /api/graphs/{graph_id}/policy-exceptions": ({ request, params, store }) =>
      listResponse(request, [...store.exceptions.values()].filter((exception) => exception.graph_id === params.graph_id)),
    "POST /api/graphs/{graph_id}/policy-exceptions": async ({ request, params, store }) => {
      const payload = await body(request);
      const exception: PolicyException = {
        id: nextId(store, "pexc"),
        graph_id: params.graph_id,
        policy_code: String(payload.policy_code),
        node_id: (payload.node_id as string | undefined) ?? null,
        reason: (payload.reason as string | undefined) ?? null,
        created_at: now(),
        expires_at: String(payload.expires_at),
      };
      store.exceptions.set(exception.id, exception);
      return HttpResponse.json(exception);
    },
    "PATCH /api/graphs/{graph_id}/policy-exceptions/{exception_id}": async ({ request, params, store }) => {
      const existing = store.exceptions.get(params.exception_id);
      if (!existing || existing.graph_id !== params.graph_id) return notFound("policy exception");
      const payload = await body(request);
      const updated = { ...existing, expires_at: String(payload.expires_at), reason: (payload.reason as string | undefined) ?? existing.reason };
      store.exceptions.set(updated.id, updated);
      return HttpResponse.json(updated);
    },
    "DELETE /api/graphs/{graph_id}/policy-exceptions/{exception_id}": ({ params, store }) => HttpResponse.json({ deleted: store.exceptions.delete(params.exception_id) }),

    // Knowledge
    "GET /api/graphs/{graph_id}/knowledge": ({ params, store }) => HttpResponse.json({ graphId: params.graph_id, ...knowledgeSummary(store, params.graph_id) }),
    "POST /api/graphs/{graph_id}/knowledge": async ({ request, params, store }) => {
      const form = await request.formData();
      const file = form.get("file") as File | null;
      if (!file) return HttpResponse.json({ detail: "file is required" }, { status: 422 });
      const text = await file.text();
      const document = { id: nextId(store, "doc"), name: file.name, mime_type: file.type || "text/plain", uploaded_at: now(), char_count: text.length };
      store.knowledge.set(params.graph_id, [...(store.knowledge.get(params.graph_id) ?? []), document]);
      return HttpResponse.json({ ok: true, documentId: document.id, addedChunkCount: Math.max(1, Math.ceil(text.length / 500)), ...knowledgeSummary(store, params.graph_id) });
    },
    "DELETE /api/graphs/{graph_id}/knowledge/{document_id}": ({ params, store }) => {
      store.knowledge.set(params.graph_id, (store.knowledge.get(params.graph_id) ?? []).filter((doc) => doc.id !== params.document_id));
      return HttpResponse.json({ ok: true, ...knowledgeSummary(store, params.graph_id) });
    },
    "GET /api/graphs/{graph_id}/knowledge/lineage": ({ request, params, store }) => {
      const documentId = new URL(request.url).searchParams.get("document_id");
      return listResponse(request, store.lineage.filter((entry) => entry.graph_id === params.graph_id && (!documentId || entry.document_id === documentId)));
    },

    // Analytics
    "GET /api/analytics": ({ store }) => {
      const runs = [...store.runs.values()].map((run) => run.summary);
      const totals = { invocations: runs.length, input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_usd: 0, avg_duration_ms: 0 };
      const byGraph = new Map<string, number>();
      for (const run of runs) byGraph.set(run.graph_id, (byGraph.get(run.graph_id) ?? 0) + 1);
      return HttpResponse.json({
        totals,
        daily: runs.length ? [{ date: FIXED_TIME.slice(0, 10), invocations: runs.length, tokens: 0, estimated_usd: 0 }] : [],
        by_graph: [...byGraph].map(([graph_id, invocations]) => ({ graph_id, name: store.graphs.get(graph_id)?.name ?? graph_id, invocations, tokens: 0, estimated_usd: 0 })),
      });
    },
    "GET /api/graphs/{graph_id}/analytics": ({ params, store }) => {
      const runs = [...store.runs.values()].filter((run) => run.summary.graph_id === params.graph_id);
      const nodes = new Map<string, NodeTrace[]>();
      for (const run of runs) for (const trace of run.traces) nodes.set(trace.node_id, [...(nodes.get(trace.node_id) ?? []), trace]);
      const succeeded = runs.filter((run) => run.summary.status === "succeeded").length;
      return HttpResponse.json({
        graph_id: params.graph_id,
        run_window: runs.length,
        totals: { invocations: runs.length, input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_usd: 0, avg_duration_ms: 0 },
        succeeded_runs: succeeded,
        failed_runs: runs.length - succeeded,
        success_rate: runs.length ? succeeded / runs.length : null,
        p95_duration_ms: runs.length ? 0 : null,
        nodes: [...nodes].map(([node_id, traces]) => ({
          node_id,
          node_type: traces[0].node_type,
          executions: traces.length,
          succeeded: traces.length,
          failed: 0,
          success_rate: 1,
          avg_duration_ms: 0,
          p95_duration_ms: 0,
          last_run_id: runs.at(-1)?.summary.run_id ?? null,
          last_run_at: FIXED_TIME,
          last_error: null,
        })),
      });
    },
    "GET /api/graphs/{graph_id}/nodes/{node_id}/history": ({ params, store }) =>
      HttpResponse.json(
        [...store.runs.values()]
          .filter((run) => run.summary.graph_id === params.graph_id && run.traces.some((trace) => trace.node_id === params.node_id))
          .reverse()
          .map((run) => ({ run_id: run.summary.run_id, run_status: run.summary.status, status: "succeeded", started_at: FIXED_TIME, duration_ms: 0, error: null })),
      ),

    // Providers and runtime targets
    "GET /api/providers/{provider}/ready": () => HttpResponse.json({ ready: true, message: "Mock provider ready" }),
    "GET /api/providers/{provider}/credentials": ({ params }) =>
      HttpResponse.json({ provider: params.provider, requires_api_key: params.provider !== "stub" && params.provider !== "ollama", label: "API key", env_var: `${params.provider.toUpperCase()}_API_KEY`, configured: true }),
    "GET /api/providers/{provider}/models": ({ params }) =>
      HttpResponse.json({ provider: params.provider, models: [{ id: "stub", label: "Stub model" }], source: "fallback", cached: false, message: "" }),
    "GET /api/runtime-targets/{target_id}/capabilities": ({ params }) =>
      HttpResponse.json({ target_id: params.target_id, capabilities: [{ feature: "conditional_edges", supported: true, notes: null }] }),

    // Datasets and chat (beyond generic CRUD)
    "POST /api/datasets/from-runs": async ({ request, store }) => {
      const payload = await body(request);
      const runIds = (payload.run_ids as string[]) ?? [];
      const runs = runIds.map((id) => store.runs.get(id)).filter((run): run is RunRecord => Boolean(run));
      const dataset: FixtureDataset = {
        id: nextId(store, "dataset"),
        name: String(payload.name),
        description: (payload.description as string | undefined) ?? null,
        graph_id: runs[0]?.summary.graph_id ?? null,
        fixtures: runs.map((run) => ({
          input: run.summary.input ?? {},
          node_outputs: payload.include_node_outputs === false ? {} : Object.fromEntries(run.traces.map((trace) => [trace.node_id, trace.output])),
        })),
        source: "runs",
        source_run_ids: runIds,
        created_at: now(),
        updated_at: now(),
      };
      store.resources.datasets.set(dataset.id, dataset as unknown as Json);
      return HttpResponse.json(dataset);
    },
    "POST /api/chat-sessions/{session_id}/messages": async ({ request, params, store }) => {
      const session = store.resources["chat-sessions"].get(params.session_id) as ChatSession | undefined;
      if (!session) return notFound("chat session");
      const { content } = await body(request);
      const updated: ChatSession = {
        ...session,
        messages: [...session.messages, { role: "user", content: String(content), created_at: now() }, { role: "assistant", content: `stub reply: ${String(content)}`, created_at: now() }],
        updated_at: now(),
      };
      store.resources["chat-sessions"].set(session.id, updated as unknown as Json);
      return HttpResponse.json(updated);
    },
  };

  // Generic resource CRUD, usages and versions.
  for (const kind of RESOURCE_KINDS) {
    const base = `/api/${kind}`;
    routes[`GET ${base}`] = ({ request, store }) => listResponse(request, [...store.resources[kind].values()].sort((a, b) => String(a.id).localeCompare(String(b.id))));
    routes[`POST ${base}`] = async ({ request, store }) => {
      const resource = { ...RESOURCE_DEFAULTS[kind](), ...(await body(request)) };
      store.resources[kind].set(String(resource.id), resource);
      return HttpResponse.json(resource);
    };
    routes[`GET ${base}/{resource_id}`] = ({ params, store }) => {
      const resource = store.resources[kind].get(params.resource_id);
      return resource ? HttpResponse.json(resource) : notFound(kind);
    };
    routes[`PUT ${base}/{resource_id}`] = async ({ request, params, store }) => {
      const resource = { ...RESOURCE_DEFAULTS[kind](), ...store.resources[kind].get(params.resource_id), ...(await body(request)), id: params.resource_id };
      store.resources[kind].set(params.resource_id, resource);
      return HttpResponse.json(resource);
    };
    routes[`DELETE ${base}/{resource_id}`] = ({ params, store }) => HttpResponse.json({ deleted: store.resources[kind].delete(params.resource_id) });
    routes[`GET ${base}/{resource_id}/usages`] = () => HttpResponse.json([]);
    if (!VERSIONED.has(kind)) continue;
    routes[`GET ${base}/{resource_id}/versions`] = ({ request, params, store }) =>
      listResponse(request, (store.versions.get(`${kind}:${params.resource_id}`) ?? []).map(({ version_id, fingerprint, created_at }) => ({ version_id, fingerprint, created_at })));
    routes[`POST ${base}/{resource_id}/versions`] = ({ params, store }) => {
      const payload = store.resources[kind].get(params.resource_id);
      if (!payload) return notFound(kind);
      const key = `${kind}:${params.resource_id}`;
      const history = store.versions.get(key) ?? [];
      const fingerprint = JSON.stringify(payload);
      const latest = history.at(-1);
      if (latest?.fingerprint === fingerprint) return HttpResponse.json({ version: latest, created: false });
      const version: ResourceVersion = { version_id: nextId(store, "ver"), kind: kind.replace("-", "_"), resource_id: params.resource_id, payload, fingerprint, created_at: now() };
      store.versions.set(key, [...history, version]);
      return HttpResponse.json({ version, created: true });
    };
    routes[`GET ${base}/{resource_id}/versions/{version_id}`] = ({ params, store }) => {
      const version = (store.versions.get(`${kind}:${params.resource_id}`) ?? []).find((v) => v.version_id === params.version_id);
      return version ? HttpResponse.json(version) : notFound("version");
    };
  }
  return routes;
}

export type CreateHandlersOptions = {
  /** Origin the handlers match (default any: `*`), e.g. "http://localhost:8000". */
  baseUrl?: string;
  store?: MockStore;
};

/** MSW handlers for every API route, sharing one in-memory store. */
export function createHandlers(options: CreateHandlersOptions = {}): HttpHandler[] {
  const store = options.store ?? createMockStore();
  const origin = options.baseUrl ?? "*";
  const factories: Record<Method, typeof http.get> = { GET: http.get, POST: http.post, PUT: http.put, PATCH: http.patch, DELETE: http.delete };
  // Literal segments before parameters, so `/api/graphs/validate` wins over `/api/graphs/:graph_id`.
  const entries = Object.entries(mockRoutes()).sort(([a], [b]) => specificity(b) - specificity(a));
  return entries.map(([key, handler]) => {
    const [method, route] = key.split(" ") as [Method, string];
    const pattern = `${origin}${route.replace(/\{(\w+)\}/g, ":$1")}`;
    return factories[method](pattern, ({ request, params }) => handler({ request, params: params as Record<string, string>, store }));
  });
}

function specificity(key: string): number {
  return key.split("/").filter((segment) => segment && !segment.startsWith("{")).length * 10 - (key.match(/\{/g)?.length ?? 0);
}
