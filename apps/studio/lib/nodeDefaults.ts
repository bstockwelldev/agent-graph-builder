import type { NodeType } from "@bstockwelldev/agent-graph-sdk";

// Ported from apps/playground/src/App.tsx's defaultConfig()/labelFor() —
// those switches were already exhaustive over all 12 NodeTypes since
// studio-consolidation Phase 1, with a comment noting the 6 new cases
// existed "only to keep this switch exhaustive" since nothing could reach
// them without a palette entry. Phase 4d's NodePalette now creates all 12,
// so every case here is reachable for real.
export function defaultConfig(type: NodeType): Record<string, unknown> {
  switch (type) {
    case "input":
      return { variableName: "question" };
    case "prompt":
      return { template: "{question}" };
    case "llm":
      return { provider: "ollama", model: "qwen2.5:3b", systemPrompt: "" };
    case "tool":
      return { toolName: "lookup_topic", inputVariable: "question" };
    case "router":
      return {};
    case "output":
      return {};
    case "guardrail":
      return { allowUrls: false };
    case "rubric":
      return { rubricFailOnFindings: false };
    case "branch":
      return { content: "" };
    case "tool_loop":
      return { provider: "ollama", model: "qwen2.5:3b", systemPrompt: "", maxToolIterations: 4 };
    case "code_exec":
      return { content: "", codeExecLanguage: "python" };
    case "human_gate":
      return { content: "" };
  }
}

export function labelFor(type: NodeType, config: Record<string, unknown>): string {
  switch (type) {
    case "input":
      return `input: ${config.variableName ?? "question"}`;
    case "prompt": {
      const template = String(config.template ?? "");
      return template.length > 28 ? `${template.slice(0, 28)}…` : template || "prompt";
    }
    case "llm":
      return String(config.model ?? "llm");
    case "tool":
      return String(config.toolName ?? "tool");
    case "router":
      return "router";
    case "output":
      return "output";
    case "guardrail":
      return "guardrail";
    case "rubric":
      return "rubric";
    case "branch":
      return String(config.content ?? "branch");
    case "tool_loop":
      return String(config.model ?? "tool loop");
    case "code_exec":
      return String(config.codeExecLanguage ?? "code exec");
    case "human_gate":
      return "human gate";
  }
}
