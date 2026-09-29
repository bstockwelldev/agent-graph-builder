"use client";

import type { ChatProvider } from "@bstockwelldev/agent-graph-sdk";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVIDER_TAXONOMY } from "@/content/taxonomy";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { PROVIDER_ORDER, isChatProvider, providerLabel } from "@/lib/providers";

import { FieldLabel } from "./resource-fields";

/**
 * Provider + model for the LLM-profile form (plan C2/C3/C5): the provider is
 * a select over the chat providers, and the model offers the same catalog the
 * canvas's ProviderModelPicker loads (a custom id can still be typed).
 */
export function ProviderModelFields({
  provider,
  model,
  onProviderChange,
  onModelChange,
  idPrefix,
}: {
  provider: string | null | undefined;
  model: string;
  onProviderChange: (provider: ChatProvider) => void;
  onModelChange: (model: string) => void;
  idPrefix: string;
}) {
  const current = isChatProvider(provider) ? provider : null;
  const catalog = useModelCatalog({ provider: current, model, onModelChange, replaceUnknown: false });
  const listId = `${idPrefix}-models`;
  const hint = current ? (catalog.message || PROVIDER_TAXONOMY[current]?.summary) : undefined;

  return (
    <>
      <div className="space-y-1.5">
        <FieldLabel htmlFor={`${idPrefix}-provider`} required>
          Provider
        </FieldLabel>
        <Select value={current ?? ""} onValueChange={(next) => isChatProvider(next) && onProviderChange(next)}>
          <SelectTrigger id={`${idPrefix}-provider`} className="w-full" aria-label="Provider" aria-required>
            <SelectValue placeholder="Choose a provider">{(value: string) => providerLabel(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_ORDER.map((value) => (
              <SelectItem key={value} value={value}>
                {providerLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {provider && !current ? <p className="text-destructive text-xs">Stored provider &quot;{provider}&quot; isn&apos;t one the API runs; pick one.</p> : null}
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor={`${idPrefix}-model`} required>
          Model
        </FieldLabel>
        <Input
          id={`${idPrefix}-model`}
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
          list={catalog.options.length > 0 ? listId : undefined}
          className="font-mono text-sm"
          autoComplete="off"
          aria-required
          placeholder={catalog.loading ? "Loading models…" : current === "stub" ? "stub" : "Model id"}
        />
        {catalog.options.length > 0 ? (
          <datalist id={listId}>
            {catalog.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label !== option.id ? option.label : null}
              </option>
            ))}
          </datalist>
        ) : null}
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
    </>
  );
}
