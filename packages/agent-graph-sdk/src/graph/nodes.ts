import type { NodeType } from "../types.js";

// Ported from apps/playground/src/App.tsx's defaultConfig()/labelFor() —
// those switches were already exhaustive over all 12 NodeTypes since
// studio-consolidation Phase 1, with a comment noting the 6 new cases
// existed "only to keep this switch exhaustive" since nothing could reach
// them without a palette entry. Phase 4d's NodePalette now creates all 12,
// so every case here is reachable for real.

/** The backend ExtractConfig's default `output_schema`: the document-facts
 * shape the stub extractor returns. A fresh object per call -- callers
 * mutate the config freely. */
export function documentFactsSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      page_count: { type: "integer" },
      total_chars: { type: "integer" },
      source_file: { type: "string" },
      has_embedded_text: { type: "boolean" },
      extraction_method: { type: "string", enum: ["stub", "text", "ocr", "vision"] },
      layout_preserved: { type: "boolean" },
    },
    required: ["title", "page_count", "total_chars", "source_file", "has_embedded_text", "extraction_method", "layout_preserved"],
  };
}

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
      // backend/app/node_configs.py's CodeExecConfig.content requires at
      // least 1 character -- an empty default made every new code_exec
      // node invalid the instant it was created, before the user touched
      // anything. Same bug, same fix, for human_gate below.
      return { content: "Describe what this step should produce.", codeExecLanguage: "python" };
    case "human_gate":
      return { content: "Review and approve to continue." };
    case "subgraph":
      return { graphId: "", version: "latest" };
    case "transform":
      return { type: "format_message", template: "{value}" };
    case "decision":
      return {
        schema: "route",
        provider: "stub",
        model: "",
        systemPrompt: "",
        threshold: 0.6,
        onLowConfidence: "default",
        rules: [],
      };
    case "extract":
      return {
        source: "upload",
        variableName: null,
        stages: ["text", "ocr"],
        outputSchema: documentFactsSchema(),
        provider: "stub",
        model: null,
        threshold: 0.7,
        pageLimit: 10,
      };
  }
}

/** A transform node's one-line description ("select /answer"). */
function transformSummary(config: Record<string, unknown>): string {
  switch (config.type) {
    case "select":
      return `select ${String(config.pointer ?? "")}`.trim();
    case "wrap":
      return `wrap as ${String(config.field ?? "")}`.trim();
    case "coerce":
      return `to ${String(config.targetType ?? "")}`.trim();
    case "format_message":
      return "format message";
    default:
      return "transform";
  }
}

// Node card summary line (Phase 10 Slice D, widened by
// studio-graph-workbench-redesign-plan.md Slice 4 / review section 14: "a
// node should communicate at rest its important configuration"). The
// title already shows each type's single most distinguishing field
// (`labelFor`) unless the user named the node -- in which case that field
// moves down into this line so it isn't lost. Returns null rather than
// filler text when there's genuinely nothing more to say.
export type SummaryContext = {
  /** The node has a user-given name, so `labelFor`'s field isn't the title. */
  hasUserLabel?: boolean;
  /** Outgoing edges from this node (router/branch route count). */
  routeCount?: number;
  /** Wave 4a: `"<kind>:<id>"` → registry resource name, for bound nodes. */
  resourceNames?: Readonly<Record<string, string>>;
  /**
   * The Run panel's current selection. When given, `llm` / `tool_loop` summaries show the
   * provider and model the node would actually run on (see `effectiveModelFor`) instead of
   * the node's own saved provider, which the runtime ignores.
   */
  runSelection?: RunSelectionSummary;
};

/** What the Run panel will send: the run provider, and a model only when one is selected. */
export type RunSelectionSummary = { provider: string; model?: string };

/** Which scope supplied a node's model (mirrors backend `resolve_requested_model`). */
export type ModelSource = "run" | "profile" | "pin" | "default";

export type EffectiveModel = {
  provider: string;
  /** The model asked for, or null when the provider's default model applies. */
  requestedModel: string | null;
  source: ModelSource;
};

/**
 * Placeholder model names are not real pins: the backend swaps them for the provider's
 * default. Must equal `PLACEHOLDER_MODELS` in backend `provider_defaults.py`
 * (`contract/model-resolution.json`).
 */
const PLACEHOLDER_MODELS: ReadonlySet<string> = new Set(["qwen2.5:3b", "stub"]);

/**
 * The provider and model an `llm` / `tool_loop` node would run on, and why. Order, matching the
 * runtime: run model, then a bound profile's model, then the node's own `model`; a placeholder or
 * nothing means the provider default. The provider is always the run's: the backend never reads
 * a node's own `provider` for these nodes. `profileModel` is optional because the node card
 * only knows a profile's name; a bound profile with an unknown model reports source `profile`.
 */
export function effectiveModelFor(
  config: Record<string, unknown>,
  runSelection: RunSelectionSummary,
  profile: { bound: boolean; model?: string | null } = { bound: false },
): EffectiveModel {
  const { provider } = runSelection;
  const runModel = runSelection.model || null;
  const pin = typeof config.model === "string" && config.model ? config.model : null;
  if (runModel) return resolved(provider, runModel, "run");
  if (profile.bound && profile.model === undefined) return { provider, requestedModel: null, source: "profile" };
  if (profile.bound && profile.model) return resolved(provider, profile.model, "profile");
  if (pin) return resolved(provider, pin, "pin");
  return { provider, requestedModel: null, source: "default" };
}

function resolved(provider: string, model: string, source: ModelSource): EffectiveModel {
  return PLACEHOLDER_MODELS.has(model)
    ? { provider, requestedModel: null, source: "default" }
    : { provider, requestedModel: model, source };
}

/** `groq · llama-3.3-70b (run)`, `stub · default model`, `ollama · profile Fast`. */
function effectiveModelLine(effective: EffectiveModel, profileName: string | null): string {
  const { provider, requestedModel, source } = effective;
  if (source === "profile" && requestedModel === null) return `${provider} · profile ${profileName ?? ""}`.trim();
  const model = requestedModel ?? "default model";
  const suffix = source === "run" ? " (run)" : source === "pin" ? " (pinned)" : source === "profile" ? " (profile)" : "";
  return `${provider} · ${model}${suffix}`;
}

function boundId(config: Record<string, unknown>, field: string): string | null {
  const value = config[field];
  return typeof value === "string" && value.trim() ? value : null;
}

/** Display name of a bound resource: its registry name when known, else its id. */
export function boundResourceName(
  config: Record<string, unknown>,
  field: string,
  kind: string,
  names: Readonly<Record<string, string>> = {},
): string | null {
  const id = boundId(config, field);
  return id ? names[`${kind}:${id}`] ?? id : null;
}

const SNIPPET_MAX = 40;

function snippet(value: unknown): string | null {
  const textValue = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!textValue) return null;
  return textValue.length > SNIPPET_MAX ? `${textValue.slice(0, SNIPPET_MAX - 1)}…` : textValue;
}

/** `{name}` placeholders in a prompt template, in order, de-duplicated. */
export function templateVariables(template: string): string[] {
  const seen = new Set<string>();
  for (const match of template.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) seen.add(match[1]);
  return [...seen];
}

/** Wave 4a: a library-bound prompt/LLM/tool-loop node's title is its
 * resource's name (null when the node isn't bound). */
/** Wave 7c: "latest release" / "draft" / a pinned release id. */
export function versionLabel(version: unknown): string {
  if (version === "draft") return "draft";
  if (typeof version === "string" && version && version !== "latest") return version;
  return "latest release";
}

export function boundTitleFor(
  type: NodeType,
  config: Record<string, unknown>,
  names: Readonly<Record<string, string>> = {},
): string | null {
  if (type === "prompt") return boundResourceName(config, "promptId", "prompts", names);
  if (type === "llm" || type === "tool_loop") return boundResourceName(config, "llmProfileId", "llm_profiles", names);
  if (type === "subgraph") return boundResourceName(config, "graphId", "graphs", names);
  return null;
}

export function summaryFor(type: NodeType, config: Record<string, unknown>, context: SummaryContext = {}): string | null {
  const { hasUserLabel = false, routeCount, resourceNames, runSelection } = context;
  switch (type) {
    case "llm": {
      const profile = boundResourceName(config, "llmProfileId", "llm_profiles", resourceNames);
      if (runSelection) {
        return effectiveModelLine(effectiveModelFor(config, runSelection, { bound: profile !== null }), profile);
      }
      if (profile) return hasUserLabel ? `profile · ${profile}` : "LLM profile";
      const provider = String(config.provider ?? "ollama");
      return hasUserLabel ? `${provider} · ${String(config.model ?? "model")}` : `via ${provider}`;
    }
    case "tool_loop": {
      const iterations = `max ${String(config.maxToolIterations ?? 4)} iterations`;
      const profile = boundResourceName(config, "llmProfileId", "llm_profiles", resourceNames);
      if (runSelection) {
        const line = effectiveModelLine(effectiveModelFor(config, runSelection, { bound: profile !== null }), profile);
        return `${line} · ${iterations}`;
      }
      if (profile) return hasUserLabel ? `profile · ${profile} · ${iterations}` : `LLM profile · ${iterations}`;
      return hasUserLabel
        ? `${String(config.model ?? "model")} · ${iterations}`
        : `via ${String(config.provider ?? "ollama")} · ${iterations}`;
    }
    case "tool": {
      const input = `input: ${String(config.inputVariable ?? "question")}`;
      return hasUserLabel ? `${String(config.toolName ?? "tool")} · ${input}` : input;
    }
    case "guardrail":
      return config.allowUrls ? "Allows URLs" : "Blocks URLs";
    case "rubric":
      return config.rubricFailOnFindings ? "Fails run on findings" : "Findings don't fail the run";
    case "prompt": {
      const bound = boundResourceName(config, "promptId", "prompts", resourceNames);
      if (bound) return hasUserLabel ? `Library · ${bound}` : "Library prompt";
      const variables = templateVariables(String(config.template ?? ""));
      if (variables.length > 0) return `vars: ${variables.join(", ")}`;
      return hasUserLabel ? snippet(config.template) : null;
    }
    case "router":
    case "branch":
    case "decision":
      if (routeCount !== undefined && routeCount > 0) return `${routeCount} route${routeCount === 1 ? "" : "s"}`;
      return type === "branch" && hasUserLabel ? snippet(config.content) : null;
    case "extract": {
      const stages = Array.isArray(config.stages) ? config.stages.map(String).join("+") : "text+ocr";
      const provider = String(config.provider ?? "stub");
      return hasUserLabel ? `${provider} · ${stages}` : `via ${provider}`;
    }
    case "input":
      return hasUserLabel ? `variable: ${String(config.variableName ?? "question")}` : null;
    case "output":
      return "Final result";
    case "code_exec":
    case "human_gate":
      return snippet(config.content);
    case "transform": {
      const bound = boundResourceName(config, "transformId", "transforms", resourceNames);
      if (bound) return hasUserLabel ? `Library · ${bound}` : "Library transform";
      return hasUserLabel ? transformSummary(config) : null;
    }
    case "subgraph": {
      const version = versionLabel(config.version);
      const graphId = boundId(config, "graphId");
      if (!graphId) return "Pick a graph";
      return hasUserLabel ? `${resourceNames?.[`graphs:${graphId}`] ?? graphId} · ${version}` : version;
    }
  }
}

/** Node title: the user's name for it when set (stored on
 * `node.extensions.label`), otherwise derived from config. */
export function nodeLabel(type: NodeType, config: Record<string, unknown>, userLabel?: string | null): string {
  const trimmed = userLabel?.trim();
  return trimmed ? trimmed : labelFor(type, config);
}

/** Returns `extensions` with `label` set (or removed when blank), or
 * `undefined` if nothing else is left -- so an unnamed node round-trips
 * with no `extensions` at all, exactly as before naming existed. */
export function withUserLabel(
  extensions: Record<string, unknown> | null | undefined,
  label: string | null | undefined,
): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = { ...(extensions ?? {}) };
  const trimmed = label?.trim();
  if (trimmed) next.label = trimmed;
  else delete next.label;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function labelFor(type: NodeType, config: Record<string, unknown>): string {
  switch (type) {
    case "input":
      return `input: ${config.variableName ?? "question"}`;
    case "prompt": {
      if (boundId(config, "promptId")) return String(config.promptId);
      const template = String(config.template ?? "");
      return template.length > 28 ? `${template.slice(0, 28)}…` : template || "prompt";
    }
    case "llm":
      return String(boundId(config, "llmProfileId") ?? config.model ?? "llm");
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
      return String(boundId(config, "llmProfileId") ?? config.model ?? "tool loop");
    case "code_exec":
      return String(config.codeExecLanguage ?? "code exec");
    case "human_gate":
      return "human gate";
    case "subgraph":
      return String(boundId(config, "graphId") ?? "subgraph");
    case "transform":
      return boundId(config, "transformId") ?? transformSummary(config);
    case "decision":
      return `decision: ${String(config.schema ?? "route")}`;
    case "extract":
      return `extract: ${String(config.source ?? "upload")}`;
  }
}
