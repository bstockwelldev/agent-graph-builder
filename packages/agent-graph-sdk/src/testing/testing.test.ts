import { readFileSync } from "node:fs";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAgentGraphClient } from "../client.js";
import { AgentGraphApiError } from "../errors.js";
import { collectAll } from "../pagination.js";
import * as schemas from "../schemas.js";
import { createHandlers, createMockStore, mockRoutes } from "./handlers.js";
import * as fixtures from "./fixtures.js";

// SDK 5/7 (STO-620): the /testing kit -- route coverage against the
// contract, schema-valid factories, and every client call against the mock.

const contract = JSON.parse(readFileSync(new URL("../../contract/openapi.json", import.meta.url), "utf8")) as { paths: Record<string, object> };
const structural = JSON.parse(readFileSync(new URL("../../contract/structural-fixtures.json", import.meta.url), "utf8")) as {
  cases: { name: string; graph: unknown }[];
};

describe("route coverage", () => {
  it("mocks every route in contract/openapi.json, and nothing else", () => {
    const contractRoutes = Object.entries(contract.paths).flatMap(([path, ops]) => Object.keys(ops).map((method) => `${method.toUpperCase()} ${path}`));
    expect(Object.keys(mockRoutes()).sort()).toEqual(contractRoutes.sort());
  });
});

describe("fixture factories", () => {
  it("produce schema-valid objects", () => {
    const graph = fixtures.makeGraph();
    expect(() => schemas.graphDefinitionSchema.parse(graph)).not.toThrow();
    expect(() => schemas.graphDefinitionSchema.parse(fixtures.demoGraph())).not.toThrow();
    expect(() => schemas.runSummarySchema.parse(fixtures.makeRun())).not.toThrow();
    expect(() => schemas.nodeTraceSchema.parse(fixtures.makeTrace())).not.toThrow();
    expect(() => schemas.graphReleaseSchema.parse(fixtures.makeRelease(graph))).not.toThrow();
    expect(() => schemas.releaseIndexEntrySchema.parse(fixtures.releaseIndexEntry(fixtures.makeRelease(graph)))).not.toThrow();
    expect(() => schemas.policyRuleInfoSchema.array().parse(fixtures.makePolicyCatalog())).not.toThrow();
    expect(() => schemas.effectivePolicyRuleSchema.parse(fixtures.makeEffectivePolicy())).not.toThrow();
    expect(() => schemas.policyExceptionSchema.parse(fixtures.makePolicyException())).not.toThrow();
    expect(() => schemas.fixtureDatasetSchema.parse(fixtures.makeDataset())).not.toThrow();
    expect(() => schemas.diagnosticSchema.parse(fixtures.makeDiagnostic())).not.toThrow();
    expect(() => schemas.chatSessionSchema.parse(fixtures.makeChatSession())).not.toThrow();
    expect(() => schemas.promptTemplateSchema.parse(fixtures.makePrompt())).not.toThrow();
    expect(fixtures.makeRun({ status: "failed" }).status).toBe("failed");
  });

  it("demoGraph() is the backend's demo graph", () => {
    expect(fixtures.demoGraph()).toEqual(structural.cases.find((c) => c.name === "demo graph")!.graph);
  });
});

describe("the mock API, through the real client", () => {
  const store = createMockStore({ resources: { prompts: [fixtures.makePrompt()], "chat-sessions": [fixtures.makeChatSession()] } });
  const server = setupServer(...createHandlers({ store }));
  const client = createAgentGraphClient({ baseUrl: "http://agb.test", onVersionSkew: false });
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("previews transforms, inline or from the library", async () => {
    expect(await client.transforms.preview({ type: "select", pointer: "/a/b" }, { a: { b: 2 } })).toEqual({ ok: true, output: 2, error: null });
    expect((await client.transforms.preview({ type: "coerce", target_type: "number" }, "x")).ok).toBe(false);
    await client.transforms.create({ id: "t1", name: "Line", type: "format_message", template: "Hi {value.name}" });
    expect((await client.transforms.preview({ transform_id: "t1" }, { name: "Ada" })).output).toBe("Hi Ada");
  });

  it("serves graphs, validation and analysis", async () => {
    expect((await client.graphs.list()).map((g) => g.id)).toEqual(["demo_classify_and_route"]);
    const created = await client.graphs.create({ name: "Mine" });
    const updated = await client.graphs.update({ ...created, name: "Renamed" });
    expect((await client.graphs.get(created.id)).name).toBe("Renamed");
    expect((await client.graphs.validate(updated)).ok).toBe(true);
    expect((await client.graphs.compile("demo_classify_and_route")).ok).toBe(true);
    expect((await client.graphs.health("demo_classify_and_route", fixtures.demoGraph())).band).toBe("healthy");
    const impact = await client.graphs.impact("demo_classify_and_route", { nodeId: "router_1", draft: fixtures.demoGraph() });
    expect(impact.outputs_reached).toEqual(["output_1"]);
    expect(await client.graphs.usedBy("demo_classify_and_route")).toEqual([]);
    const extracted = await client.graphs.extractSubgraph("demo_classify_and_route", { draft: fixtures.demoGraph(), nodeIds: ["prompt_answer", "llm_answer"], name: "Answer" });
    expect(extracted.proposed_parent.nodes.some((n) => n.type === "subgraph")).toBe(true);
    expect((await client.graphs.simulate("demo_classify_and_route", fixtures.makeFixture())).run.status).toBe("succeeded");
    expect((await client.graphs.delete(created.id)).deleted).toBe(true);
    await expect(client.graphs.get(created.id)).rejects.toBeInstanceOf(AgentGraphApiError);
  });

  it("runs, streams, waits and replays", async () => {
    const handle = await client.runs.start({ graphId: "demo_classify_and_route", input: { question: "How does TCP work?" }, provider: "stub" });
    const events = await collectAll(handle.stream());
    expect(events.at(-1)?.event_type).toBe("run.completed");
    expect((await handle.wait()).status).toBe("succeeded");
    const traces = await client.runs.traces(handle.run.run_id);
    expect(traces.map((t) => t.node_id)).toEqual(["input_1", "prompt_classify", "llm_classify", "router_1", "prompt_answer", "llm_answer", "output_1"]);
    expect((await client.runs.snapshot(handle.run.run_id)).source).toBe("draft_snapshot");
    expect((await client.runs.replay(handle.run.run_id)).original_run_id).toBe(handle.run.run_id);
    expect((await client.runs.resume(handle.run.run_id)).run_id).toBe(handle.run.run_id);
    expect((await client.runs.list({ graphId: "demo_classify_and_route" })).length).toBeGreaterThan(0);
    expect((await client.runs.get(handle.run.run_id)).result).toBe("stub answer: How does TCP work?");
  });

  it("publishes, compares and runs releases", async () => {
    const first = await client.releases.publish("demo_classify_and_route", { notes: "v1" });
    expect(first.created).toBe(true);
    expect((await client.releases.publish("demo_classify_and_route")).created).toBe(false);
    await client.graphs.update({ ...fixtures.demoGraph(), name: "Demo v2", nodes: fixtures.demoGraph().nodes.map((n) => (n.id === "llm_answer" ? { ...n, config: { ...n.config, model: "other" } } : n)) });
    const second = await client.releases.publish("demo_classify_and_route");
    expect((await client.releases.list("demo_classify_and_route")).map((r) => r.release_id)).toEqual([first.release.id, second.release.id]);
    expect((await client.releases.get("demo_classify_and_route", first.release.id)).release_notes).toBe("v1");
    expect((await client.releases.compile(first.release.id)).ok).toBe(true);
    const diff = await client.releases.compare(first.release.id, second.release.id);
    expect(diff.node_changes).toEqual([{ id: "llm_answer", change: "modified", fields: {} }]);
    expect((await client.releases.compareDraft(second.release.id, fixtures.demoGraph())).to_label).toBe("Draft");
    expect((await (await client.releases.run(first.release.id, { input: { question: "q" } })).wait()).source).toBe("release");
    expect((await client.releases.simulate(first.release.id, fixtures.makeFixture())).traces.length).toBeGreaterThan(0);
  });

  it("rejects a structurally broken graph with typed diagnostics", async () => {
    const broken = await client.graphs.create({ name: "Broken" });
    await client.graphs.update({ ...broken, entry_node_id: "nope" });
    const error = (await client.releases.publish(broken.id).catch((e: unknown) => e)) as AgentGraphApiError;
    expect(error.status).toBe(422);
    expect(error.diagnostics?.map((d) => d.code)).toContain("GRAPH_MISSING_ENTRY_NODE");
  });

  it("serves policies, routing lab, knowledge, analytics and providers", async () => {
    expect(await client.policies.catalog()).toHaveLength(2);
    await client.policies.workspace.save({ rules: { POLICY_LLM_MODEL_NOT_PINNED: { enforcement: "block", params: {} } } });
    expect((await client.policies.workspace.get()).rules.POLICY_LLM_MODEL_NOT_PINNED.enforcement).toBe("block");
    await client.policies.graph.save("demo_classify_and_route", { rules: { POLICY_TOO_MANY_MODEL_NODES: { params: { max_model_nodes: 2 } } } });
    const effective = await client.policies.effective({ graphId: "demo_classify_and_route" });
    expect(effective.map((r) => [r.enforcement_source, r.params])).toEqual([["workspace", {}], ["default", { max_model_nodes: 2 }]]);
    expect((await client.policies.graph.get("demo_classify_and_route")).updated_at).toBe(fixtures.FIXED_TIME);
    expect(await client.policies.effective()).toHaveLength(2);
    const waiver = await client.policies.exceptions.create("demo_classify_and_route", { code: "POLICY_LLM_MODEL_NOT_PINNED", expiresAt: "2026-03-01T00:00:00Z" });
    expect((await client.policies.exceptions.update("demo_classify_and_route", waiver.id, { expiresAt: "2026-04-01T00:00:00Z" })).expires_at).toBe("2026-04-01T00:00:00Z");
    expect(await client.policies.exceptions.list({ graphId: "demo_classify_and_route" })).toHaveLength(1);
    expect((await client.policies.exceptions.delete("demo_classify_and_route", waiver.id)).deleted).toBe(true);
    expect(await client.policies.exceptions.list()).toEqual([]);

    const report = await client.routingLab.run("demo_classify_and_route", { dataset: [fixtures.makeFixture()] });
    expect(report.distributions).toEqual([{ node_id: "router_1", total: 1, targets: [{ target_node_id: "prompt_answer", count: 1 }] }]);
    expect((await client.routingLab.compare("demo_classify_and_route", { otherGraphId: "demo_classify_and_route", dataset: [] })).distribution_deltas).toEqual([]);
    expect((await client.routingLab.compareRelease("demo_classify_and_route", { releaseId: "latest", dataset: [fixtures.makeFixture()] })).baseline.dataset_size).toBe(1);

    const uploaded = await client.knowledge.upload("demo_classify_and_route", new File(["hello world"], "notes.md", { type: "text/markdown" }));
    expect((await client.knowledge.get("demo_classify_and_route")).documents.map((d) => d.name)).toEqual(["notes.md"]);
    expect(await client.knowledge.lineage("demo_classify_and_route", { documentId: uploaded.documentId })).toEqual([]);
    expect((await client.knowledge.delete("demo_classify_and_route", uploaded.documentId)).documents).toEqual([]);

    expect((await client.analytics.dashboard()).totals.invocations).toBeGreaterThan(0);
    expect((await client.analytics.graph("demo_classify_and_route")).nodes.length).toBeGreaterThan(0);
    expect((await client.analytics.nodeHistory("demo_classify_and_route", "router_1")).length).toBeGreaterThan(0);
    expect((await client.providers.ready("stub")).ready).toBe(true);
    expect((await client.providers.credentials("groq")).requires_api_key).toBe(true);
    expect((await client.providers.models("stub")).models[0].id).toBe("stub");
    expect((await client.runtimeTargets.capabilities("langgraph")).target_id).toBe("langgraph");
  });

  it("serves resources, versions, datasets and chat", async () => {
    expect((await client.prompts.list()).map((p) => p.id)).toEqual(["prompt_greeting"]);
    await client.tools.create({ id: "t1", description: "Search" } as never);
    expect((await client.tools.get("t1")).parameters_json).toBe("{}");
    const published = await client.prompts.versions.publish("prompt_greeting");
    expect((await client.prompts.versions.list("prompt_greeting")).map((v) => v.version_id)).toEqual([published.version.version_id]);
    expect((await client.prompts.versions.get("prompt_greeting", published.version.version_id)).payload.name).toBe("Greeting");
    expect(await client.prompts.usages("prompt_greeting")).toEqual([]);
    await client.prompts.update({ ...fixtures.makePrompt(), body: "changed" });
    expect((await client.prompts.delete("prompt_greeting")).deleted).toBe(true);

    const run = (await client.runs.start({ graphId: "demo_classify_and_route", input: { question: "q" } })).run;
    const dataset = await client.datasets.fromRuns({ name: "From runs", runIds: [run.run_id] });
    expect(dataset.fixtures[0].input).toEqual({ question: "q" });
    const chat = await client.chatSessions.send("chat_1", { content: "hi" });
    expect(chat.messages.map((m) => m.content)).toEqual(["hi", "stub reply: hi"]);
  });

  it("pages lists the way the API does", async () => {
    for (let i = 0; i < 120; i++) await client.graphs.create({ name: `g${i}` });
    const first = await client.graphs.listPage({ limit: 50 });
    expect([first.items.length, first.nextCursor]).toEqual([50, "50"]);
    expect((await collectAll(client.graphs.iterate({ pageSize: 50 }))).length).toBe(store.graphs.size);
  });
});
