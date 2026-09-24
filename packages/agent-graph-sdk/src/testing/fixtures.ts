import type {
  ChatSession,
  Diagnostic,
  EffectivePolicyRule,
  Fixture,
  FixtureDataset,
  GraphDefinition,
  GraphRelease,
  NodeTrace,
  PolicyException,
  PolicyRuleInfo,
  PromptTemplate,
  ReleaseIndexEntry,
  RunSummary,
} from "../types.js";
import { documentFingerprint, semanticFingerprint } from "../schema.js";

/**
 * Fixture factories (SDK 5/7, STO-620). Each returns a fresh, schema-valid
 * object; pass `overrides` for the fields a test cares about. Timestamps
 * are fixed (`FIXED_TIME`) so snapshots stay stable.
 */

export const FIXED_TIME = "2026-01-01T00:00:00Z";

/** The backend's canonical demo workflow (backend/app/demo_graph.py);
 * a test pins the two together via contract/structural-fixtures.json. */
export function demoGraph(): GraphDefinition {
  const node = (id: string, type: GraphDefinition["nodes"][number]["type"], x: number, y: number, config: Record<string, unknown> = {}) => ({
    id,
    type,
    position: { x, y },
    config,
  });
  return {
    id: "demo_classify_and_route",
    name: "Classify & Route (demo)",
    entry_node_id: "input_1",
    orientation: "auto",
    nodes: [
      node("input_1", "input", 40, 200, { variableName: "question" }),
      node("prompt_classify", "prompt", 300, 200, {
        template:
          "Classify the following user question as exactly one word: either 'technical' or 'other'. Respond with only that single word.\n\nQuestion: {question}",
      }),
      node("llm_classify", "llm", 560, 200, {
        model: "qwen2.5:3b",
        systemPrompt: "You are a strict classifier. Respond with exactly one word: technical or other.",
      }),
      node("router_1", "router", 820, 200),
      node("tool_lookup", "tool", 1080, 60, { toolName: "lookup_topic", inputVariable: "question" }),
      node("prompt_answer", "prompt", 1080, 340, { template: "Answer the user's question helpfully and concisely.\n\nQuestion: {question}" }),
      node("llm_answer", "llm", 1340, 340, { model: "qwen2.5:3b", systemPrompt: "You are a helpful assistant." }),
      node("output_1", "output", 1600, 200),
    ],
    edges: [
      { id: "e_input_prompt", source: "input_1", target: "prompt_classify", kind: "sequence" },
      { id: "e_prompt_llm", source: "prompt_classify", target: "llm_classify", kind: "sequence" },
      { id: "e_llm_router", source: "llm_classify", target: "router_1", kind: "sequence" },
      { id: "e_router_tool", source: "router_1", target: "tool_lookup", kind: "conditional", condition: "technical" },
      { id: "e_router_answer", source: "router_1", target: "prompt_answer", kind: "default" },
      { id: "e_tool_output", source: "tool_lookup", target: "output_1", kind: "sequence" },
      { id: "e_answerprompt_llm", source: "prompt_answer", target: "llm_answer", kind: "sequence" },
      { id: "e_llmanswer_output", source: "llm_answer", target: "output_1", kind: "sequence" },
    ],
  };
}

/** A minimal valid graph: input -> prompt -> output. */
export function makeGraph(overrides: Partial<GraphDefinition> = {}): GraphDefinition {
  return {
    id: "graph_1",
    name: "Test graph",
    entry_node_id: "input_1",
    nodes: [
      { id: "input_1", type: "input", position: { x: 0, y: 0 }, config: { variableName: "question" } },
      { id: "prompt_1", type: "prompt", position: { x: 240, y: 0 }, config: { template: "{question}" } },
      { id: "output_1", type: "output", position: { x: 480, y: 0 }, config: {} },
    ],
    edges: [
      { id: "edge_1", source: "input_1", target: "prompt_1", kind: "sequence" },
      { id: "edge_2", source: "prompt_1", target: "output_1", kind: "sequence" },
    ],
    ...overrides,
  };
}

export function makeRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: "run_1",
    graph_id: "graph_1",
    status: "succeeded",
    result: "stub answer",
    input: { question: "What is a graph?" },
    provider: "stub",
    error: null,
    started_at: FIXED_TIME,
    completed_at: FIXED_TIME,
    route_decisions: [],
    source: "draft_snapshot",
    runtime_target: "langgraph",
    ...overrides,
  };
}

export function makeTrace(overrides: Partial<NodeTrace> = {}): NodeTrace {
  return {
    node_id: "prompt_1",
    node_type: "prompt",
    status: "succeeded",
    input: { question: "What is a graph?" },
    output: "What is a graph?",
    started_at: FIXED_TIME,
    completed_at: FIXED_TIME,
    error: null,
    ...overrides,
  };
}

export function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return { severity: "warning", code: "GRAPH_UNREACHABLE_NODE", message: "Node 'x' is not reachable from the entry node", blocking: false, ...overrides };
}

/** A release of `graph` with real fingerprints. */
export function makeRelease(graph: GraphDefinition = makeGraph(), overrides: Partial<GraphRelease> = {}): GraphRelease {
  const semantic = semanticFingerprint(graph);
  return {
    id: `rel_${semantic.slice(0, 12)}`,
    graph_id: graph.id,
    graph,
    document_fingerprint: documentFingerprint(graph),
    semantic_fingerprint: semantic,
    resource_snapshots: {},
    release_notes: null,
    author: null,
    created_at: FIXED_TIME,
    diagnostics: [],
    ...overrides,
  };
}

export function releaseIndexEntry(release: GraphRelease): ReleaseIndexEntry {
  return {
    release_id: release.id,
    semantic_fingerprint: release.semantic_fingerprint,
    document_fingerprint: release.document_fingerprint,
    created_at: release.created_at,
  };
}

/** The catalog the mock API serves: one reliability rule and one cost rule with a parameter. */
export function makePolicyCatalog(): PolicyRuleInfo[] {
  return [
    {
      code: "POLICY_LLM_MODEL_NOT_PINNED",
      category: "reliability",
      title: "LLM model not pinned",
      description: "An LLM node without an explicit model.",
      gate: "compile",
      default_enforcement: "warn",
      params: [],
    },
    {
      code: "POLICY_TOO_MANY_MODEL_NODES",
      category: "cost",
      title: "Too many model nodes",
      description: "LLM and tool-loop nodes over a limit.",
      gate: "compile",
      default_enforcement: "warn",
      params: [{ name: "max_model_nodes", label: "Maximum model nodes", type: "integer", default: 5, minimum: 1 }],
    },
  ];
}

export function makeEffectivePolicy(rule: PolicyRuleInfo = makePolicyCatalog()[0], overrides: Partial<EffectivePolicyRule> = {}): EffectivePolicyRule {
  const params = Object.fromEntries(rule.params.map((param) => [param.name, param.default]));
  return {
    rule,
    enforcement: rule.default_enforcement,
    enforcement_source: "default",
    params,
    param_sources: Object.fromEntries(Object.keys(params).map((name) => [name, "default" as const])),
    ...overrides,
  };
}

export function makePolicyException(overrides: Partial<PolicyException> = {}): PolicyException {
  return {
    id: "pexc_1",
    graph_id: "graph_1",
    policy_code: "POLICY_LLM_MODEL_NOT_PINNED",
    node_id: null,
    reason: "Accepted for the pilot",
    created_at: FIXED_TIME,
    expires_at: "2026-02-01T00:00:00Z",
    ...overrides,
  };
}

export function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return { input: { question: "What is a graph?" }, node_outputs: {}, ...overrides };
}

export function makeDataset(overrides: Partial<FixtureDataset> = {}): FixtureDataset {
  return {
    id: "dataset_1",
    name: "Smoke questions",
    description: null,
    graph_id: "graph_1",
    fixtures: [makeFixture(), makeFixture({ input: { question: "How does TCP work?" } })],
    source: "manual",
    source_run_ids: [],
    created_at: FIXED_TIME,
    updated_at: FIXED_TIME,
    ...overrides,
  };
}

export function makePrompt(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return { id: "prompt_greeting", name: "Greeting", body: "Say hello to {name}.", ...overrides };
}

export function makeChatSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return { id: "chat_1", title: "Scratchpad", provider: "stub", model: "stub", messages: [], created_at: FIXED_TIME, updated_at: FIXED_TIME, ...overrides };
}
