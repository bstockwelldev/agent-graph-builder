"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { BindableResourceKind } from "@bstockwelldev/agent-graph-sdk";
import { client } from "@/lib/api-client";
import { useResourceChanged } from "@/lib/resourceEvents";

/** A registry item as a binding picker needs it. */
export type BindableResource = {
  id: string;
  name: string;
  /** Prompt body, or "model · provider" for an LLM profile, or a tool's description. */
  detail: string;
  /** Prompt body (for the read-only template preview). */
  body?: string;
};

/** The workbench panel that edits each registry (components/workbench/panels.ts). */
export const RESOURCE_PANEL: Record<BindableResourceKind, "prompts" | "llmProfiles" | "tools"> = {
  prompts: "prompts",
  llm_profiles: "llmProfiles",
  tools: "tools",
};

export const RESOURCE_NOUN: Record<BindableResourceKind, string> = {
  prompts: "prompt",
  llm_profiles: "LLM profile",
  tools: "tool",
};

async function listBindable(kind: BindableResourceKind): Promise<BindableResource[]> {
  if (kind === "prompts") {
    return (await client.prompts.list()).map((p) => ({ id: p.id, name: p.name, detail: p.body, body: p.body }));
  }
  if (kind === "llm_profiles") {
    return (await client.llmProfiles.list()).map((p) => ({
      id: p.id,
      name: p.name,
      detail: [p.model, p.model_provider].filter(Boolean).join(" · "),
    }));
  }
  return (await client.tools.list()).map((t) => ({ id: t.id, name: t.id, detail: t.description }));
}

/**
 * One registry's items for a binding picker. Refetches whenever a resource
 * is saved or deleted anywhere in the studio (lib/resourceEvents.ts), so a
 * node bound to a prompt shows the edit made in the resource panel.
 */
export function useBindableResources(kind: BindableResourceKind | null): {
  items: BindableResource[];
  loaded: boolean;
} {
  const [state, setState] = useState<{ items: BindableResource[]; loaded: boolean }>({ items: [], loaded: false });
  const [nonce, setNonce] = useState(0);
  useResourceChanged(() => setNonce((n) => n + 1));
  useEffect(() => {
    if (!kind) return;
    let cancelled = false;
    listBindable(kind)
      .then((items) => {
        if (!cancelled) setState({ items, loaded: true });
      })
      .catch(() => {
        if (!cancelled) setState((current) => ({ ...current, loaded: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [kind, nonce]);
  return state;
}

/** `"prompts:<id>"` / `"llm_profiles:<id>"` → display name, for node cards. */
export type ResourceNames = Readonly<Record<string, string>>;

const ResourceNamesContext = createContext<ResourceNames>({});
export const ResourceNamesProvider = ResourceNamesContext.Provider;
export function useResourceNames(): ResourceNames {
  return useContext(ResourceNamesContext);
}

/** Loads the names map GraphEditor provides to node cards (only when the
 * graph actually has bound nodes -- no registry calls otherwise). */
export function useResourceNamesMap(enabled: boolean): ResourceNames {
  const [names, setNames] = useState<ResourceNames>({});
  const load = useCallback(() => {
    if (!enabled) return;
    // Wave 7c: saved graph names too, for subgraph node cards ("graphs:<id>").
    Promise.all([listBindable("prompts"), listBindable("llm_profiles"), client.listGraphs().catch(() => [])])
      .then(([prompts, profiles, graphs]) =>
        setNames(
          Object.fromEntries([
            ...prompts.map((p) => [`prompts:${p.id}`, p.name] as const),
            ...profiles.map((p) => [`llm_profiles:${p.id}`, p.name] as const),
            ...graphs.map((g) => [`graphs:${g.id}`, g.name] as const),
          ]),
        ),
      )
      .catch(() => {
        // Names are cosmetic; cards fall back to ids.
      });
  }, [enabled]);
  useEffect(load, [load]);
  useResourceChanged(load);
  return names;
}
