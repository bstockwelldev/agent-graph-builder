"use client";

import { useEffect, useState } from "react";
import type { AgentProfile, GraphSummary, LlmProfile, PromptTemplate, ToolDefinition } from "@bstockwelldev/agent-graph-sdk";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { client } from "@/lib/api-client";
import { BUILTIN_TOOL_IDS } from "@/lib/builtinTools";

import { FieldLabel } from "./resource-fields";

const NONE = "__none__";

type Options = { graphs: GraphSummary[]; profiles: LlmProfile[]; prompts: PromptTemplate[]; tools: ToolDefinition[] };

function useAgentOptions(): Options | null {
  const [options, setOptions] = useState<Options | null>(null);
  useEffect(() => {
    let cancelled = false;
    const safe = <T,>(load: () => Promise<readonly T[]>) => Promise.resolve().then(load).then((items) => [...items], () => [] as T[]);
    void Promise.all([
      safe(() => client.graphs.summaries.list()),
      safe(() => client.llmProfiles.list()),
      safe(() => client.prompts.list()),
      safe(() => client.tools.list()),
    ]).then(([graphs, profiles, prompts, tools]) => {
      if (!cancelled) setOptions({ graphs, profiles, prompts, tools });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}

export function Picker({
  id,
  label,
  hint,
  value,
  onChange,
  options,
  noneLabel,
  loading,
  required = false,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
  /** Offer "none" (optional fields); omit for a required pick. */
  noneLabel?: string;
  loading: boolean;
  required?: boolean;
}) {
  const items = noneLabel ? [{ value: NONE, label: noneLabel }, ...options] : options;
  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <Select value={value || (noneLabel ? NONE : "")} onValueChange={(next) => onChange(!next || next === NONE ? null : String(next))}>
        <SelectTrigger id={id} className="w-full" aria-label={label} aria-required={required || undefined}>
          <SelectValue placeholder={loading ? "Loading…" : `Choose ${label.toLowerCase()}`}>
            {(current: string) => items.find((item) => item.value === current)?.label ?? current}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

/** The agent form's pickers: graph, LLM profile, system prompt, and the tool allow-list. */
export function AgentFields({
  form,
  setForm,
  idPrefix,
}: {
  form: Partial<AgentProfile>;
  setForm: (patch: Partial<AgentProfile>) => void;
  idPrefix: string;
}) {
  const options = useAgentOptions();
  const loading = options === null;
  const toolIds = form.tool_ids ?? [];
  const allTools = [
    ...BUILTIN_TOOL_IDS.map((tool) => ({ id: tool.id, description: tool.description })),
    ...(options?.tools ?? []).filter((tool) => !BUILTIN_TOOL_IDS.some((builtin) => builtin.id === tool.id)),
  ];
  const toggleTool = (id: string, checked: boolean) =>
    setForm({ tool_ids: checked ? [...new Set([...toolIds, id])] : toolIds.filter((tool) => tool !== id) });

  return (
    <>
      <Picker
        id={`${idPrefix}-graph`}
        label="Graph"
        hint="The graph this agent runs."
        required
        value={form.graph_id}
        onChange={(graph_id) => setForm({ graph_id: graph_id ?? "" })}
        options={(options?.graphs ?? []).map((graph) => ({ value: graph.id, label: graph.name }))}
        loading={loading}
      />
      <Picker
        id={`${idPrefix}-profile`}
        label="LLM profile"
        hint="The run's default provider and model. A provider or model chosen at run time still wins."
        value={form.llm_profile_id}
        onChange={(llm_profile_id) => setForm({ llm_profile_id })}
        options={(options?.profiles ?? []).map((profile) => ({ value: profile.id, label: profile.name }))}
        noneLabel="Graph's own models"
        loading={loading}
      />
      <Picker
        id={`${idPrefix}-prompt`}
        label="System prompt"
        hint="Prepended to every LLM node's system prompt."
        value={form.system_prompt_id}
        onChange={(system_prompt_id) => setForm({ system_prompt_id })}
        options={(options?.prompts ?? []).map((prompt) => ({ value: prompt.id, label: prompt.name }))}
        noneLabel="None"
        loading={loading}
      />
      <div className="space-y-1.5">
        <FieldLabel htmlFor={`${idPrefix}-instructions`}>System instructions</FieldLabel>
        <Textarea
          id={`${idPrefix}-instructions`}
          value={form.system_instructions ?? ""}
          onChange={(event) => setForm({ system_instructions: event.target.value })}
          rows={3}
          placeholder="Optional. Added after the system prompt."
        />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Allowed tools</legend>
        <p className="text-muted-foreground text-xs">
          {toolIds.length === 0 ? "None selected: the graph may call any tool." : "The run is refused if the graph calls any other tool."}
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {allTools.map((tool) => (
            <label key={tool.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="border-input mt-0.5 size-4 rounded border"
                checked={toolIds.includes(tool.id)}
                onChange={(event) => toggleTool(tool.id, event.target.checked)}
              />
              <span>
                <span className="font-mono">{tool.id}</span>
                {tool.description ? <span className="text-muted-foreground block text-xs">{tool.description}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
