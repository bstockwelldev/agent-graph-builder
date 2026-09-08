export type NodeType = "input" | "prompt" | "llm" | "tool" | "router" | "output";
export type EdgeKind = "sequence" | "conditional" | "default";

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
  updated_at?: string | null;
}

export interface Diagnostic {
  severity: "error" | "warning";
  code: string;
  node_id?: string | null;
  message: string;
  blocking: boolean;
}

export interface CompileResult {
  graph_id: string;
  compiled_workflow_id: string | null;
  diagnostics: Diagnostic[];
  ok: boolean;
}

export interface RunSummary {
  run_id: string;
  graph_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  result: unknown;
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
