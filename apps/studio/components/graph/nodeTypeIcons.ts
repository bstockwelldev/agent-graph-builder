import {
  Bot,
  Code2,
  GitBranch,
  GitFork,
  ListChecks,
  LogIn,
  LogOut,
  PauseCircle,
  PenLine,
  Repeat,
  ShieldCheck,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { NodeType } from "@bstockwelldev/agent-graph-sdk";

/** One icon per node type, shared by the node card and the inspector
 * header so the two always agree (Wave 2.5). */
export const NODE_TYPE_ICONS: Record<NodeType, LucideIcon> = {
  input: LogIn,
  prompt: PenLine,
  llm: Bot,
  tool: Wrench,
  router: GitBranch,
  output: LogOut,
  guardrail: ShieldCheck,
  rubric: ListChecks,
  human_gate: PauseCircle,
  tool_loop: Repeat,
  code_exec: Code2,
  branch: GitFork,
  subgraph: Workflow,
};
