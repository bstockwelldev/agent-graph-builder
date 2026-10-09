import { useEffect, useState } from "react";
import { client } from "@/lib/api-client";

/**
 * Ollama runs on the developer's machine, so the backend only reports it ready in local
 * development (`GET /api/providers/ollama/ready`); on Vercel `localhost` is the serverless
 * function. Asked once per page load and cached, since it cannot change while the app is open.
 *
 * Fails soft: if the backend can't be asked, Ollama stays listed. Hiding a provider because of
 * a network blip would be worse than showing one that then reports itself unavailable.
 */
let ollamaAvailability: Promise<boolean> | null = null;

export function loadOllamaAvailability(): Promise<boolean> {
  ollamaAvailability ??= Promise.resolve()
    .then(() => client.providers.ready("ollama"))
    .then((readiness) => readiness.ready !== false)
    .catch(() => true);
  return ollamaAvailability;
}

/** Test hook: forget the cached answer. */
export function resetOllamaAvailabilityCache(): void {
  ollamaAvailability = null;
}

/** `null` until the backend has answered. */
export function useOllamaAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadOllamaAvailability().then((value) => {
      if (!cancelled) setAvailable(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}

/**
 * Drops the Ollama option once the backend says it is unreachable. The currently selected value is
 * always kept so an existing choice never renders as a blank control.
 */
export function withoutUnavailableProviders<T extends { value: string }>(
  options: T[],
  ollamaAvailable: boolean | null,
  selected?: string,
): T[] {
  if (ollamaAvailable !== false) return options;
  return options.filter((option) => option.value !== "ollama" || option.value === selected);
}

/** Same as {@link withoutUnavailableProviders} for plain provider-id lists. */
export function withoutUnavailableProviderIds<T extends string>(
  ids: readonly T[],
  ollamaAvailable: boolean | null,
  selected?: string,
): T[] {
  if (ollamaAvailable !== false) return [...ids];
  return ids.filter((id) => id !== "ollama" || id === selected);
}
