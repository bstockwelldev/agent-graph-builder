export type ChatProvider = "ollama" | "stub" | "openai_compat" | "groq" | "google" | "azure";

export type NodeType = "input" | "prompt" | "llm" | "tool" | "router" | "output";
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
  status: "queued" | "running" | "succeeded" | "failed";
  result: unknown;
  input?: Record<string, unknown>;
  provider?: string | null;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  route_decisions?: RouteDecision[];
}

export interface NodeTrace {
  node_id: string;
  node_type: NodeType;
  status: "running" | "succeeded" | "failed";
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
    | "node.started"
    | "node.completed"
    | "node.failed"
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
  // Whether the server already has a key configured for this provider (via
  // env var). The value itself is never sent to the browser -- see
  // backend/app/provider_credentials.py.
  configured: boolean;
}
