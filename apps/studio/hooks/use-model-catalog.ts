"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatProvider } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { showModelCatalog } from "@/lib/modelCatalog";

export type ModelOption = { id: string; label: string };

/**
 * A provider's model catalog (`/api/providers/{provider}/models`), shared by
 * the canvas's ProviderModelPicker and the LLM-profile form so both offer
 * the same models. When the catalog loads, a missing model is filled with
 * the first one; `replaceUnknown` also replaces a model the catalog doesn't
 * list (the canvas does, a stored profile keeps its value).
 */
export function useModelCatalog({
  provider,
  model,
  onModelChange,
  graphId,
  replaceUnknown = true,
}: {
  provider: ChatProvider | null;
  model: string;
  onModelChange: (model: string) => void;
  graphId?: string | null;
  replaceUnknown?: boolean;
}): { options: ModelOption[]; message: string; loading: boolean; enabled: boolean } {
  const [options, setOptions] = useState<ModelOption[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const enabled = provider !== null && showModelCatalog(provider);
  const onModelChangeRef = useRef(onModelChange);
  onModelChangeRef.current = onModelChange;
  // Read at fetch time only: the catalog is per provider, so picking (or
  // typing a custom) model must not refetch it or snap back to the default.
  const modelRef = useRef(model);
  modelRef.current = model;

  useEffect(() => {
    if (!enabled || provider === null) {
      setOptions([]);
      setMessage("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    client.providers
      .models(provider, { graphId: graphId ?? undefined })
      .then((catalog) => {
        if (cancelled) return;
        setOptions(catalog.models);
        setMessage(catalog.message);
        const current = modelRef.current;
        const unknown = Boolean(current) && !catalog.models.some((option) => option.id === current);
        if (!current || (replaceUnknown && unknown)) {
          const next = catalog.models[0]?.id ?? "";
          if (next && next !== current) onModelChangeRef.current(next);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load provider models:", err);
        setOptions([]);
        setMessage("Could not load model catalog.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, graphId, provider, replaceUnknown]);

  return { options, message, loading, enabled };
}
