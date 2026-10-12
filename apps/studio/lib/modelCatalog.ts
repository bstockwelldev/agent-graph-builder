import type { ChatProvider } from "@bstockwelldev/agent-graph-sdk";

/** Providers whose models are loaded from `/api/providers/{provider}/models`. */
export const CATALOG_PROVIDERS: ChatProvider[] = ["ollama", "groq", "azure", "google"];

export function showModelCatalog(provider: ChatProvider): boolean {
  return CATALOG_PROVIDERS.includes(provider);
}

/** Only providers with a model catalog (or openai_compat) take a run-level model. */
export function sendsRunModel(provider: ChatProvider): boolean {
  return showModelCatalog(provider) || provider === "openai_compat";
}

/** The model the Run panel sends, or undefined to run on the provider's default model. */
export function runModelArg(provider: ChatProvider, selectedModel: string): string | undefined {
  return sendsRunModel(provider) ? selectedModel || undefined : undefined;
}
