import type { ChatProvider } from "@bstockwelldev/agent-graph-sdk";

/** Chat providers in picker order (the canvas's ProviderModelPicker and the
 * LLM-profile form list the same set). */
export const PROVIDER_ORDER: ChatProvider[] = ["stub", "ollama", "groq", "google", "azure", "openai_compat"];

export const PROVIDER_LABEL: Record<string, string> = {
  stub: "Stub",
  ollama: "Ollama (local)",
  groq: "Groq",
  google: "Google Gemini",
  azure: "Azure OpenAI",
  openai_compat: "OpenAI-compatible",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider] ?? provider;
}

export function isChatProvider(value: unknown): value is ChatProvider {
  return typeof value === "string" && (PROVIDER_ORDER as string[]).includes(value);
}
