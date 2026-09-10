import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { PROVIDER_TAXONOMY } from "../content/taxonomy";
import { showModelCatalog } from "../lib/modelCatalog";
import { spacing, typeScale } from "../theme";
import type { ChatProvider } from "../types";
import { TaxonomyTooltip } from "./Tooltip";
import { Select, TextInput } from "./ui/fields";
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

  useEffect(() => {
    if (!catalogProvider) {
      setModelOptions([]);
      setModelCatalogMessage("");
      setModelCatalogLoading(false);
      return;
    }

    let cancelled = false;
    setModelCatalogLoading(true);
    api
      .listProviderModels(provider, graphId ?? undefined)
      .then((catalog) => {
        if (cancelled) return;
        setModelOptions(catalog.models);
        setModelCatalogMessage(catalog.message);
        if (!model || !catalog.models.some((option) => option.id === model)) {
          const next = catalog.models[0]?.id ?? "";
          if (next && next !== model) onModelChangeRef.current(next);
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
  }, [catalogProvider, graphId, model, provider]);

  return (
    <>
      <div style={{ marginBottom: spacing[3] }}>
        <TaxonomyTooltip
          layout="inline"
          title={PROVIDER_TAXONOMY[provider]?.title ?? "Model provider"}
          summary={PROVIDER_TAXONOMY[provider]?.summary ?? "Chat provider for this LLM node"}
          details={PROVIDER_TAXONOMY[provider]?.details ?? "Select which backend executes this node."}
        >
          <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>Model provider</div>
        </TaxonomyTooltip>
        <Select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value as ChatProvider)}
          disabled={disabled}
        >
          <option value="stub">Stub (offline)</option>
          <option value="groq">Groq</option>
          <option value="google">Google Gemini</option>
          <option value="azure">Azure OpenAI</option>
          <option value="ollama">Ollama (local LLM)</option>
          <option value="openai_compat">OpenAI-compatible (HTTP)</option>
        </Select>
      </div>

      {catalogProvider ? (
        <div style={{ marginBottom: spacing[3] }}>
          <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>Model</div>
          {modelCatalogLoading ? (
            <Skeleton height={36} />
          ) : (
            <Select
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={modelOptions.length === 0 || disabled}
            >
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
          {modelCatalogMessage && !modelCatalogLoading && (
            <div style={{ ...typeScale.caption, opacity: 0.6, marginTop: spacing[1], lineHeight: "16px" }}>
              {modelCatalogMessage}
            </div>
          )}
        </div>
      ) : provider === "openai_compat" ? (
        <div style={{ marginBottom: spacing[3] }}>
          <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>Model</div>
          <TextInput
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="gpt-4o-mini"
            disabled={disabled}
          />
        </div>
      ) : null}
    </>
  );
}
