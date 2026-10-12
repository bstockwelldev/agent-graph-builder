/** What an LLM / tool_loop node's trace says it ran on and why (backend `_model_resolution`). */
export type RecordedModel = {
  provider: string;
  /** The model the provider reported using. */
  model: string;
  /** Which scope supplied it; absent on traces recorded before this was captured. */
  source: "run" | "profile" | "pin" | "default" | "override" | null;
};

const SOURCES: readonly string[] = ["run", "profile", "pin", "default", "override"];

export function recordedModelOf(input: unknown): RecordedModel | null {
  if (typeof input !== "object" || input === null) return null;
  const { provider, model, modelSource } = input as Record<string, unknown>;
  if (typeof provider !== "string" || typeof model !== "string" || !provider || !model) return null;
  return {
    provider,
    model,
    source: typeof modelSource === "string" && SOURCES.includes(modelSource) ? (modelSource as RecordedModel["source"]) : null,
  };
}

const SOURCE_TEXT: Record<NonNullable<RecordedModel["source"]>, string> = {
  run: "set in the Run panel",
  profile: "from the node's LLM profile",
  pin: "the node's model pin",
  default: "the provider's default model",
  override: "a replay override",
};

/** `groq · llama-3.3-70b: set in the Run panel`; just `provider · model` for older traces. */
export function recordedModelLine(recorded: RecordedModel): string {
  const base = `${recorded.provider} · ${recorded.model}`;
  return recorded.source ? `${base}: ${SOURCE_TEXT[recorded.source]}` : base;
}
