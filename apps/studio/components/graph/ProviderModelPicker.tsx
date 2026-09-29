import { useModelCatalog } from "@/hooks/use-model-catalog";
import { PROVIDER_TAXONOMY } from "@/content/taxonomy";
import { PROVIDER_LABEL, PROVIDER_ORDER, providerLabel } from "@/lib/providers";
import { OFFLINE_EXPLANATION } from "@/lib/serverHealth";
import { color } from "@/lib/graph-theme";
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
  const catalog = useModelCatalog({ provider, model, onModelChange, graphId });
  const catalogProvider = catalog.enabled;
  const modelOptions = catalog.options;
  const modelCatalogMessage = catalog.message;
  const modelCatalogLoading = catalog.loading;

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


/** Shown beside a stub run when no shared store is configured (see `isOfflineRun`). */
export function OfflineBadge() {
  return (
    <span
      title={OFFLINE_EXPLANATION}
      aria-label={OFFLINE_EXPLANATION}
      role="note"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 18,
        padding: "0 6px",
        borderRadius: 999,
        border: `1px solid ${color.warning[500]}`,
        color: color.warning[500],
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      Offline
    </span>
  );
}

export { providerLabel };

export const PROVIDER_OPTIONS: ComboboxOption[] = PROVIDER_ORDER.map((value) => ({
  value,
  label: PROVIDER_LABEL[value],
  description: PROVIDER_TAXONOMY[value]?.summary,
  icon: <ProviderDot provider={value} />,
  group: value === "stub" || value === "ollama" ? "Local" : "Hosted",
}));
