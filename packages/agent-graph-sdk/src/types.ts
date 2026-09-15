export type ChatProvider = "ollama" | "stub" | "openai_compat" | "groq" | "google" | "azure";

/**
 * The six original POC node types plus six absorbed from
 * micro-ui-agent-builder's FlowStep vocabulary (studio-consolidation
 * program — see docs/planning/features/studio-consolidation-plan.md).
 * All twelve have runtime executors as of Phase 2 (backend/app/nodes.py).
 */
export type NodeType =
  | "input"
  | "prompt"
  | "llm"
  | "tool"
  | "router"
  | "output"
  | "guardrail"
  | "rubric"
  | "human_gate"
  | "tool_loop"
  | "code_exec"
  | "branch";
export type EdgeKind = "sequence" | "conditional" | "default";
export type GraphOrientation = "auto" | "horizontal" | "vertical";

export interface NodePosition {
  x: number;
  y: number;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  position: NodePosition;
  config: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  condition?: string | null;
}

export interface GraphDefinition {
  id: string;
  name: string;
  entry_node_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  orientation?: GraphOrientation;
  updated_at?: string | null;
}

export interface Diagnostic {
  severity: "error" | "warning";
  code: string;
  node_id?: string | null;
  edge_id?: string | null;
  message: string;
  blocking: boolean;
}

export interface CompileResult {
  graph_id: string;
  compiled_workflow_id: string | null;
  diagnostics: Diagnostic[];
  ok: boolean;
}

export interface RouteDecision {
  nodeId: string;
  selectedEdgeId: string;
  selectedTargetNodeId: string;
}

export interface RunSummary {
  run_id: string;
  graph_id: string;
  // "paused" added for the `human_gate` node type (studio-consolidation
  // Phase 2): a run stopped at a human-approval checkpoint, resumable via
  // `AgentGraphClient.resumeRun` (POST /api/runs/{id}/resume).
  status: "queued" | "running" | "succeeded" | "failed" | "paused";
  result: unknown;
  input?: Record<string, unknown>;
  provider?: string | null;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  route_decisions?: RouteDecision[];
  events?: PlatformEvent[];
}

export interface NodeTrace {
  node_id: string;
  node_type: NodeType;
  status: "running" | "succeeded" | "failed" | "paused";
  input: unknown;
  output: unknown;
  started_at: string;
  completed_at?: string | null;
  error?: string | null;
}

export interface PlatformEvent {
  event_type:
    | "run.started"
    | "run.completed"
    | "run.failed"
    | "run.paused"
    | "run.resumed"
    | "node.started"
    | "node.completed"
    | "node.failed"
    | "node.paused"
    | "edge.selected";
  run_id: string;
  node_id?: string | null;
  occurred_at: string;
  sequence: number;
  payload: Record<string, unknown>;
}

export interface ProviderModelOption {
  id: string;
  label: string;
}

export interface ProviderModelCatalog {
  provider: ChatProvider;
  models: ProviderModelOption[];
  source: "live" | "fallback";
  cached: boolean;
  message: string;
}

export interface ProviderCredentials {
  provider: ChatProvider | string;
  requires_api_key: boolean;
  label: string;
  env_var: string;
  configured: boolean;
}

/**
 * Stored resources (studio-consolidation Phase 3 — see
 * docs/planning/features/studio-consolidation-plan.md and
 * backend/app/resource_models.py). Field names are plain snake_case,
 * matching this SDK's existing convention (`entry_node_id`, `run_id`, …)
 * rather than micro-ui-agent-builder's camelCase Zod schemas.
 */
export interface PromptTemplate {
  id: string;
  name: string;
  body: string;
}

export interface ToolDefinition {
  id: string;
  description: string;
  parameters_json: string;
  requires_approval: boolean;
  /** When set with mcp_tool_name, `tool` nodes calling this id dispatch to
   * that MCP server + remote tool name instead of a builtin or mock echo. */
  mcp_server_id?: string | null;
  mcp_tool_name?: string | null;
}

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  transport: "http" | "sse" | "stdio";
  enabled: boolean;
}

export interface AgentProfile {
  id: string;
  name: string;
  description?: string | null;
  default_flow_id?: string | null;
  system_instructions?: string | null;
  optional_elements: string[];
}

export interface LlmProfile {
  id: string;
  name: string;
  model: string;
  model_provider?: string | null;
  description?: string | null;
}
