import { useEffect, useRef, useState } from "react";
import { client } from "@/lib/api-client";
import { PROVIDER_TAXONOMY } from "@/content/taxonomy";
import { showModelCatalog } from "@/lib/modelCatalog";
import type { ChatProvider } from "@bstockwelldev/agent-graph-sdk";
import { Combobox, type ComboboxOption } from "./ui/Combobox";
import { Field } from "./ui/Field";
import { Skeleton } from "./ui/Skeleton";

export function ProviderModelPicker({
  graphId,
  provider,
  model,
  onProviderChange,
  onModelChange,
  disabled = false,
}: {
  graphId?: string | null;
  provider: ChatProvider;
  model: string;
  onProviderChange: (provider: ChatProvider) => void;
  onModelChange: (model: string) => void;
  disabled?: boolean;
}) {
  const [modelOptions, setModelOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [modelCatalogMessage, setModelCatalogMessage] = useState("");
  const [modelCatalogLoading, setModelCatalogLoading] = useState(false);
  const catalogProvider = showModelCatalog(provider);
  const onModelChangeRef = useRef(onModelChange);
  onModelChangeRef.current = onModelChange;
  // Read at fetch time only: the catalog is per provider, so picking (or
  // typing a custom) model must not refetch it or snap back to the default.
  const modelRef = useRef(model);
  modelRef.current = model;

  useEffect(() => {
    if (!catalogProvider) {
      setModelOptions([]);
      setModelCatalogMessage("");
      setModelCatalogLoading(false);
      return;
    }

    let cancelled = false;
    setModelCatalogLoading(true);
    client
      .providers.models(provider, { graphId: graphId ?? undefined })
      .then((catalog) => {
        if (cancelled) return;
        setModelOptions(catalog.models);
        setModelCatalogMessage(catalog.message);
        const current = modelRef.current;
        if (!current || !catalog.models.some((option) => option.id === current)) {
          const next = catalog.models[0]?.id ?? "";
          if (next && next !== current) onModelChangeRef.current(next);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load provider models:", err);
        setModelOptions([]);
        setModelCatalogMessage("Could not load model catalog.");
      })
      .finally(() => {
        if (!cancelled) setModelCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [catalogProvider, graphId, provider]);

  const providerMeta = PROVIDER_TAXONOMY[provider];
  return (
    <>
      <Field label="Provider" hint={providerMeta?.details}>
        {(id) => (
          <Combobox
            id={id}
            aria-label="Model provider"
            value={provider}
            options={PROVIDER_OPTIONS}
            onChange={(value) => onProviderChange(value as ChatProvider)}
            disabled={disabled}
            searchPlaceholder="Search providers…"
          />
        )}
      </Field>

      {catalogProvider || provider === "openai_compat" ? (
        <Field label="Model" hint={modelCatalogMessage || undefined}>
          {(id) =>
            modelCatalogLoading ? (
              <Skeleton height={36} />
            ) : (
              <Combobox
                id={id}
                aria-label="Model"
                value={model}
                options={modelOptions.map((option) => ({
                  value: option.id,
                  label: option.label,
                  description: option.label !== option.id ? option.id : undefined,
                }))}
                onChange={onModelChange}
                disabled={disabled}
                allowCustom
                placeholder={provider === "openai_compat" ? "gpt-4o-mini" : "Select a model"}
                searchPlaceholder="Search or type a model id…"
                emptyMessage={modelCatalogMessage || "No models listed"}
              />
            )
          }
        </Field>
      ) : null}
    </>
  );
}

/** Provider brand-ish dot colours (Wave 2.5) -- a quick visual key in the
 * provider combobox and the run console's provider chip. */
export const PROVIDER_COLOR: Record<string, string> = {
  stub: "#8b909c",
  groq: "#f55036",
  google: "#4c8df6",
  azure: "#2f8fdf",
  ollama: "#e8eaed",
  openai_compat: "#3cb873",
};

export function ProviderDot({ provider, size = 8 }: { provider: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: size, height: size, borderRadius: 999, background: PROVIDER_COLOR[provider] ?? "#8b909c", flexShrink: 0 }}
    />
  );
}

const PROVIDER_ORDER: ChatProvider[] = ["stub", "ollama", "groq", "google", "azure", "openai_compat"];
const PROVIDER_LABEL: Record<string, string> = {
  stub: "Stub (offline)",
  ollama: "Ollama (local)",
  groq: "Groq",
  google: "Google Gemini",
  azure: "Azure OpenAI",
  openai_compat: "OpenAI-compatible",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider] ?? provider;
}

export const PROVIDER_OPTIONS: ComboboxOption[] = PROVIDER_ORDER.map((value) => ({
  value,
  label: PROVIDER_LABEL[value],
  description: PROVIDER_TAXONOMY[value]?.summary,
  icon: <ProviderDot provider={value} />,
  group: value === "stub" || value === "ollama" ? "Local" : "Hosted",
}));
