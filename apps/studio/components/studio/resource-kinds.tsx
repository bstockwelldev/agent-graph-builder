"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type {
  AgentProfile,
  LlmProfile,
  PromptTemplate,
  ResourceUsage,
  ResourceVersionIndexEntry,
  TransformDefinition,
} from "@bstockwelldev/agent-graph-sdk";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { client } from "@/lib/api-client";
import { BUILTIN_TOOL_IDS } from "@/lib/builtinTools";
import { isChatProvider } from "@/lib/providers";
import { fixturesFromText, fixturesTextIssue, fixturesToText, routingLabHref } from "@/lib/datasets";
import { DEFAULT_SCORERS, suiteScorerKinds } from "@/lib/evals";

import { AgentFields } from "./agent-fields";
import { DatasetFields, type DatasetForm } from "./dataset-fields";
import { EvalSuiteFields, thresholdFromText, type EvalSuiteForm } from "./eval-suite-fields";
import { HeadersField, McpDiscoverySection, TransportField, headerIssues, headersUpdate, type McpServerForm } from "./mcp-server-fields";
import { ToolSourceFields, toolSource, type ToolForm } from "./tool-source-fields";
import { ProviderModelFields } from "./provider-model-fields";
import { AreaField, CheckField, FieldLabel, NameIdFields, ReadOnlyId, TextField, idIssue } from "./resource-fields";

/**
 * One config per resource registry (studio-graph-workbench-redesign-plan.md,
 * Wave 4b / STO-605). It drives both the full page (`ResourcePage`) and the
 * workbench panel (`ResourceBrowserPanel`) through one shared editor
 * (`ResourceEditorDialog`) -- replacing five hand-copied page shells plus a
 * second copy of every form that used to live in
 * components/workbench/resourceFormConfigs.tsx.
 *
 * Copy (titles, descriptions, empty/delete text, card content) is each
 * page's existing wording, moved here verbatim.
 */
export type ResourceKindId = "prompts" | "tools" | "agents" | "mcp" | "llmProfiles" | "transforms" | "datasets" | "evalSuites";

export type ResourceLike = { id: string };

export type ResourceKindClient<T> = {
  list: () => Promise<T[]>;
  create: (resource: T) => Promise<T>;
  update: (resource: T) => Promise<T>;
  delete: (id: string) => Promise<{ deleted: boolean }>;
  usages?: (id: string) => Promise<ResourceUsage[]>;
  versions?: {
    publish: (resourceId: string) => Promise<{ created: boolean }>;
    list: (resourceId: string) => Promise<ResourceVersionIndexEntry[]>;
  };
};

export type ResourceFieldsProps<T> = {
  form: Partial<T>;
  setForm: (patch: Partial<T>) => void;
  editing: T | null;
  /** Unique per editor instance (useId), so a page and a panel editor can
   * share a screen without duplicate DOM ids. */
  idPrefix: string;
};

export type ResourceKindConfig<T extends ResourceLike> = {
  id: ResourceKindId;
  /** The workbench panel that browses this registry (components/workbench/panels.ts). */
  panelId: ResourceKindId;
  client: ResourceKindClient<T>;
  /** Singular, for "New …" / "Edit …" / "Delete …": "prompt", "MCP server". */
  noun: string;
  /** Plural, for the panel header: "Prompts", "MCP Servers". */
  panelTitle: string;
  dialogDescription: ReactNode;
  emptyText: string;
  /** How an item is named in labels (tools are named by id). */
  itemLabel: (item: T) => string;
  deleteDescription: (item: T) => string;
  /** Optional compact line under an item in the workbench panel: links and key facts. */
  renderPanelDetail?: (item: T) => ReactNode;
  emptyForm: () => Partial<T>;
  /** Editor state for an existing item (defaults to the item itself). */
  toForm?: (item: T) => Partial<T>;
  /** What stops `form` from saving, in words ("Add a name."); the editor
   * lists them beside the disabled Save (plan C6). Empty = savable. */
  issues: (form: Partial<T>) => string[];
  /** Trims `form` into a savable resource, or null while `issues` is non-empty. */
  normalize: (form: Partial<T>) => T | null;
  renderFields: (props: ResourceFieldsProps<T>) => ReactNode;
  /** Saves what lives beside the resource once it exists (an MCP server's
   * write-only headers); a failure shows as the save error. */
  afterSave?: (saved: T, form: Partial<T>) => Promise<void>;
};

/** Registry configs are heterogeneous in T; consumers only see this erased shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyResourceKind = ResourceKindConfig<any>;

function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

/** "Add a name." for each blank required field, plus an id check. */
function missing(form: Record<string, unknown>, required: [field: string, message: string][]): string[] {
  const issues = required.filter(([field]) => !String(form[field] ?? "").trim()).map(([, message]) => message);
  const bad = idIssue(form.id as string | undefined);
  return bad ? [...issues, bad] : issues;
}

/** Name + id fields for kinds with a name (C1). */
function nameIdFields<T extends ResourceLike & { name?: string | null }>(props: ResourceFieldsProps<T>, fallback: string) {
  return (
    <NameIdFields
      idPrefix={props.idPrefix}
      name={props.form.name ?? ""}
      id={props.form.id ?? ""}
      editing={Boolean(props.editing)}
      fallback={fallback}
      onChange={(patch) => props.setForm(patch as Partial<T>)}
    />
  );
}

const panelLinkClass = "text-primary text-xs font-medium underline-offset-4 hover:underline";

// ---------------------------------------------------------------- prompts

export const promptKind: ResourceKindConfig<PromptTemplate> = {
  id: "prompts",
  panelId: "prompts",
  client: client.prompts,
  noun: "prompt",
  panelTitle: "Prompts",
  dialogDescription: "Prompt and LLM nodes bind a prompt by its id. Use {variable} placeholders for run inputs.",
  emptyText: "No prompt templates.",
  itemLabel: (prompt) => prompt.name,
  deleteDescription: (prompt) => `Remove "${prompt.name}" (${prompt.id})?`,
  emptyForm: () => ({ id: genId("prompt"), name: "", body: "" }),
  issues: (form) => missing(form, [["name", "Add a name."], ["body", "Add a body."]]),
  normalize: (form) => {
    if (promptKind.issues(form).length > 0) return null;
    return { id: form.id!.trim(), name: form.name!.trim(), body: form.body!.trim() };
  },
  renderFields: (props) => (
    <>
      {nameIdFields(props, "prompt")}
      <AreaField id={`${props.idPrefix}-body`} label="Body" value={props.form.body ?? ""} onChange={(body) => props.setForm({ body })} rows={10} mono required />
    </>
  ),
};

// ------------------------------------------------------------------ tools

/** Why `raw` isn't a usable parameters schema, or null (plan C4): it must
 * parse as JSON, and be an object. Blank means `{}`. */
export function parametersJsonIssue(raw: string | undefined): string | null {
  const text = (raw ?? "").trim() || "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return `Parameters aren't valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? null : "Parameters must be a JSON object, e.g. {\"type\": \"object\"}.";
}

/** Compacted JSON; blank means `{}`. Call only once `parametersJsonIssue` is null. */
export function normalizeParametersJson(raw: string | undefined): string {
  return JSON.stringify(JSON.parse((raw ?? "").trim() || "{}"));
}

export const toolKind: ResourceKindConfig<ToolForm> = {
  id: "tools",
  panelId: "tools",
  client: client.tools,
  noun: "tool",
  panelTitle: "Tools",
  dialogDescription: "A tool node calls a tool by its name. Built-in tools (lookup_topic, web_search, calculator) need no entry here.",
  emptyText: "No tools configured.",
  itemLabel: (tool) => tool.id,
  deleteDescription: (tool) => `Remove tool "${tool.id}"? Graph nodes may reference it.`,
  emptyForm: () => ({ id: "", description: "", parameters_json: "{}", requires_approval: false }),
  toForm: (tool) => ({ ...tool, parameters_json: tool.parameters_json || "{}" }),
  issues: (form) => {
    const issues = [];
    const id = form.id?.trim() ?? "";
    if (!id) issues.push("Add a tool name.");
    else if (idIssue(id)) issues.push("Tool names use letters, digits, _ . and - only.");
    else if (BUILTIN_TOOL_IDS.some((tool) => tool.id === id)) issues.push(`${id} is a built-in tool; pick another name.`);
    if (!form.description?.trim()) issues.push("Add a description.");
    if (toolSource(form) === "mcp") {
      if (!form.mcp_server_id) issues.push("Pick an MCP server.");
      else if (!form.mcp_tool_name?.trim()) issues.push("Pick the server's tool.");
    }
    const params = parametersJsonIssue(form.parameters_json);
    if (params) issues.push(params);
    return issues;
  },
  normalize: (form) => {
    if (toolKind.issues(form).length > 0) return null;
    const mcp = toolSource(form) === "mcp";
    return {
      id: form.id!.trim(),
      description: form.description!.trim(),
      parameters_json: normalizeParametersJson(form.parameters_json),
      requires_approval: form.requires_approval ?? false,
      mcp_server_id: mcp ? form.mcp_server_id! : null,
      mcp_tool_name: mcp ? form.mcp_tool_name!.trim() : null,
    };
  },
  renderFields: (props) => (
    <>
      {props.editing ? (
        <ReadOnlyId id={props.editing.id} label="Tool name" />
      ) : (
        <TextField
          id={`${props.idPrefix}-id`}
          label="Tool name"
          value={props.form.id ?? ""}
          onChange={(id) => props.setForm({ id })}
          mono
          required
          autoFocus
          hint="What a tool node calls. It can't change after you save."
          error={
            props.form.id?.trim() && idIssue(props.form.id)
              ? "Use letters, digits, _ . and - only."
              : BUILTIN_TOOL_IDS.some((tool) => tool.id === props.form.id?.trim())
                ? "That's a built-in tool; pick another name."
                : null
          }
        />
      )}
      <AreaField
        id={`${props.idPrefix}-desc`}
        label="Description"
        value={props.form.description ?? ""}
        onChange={(description) => props.setForm({ description })}
        rows={2}
        required
      />
      <ToolSourceFields
        idPrefix={props.idPrefix}
        form={props.form}
        setForm={props.setForm}
        parametersError={parametersJsonIssue(props.form.parameters_json)}
      />
      <CheckField
        id={`${props.idPrefix}-approval`}
        label="Requires human approval in Run"
        checked={props.form.requires_approval ?? false}
        onChange={(requires_approval) => props.setForm({ requires_approval })}
      />
    </>
  ),
};

// ----------------------------------------------------------------- agents

export const agentKind: ResourceKindConfig<AgentProfile> = {
  id: "agents",
  panelId: "agents",
  client: client.agents,
  noun: "agent",
  panelTitle: "Agents",
  dialogDescription: "Pick the graph this agent runs and what it layers on top: a default model, instructions, and the tools it may call.",
  emptyText: "No agents.",
  itemLabel: (agent) => agent.name,
  deleteDescription: (agent) => `Remove agent "${agent.name}"?`,
  renderPanelDetail: (agent) => (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="text-muted-foreground font-mono text-[11px]">{agent.graph_id}</span>
      <Link href={`/graphs/${encodeURIComponent(agent.graph_id)}?panel=run&agent=${encodeURIComponent(agent.id)}`} className={panelLinkClass} aria-label={`Run ${agent.name}`}>
        Run
      </Link>
    </div>
  ),
  emptyForm: () => ({
    id: genId("agent"),
    name: "",
    description: "",
    graph_id: "",
    llm_profile_id: null,
    system_prompt_id: null,
    system_instructions: "",
    tool_ids: [],
  }),
  issues: (form) => missing(form, [["name", "Add a name."], ["graph_id", "Pick a graph."]]),
  normalize: (form) => {
    if (agentKind.issues(form).length > 0) return null;
    return {
      id: form.id!.trim(),
      name: form.name!.trim(),
      description: form.description?.trim() || null,
      graph_id: form.graph_id!.trim(),
      llm_profile_id: form.llm_profile_id || null,
      system_prompt_id: form.system_prompt_id || null,
      system_instructions: form.system_instructions?.trim() || null,
      tool_ids: [...new Set(form.tool_ids ?? [])],
    };
  },
  renderFields: (props) => (
    <>
      {nameIdFields(props, "agent")}
      <AreaField id={`${props.idPrefix}-description`} label="Description" value={props.form.description ?? ""} onChange={(description) => props.setForm({ description })} rows={2} />
      <AgentFields form={props.form} setForm={props.setForm} idPrefix={props.idPrefix} />
    </>
  ),
};

// -------------------------------------------------------------------- mcp

function urlIssue(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? null : "The URL must start with http:// or https://.";
  } catch {
    return "Enter a full URL, e.g. https://example.com/mcp.";
  }
}

export const mcpKind: ResourceKindConfig<McpServerForm> = {
  id: "mcp",
  panelId: "mcp",
  client: client.mcpServers,
  noun: "MCP server",
  panelTitle: "MCP Servers",
  dialogDescription: "A remote tool server. Add its tools to the registry from Test connection, or bind one from a tool's MCP source.",
  emptyText: "No MCP servers configured.",
  itemLabel: (server) => server.name,
  deleteDescription: (server) => `Remove MCP server "${server.name}"?`,
  emptyForm: () => ({ id: genId("mcp"), name: "", url: "", transport: "http", enabled: true }),
  issues: (form) => {
    const issues = missing(form, [["name", "Add a name."], ["url", "Add the server URL."]]);
    const url = form.url?.trim();
    if (url && urlIssue(url)) issues.push(urlIssue(url)!);
    return [...issues, ...headerIssues(form._headers)];
  },
  normalize: (form) => {
    if (mcpKind.issues(form).length > 0) return null;
    return { id: form.id!.trim(), name: form.name!.trim(), url: form.url!.trim(), transport: form.transport ?? "http", enabled: form.enabled ?? true };
  },
  renderFields: (props) => (
    <>
      {nameIdFields(props, "mcp")}
      <TextField
        id={`${props.idPrefix}-url`}
        label="URL"
        value={props.form.url ?? ""}
        onChange={(url) => props.setForm({ url })}
        mono
        required
        placeholder="https://example.com/mcp"
        error={props.form.url?.trim() ? urlIssue(props.form.url.trim()) : null}
      />
      <TransportField id={`${props.idPrefix}-transport`} value={props.form.transport ?? "http"} onChange={(transport) => props.setForm({ transport })} />
      <CheckField id={`${props.idPrefix}-enabled`} label="Enabled" checked={props.form.enabled ?? true} onChange={(enabled) => props.setForm({ enabled })} />
      <HeadersField
        idPrefix={props.idPrefix}
        serverId={props.editing?.id ?? null}
        rows={props.form._headers}
        onLoad={(_headers) => props.setForm({ _headers })}
        onChange={(_headers) => props.setForm({ _headers, _headersEdited: true })}
      />
      {props.editing ? <McpDiscoverySection server={props.editing} /> : null}
    </>
  ),
  // Headers are write-only secrets stored beside the server (backend
  // mcp/secrets.py), so they save through their own endpoint.
  afterSave: async (saved, form) => {
    if (!form._headersEdited || form._headers === undefined) return;
    await client.mcpServers.headers.update(saved.id, headersUpdate(form._headers));
  },
};

// ----------------------------------------------------------- llm profiles

export const llmProfileKind: ResourceKindConfig<LlmProfile> = {
  id: "llmProfiles",
  panelId: "llmProfiles",
  client: client.llmProfiles,
  noun: "LLM profile",
  panelTitle: "LLM Profiles",
  dialogDescription: "A named provider + model. A node or agent bound to it runs on this model.",
  emptyText: "No LLM profiles.",
  itemLabel: (profile) => profile.name,
  deleteDescription: (profile) => `Remove LLM profile "${profile.name}"?`,
  emptyForm: () => ({ id: genId("llm"), name: "", model: "", model_provider: "stub", description: "" }),
  issues: (form) => {
    const issues = missing(form, [["name", "Add a name."], ["model", "Pick a model."]]);
    if (!isChatProvider(form.model_provider)) issues.push("Pick a provider.");
    return issues;
  },
  normalize: (form) => {
    if (llmProfileKind.issues(form).length > 0) return null;
    return {
      id: form.id!.trim(),
      name: form.name!.trim(),
      model: form.model!.trim(),
      model_provider: form.model_provider!,
      description: form.description?.trim() || null,
    };
  },
  renderFields: (props) => (
    <>
      {nameIdFields(props, "llm")}
      <ProviderModelFields
        idPrefix={props.idPrefix}
        provider={props.form.model_provider}
        model={props.form.model ?? ""}
        onProviderChange={(model_provider) => props.setForm({ model_provider, model: "" })}
        onModelChange={(model) => props.setForm({ model })}
      />
      <AreaField id={`${props.idPrefix}-description`} label="Description" value={props.form.description ?? ""} onChange={(description) => props.setForm({ description })} rows={2} />
    </>
  ),
};

// ------------------------------------------------------------- transforms

const TRANSFORM_TYPES: { value: TransformDefinition["type"]; label: string; field: "pointer" | "field" | "template" | "target_type" }[] = [
  { value: "select", label: "Select a field", field: "pointer" },
  { value: "wrap", label: "Wrap under a field", field: "field" },
  { value: "format_message", label: "Format a message", field: "template" },
  { value: "coerce", label: "Convert type", field: "target_type" },
];
const TARGET_TYPES = ["string", "number", "boolean"] as const;
const TRANSFORM_FIELD_ISSUE = {
  pointer: "Add the field path.",
  field: "Add the field name.",
  template: "Add the message template.",
  target_type: "Pick a type to convert to.",
} as const;

export const transformKind: ResourceKindConfig<TransformDefinition> = {
  id: "transforms",
  panelId: "transforms",
  client: client.transforms,
  noun: "transform",
  panelTitle: "Transforms",
  dialogDescription: "A named transform. No code and no model call: a transform that can't apply fails the step.",
  emptyText: "No transforms.",
  itemLabel: (transform) => transform.name,
  deleteDescription: (transform) => `Remove transform "${transform.name}"? Edges and nodes that use it will fail validation.`,
  emptyForm: () => ({ id: genId("tf"), name: "", type: "format_message", template: "{value}", description: "" }),
  issues: (form) => {
    const issues = missing(form, [["name", "Add a name."]]);
    const spec = TRANSFORM_TYPES.find((option) => option.value === form.type);
    if (!spec) issues.push("Pick a transform type.");
    else if (!String(form[spec.field] ?? "").trim()) issues.push(TRANSFORM_FIELD_ISSUE[spec.field]);
    return issues;
  },
  normalize: (form) => {
    const spec = TRANSFORM_TYPES.find((option) => option.value === form.type);
    if (transformKind.issues(form).length > 0 || !spec) return null;
    const value = String(form[spec.field]);
    return {
      id: form.id!.trim(),
      name: form.name!.trim(),
      description: form.description?.trim() || null,
      type: spec.value,
      [spec.field]: spec.field === "template" ? value : value.trim(),
    } as TransformDefinition;
  },
  renderFields: (props) => {
    const type = props.form.type ?? "format_message";
    return (
      <>
        {nameIdFields(props, "tf")}
        <div className="space-y-1.5">
          <FieldLabel htmlFor={`${props.idPrefix}-type`} required>
            Transform
          </FieldLabel>
          <Select value={type} onValueChange={(value) => props.setForm({ type: value as TransformDefinition["type"] })}>
            <SelectTrigger id={`${props.idPrefix}-type`} className="w-full">
              <SelectValue>{(value: string) => TRANSFORM_TYPES.find((option) => option.value === value)?.label ?? value}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TRANSFORM_TYPES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {type === "select" && (
          <TextField
            id={`${props.idPrefix}-pointer`}
            label="Field path (JSON Pointer)"
            required
            value={props.form.pointer ?? ""}
            onChange={(pointer) => props.setForm({ pointer })}
            placeholder="/answer"
            mono
          />
        )}
        {type === "wrap" && (
          <TextField id={`${props.idPrefix}-field`} label="Field name" value={props.form.field ?? ""} onChange={(field) => props.setForm({ field })} placeholder="topic" mono required />
        )}
        {type === "format_message" && (
          <AreaField
            id={`${props.idPrefix}-template`}
            label="Message template ({value}, {value.field})"
            required
            value={props.form.template ?? ""}
            onChange={(template) => props.setForm({ template })}
            rows={3}
          />
        )}
        {type === "coerce" && (
          <div className="space-y-1.5">
            <FieldLabel htmlFor={`${props.idPrefix}-target`} required>
              Convert to
            </FieldLabel>
            <Select value={props.form.target_type ?? ""} onValueChange={(value) => props.setForm({ target_type: value as TransformDefinition["target_type"] })}>
              <SelectTrigger id={`${props.idPrefix}-target`} className="w-full">
                <SelectValue placeholder="Pick a type" />
              </SelectTrigger>
              <SelectContent>
                {TARGET_TYPES.map((target) => (
                  <SelectItem key={target} value={target}>
                    {target}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <AreaField id={`${props.idPrefix}-description`} label="Description" value={props.form.description ?? ""} onChange={(description) => props.setForm({ description })} rows={2} />
      </>
    );
  },
};

/** Every CRUD registry, in nav order (studio-nav.tsx RESOURCE_ITEMS). */

/** Slice 7: saved Routing Lab datasets, browsable outside a graph panel. */
export const datasetKind: ResourceKindConfig<DatasetForm> = {
  id: "datasets",
  panelId: "datasets",
  // Datasets aren't bound by graph nodes and have no publish history, so no Usage or History tab.
  client: {
    list: () => client.datasets.list(),
    create: (dataset) => client.datasets.create(dataset),
    update: (dataset) => client.datasets.update(dataset),
    delete: (id) => client.datasets.delete(id),
  },
  noun: "dataset",
  panelTitle: "Datasets",
  dialogDescription: "Rename it, fix its fixtures, or point it at a graph. Runs stay on the offline stub provider.",
  emptyText: "No datasets. Save one from a graph's Routing Lab, or capture runs from its Run history.",
  itemLabel: (dataset) => dataset.name,
  deleteDescription: (dataset) => `Remove dataset "${dataset.name}"? Graphs don't reference datasets, so nothing else changes.`,
  renderPanelDetail: (dataset) => (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="text-muted-foreground text-[11px]">
        {dataset.fixtures.length} fixture{dataset.fixtures.length === 1 ? "" : "s"}
      </span>
      {dataset.graph_id ? (
        <Link href={routingLabHref(dataset.graph_id, dataset.id)} className={panelLinkClass} aria-label={`Open ${dataset.name} in routing lab`}>
          Open in routing lab
        </Link>
      ) : null}
    </div>
  ),
  emptyForm: () => ({ id: genId("ds"), name: "", description: "", graph_id: null, fixtures_text: "[]", source: "manual", source_run_ids: [] }),
  toForm: (dataset) => ({ ...dataset, fixtures_text: fixturesToText(dataset.fixtures) }),
  issues: (form) => {
    const issues = missing(form, [["name", "Add a name."]]);
    if (fixturesTextIssue(form.fixtures_text ?? "[]")) issues.push("Fix the fixtures JSON.");
    return issues;
  },
  normalize: (form) => {
    if (datasetKind.issues(form).length > 0) return null;
    const now = new Date().toISOString();
    // The generic CRUD route stores exactly this body, so stamp the times here.
    return {
      id: form.id!.trim(),
      name: form.name!.trim(),
      description: form.description?.trim() || null,
      graph_id: form.graph_id || null,
      fixtures: fixturesFromText(form.fixtures_text ?? "[]"),
      source: form.source ?? "manual",
      source_run_ids: form.source_run_ids ?? [],
      created_at: form.created_at ?? now,
      updated_at: now,
    };
  },
  renderFields: (props) => (
    <>
      {nameIdFields(props, "ds")}
      <AreaField
        id={`${props.idPrefix}-description`}
        label="Description"
        value={props.form.description ?? ""}
        onChange={(description) => props.setForm({ description })}
        rows={2}
      />
      <DatasetFields form={props.form} setForm={props.setForm} idPrefix={props.idPrefix} />
    </>
  ),
};

/** Scored evals: a graph, a dataset of fixtures with expectations, and scorers (backend/app/evals.py). */
export const evalSuiteKind: ResourceKindConfig<EvalSuiteForm> = {
  id: "evalSuites",
  panelId: "evalSuites",
  client: {
    list: () => client.evals.suites.list(),
    create: (suite) => client.evals.suites.create(suite),
    update: (suite) => client.evals.suites.update(suite),
    delete: (id) => client.evals.suites.delete(id),
  },
  noun: "eval suite",
  panelTitle: "Eval suites",
  dialogDescription: "Pick the graph, the dataset whose fixtures are the cases, the scorers and the pass mark.",
  emptyText: "No eval suites. Create one here or from a graph's Evals panel.",
  itemLabel: (suite) => suite.name,
  deleteDescription: (suite) => `Remove eval suite "${suite.name}"? Its stored runs stay readable by id.`,
  renderPanelDetail: (suite) => (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="text-muted-foreground font-mono text-[11px]">{suite.graph_id}</span>
      <Link href={`/graphs/${encodeURIComponent(suite.graph_id)}?panel=evals&suite=${encodeURIComponent(suite.id)}`} className={panelLinkClass} aria-label={`Run ${suite.name}`}>
        Run in the graph&apos;s Evals panel
      </Link>
    </div>
  ),
  emptyForm: () => ({
    id: genId("eval"),
    name: "",
    description: "",
    graph_id: "",
    dataset_id: "",
    scorers: DEFAULT_SCORERS.map((kind) => ({ kind, weight: 1, args: {} })),
    threshold_text: "100",
  }),
  toForm: (suite) => ({ ...suite, threshold_text: String(Math.round((suite.pass_threshold ?? 1) * 100)) }),
  issues: (form) => {
    const issues = missing(form, [
      ["name", "Add a name."],
      ["graph_id", "Pick a graph."],
      ["dataset_id", "Pick a dataset."],
    ]);
    if (suiteScorerKinds({ scorers: form.scorers }).length === 0) issues.push("Pick at least one scorer.");
    if (thresholdFromText(form.threshold_text) === null) issues.push("Set a pass mark from 0 to 100.");
    return issues;
  },
  normalize: (form) => {
    if (evalSuiteKind.issues(form).length > 0) return null;
    const now = new Date().toISOString();
    return {
      id: form.id!.trim(),
      name: form.name!.trim(),
      description: form.description?.trim() || null,
      graph_id: form.graph_id!,
      dataset_id: form.dataset_id!,
      scorers: form.scorers ?? [],
      pass_threshold: thresholdFromText(form.threshold_text)!,
      created_at: form.created_at ?? now,
      updated_at: now,
    };
  },
  renderFields: (props) => (
    <>
      {nameIdFields(props, "eval")}
      <AreaField
        id={`${props.idPrefix}-description`}
        label="Description"
        value={props.form.description ?? ""}
        onChange={(description) => props.setForm({ description })}
        rows={2}
      />
      <EvalSuiteFields form={props.form} setForm={props.setForm} idPrefix={props.idPrefix} />
    </>
  ),
};

export const RESOURCE_KINDS: readonly AnyResourceKind[] = [agentKind, promptKind, toolKind, mcpKind, llmProfileKind, transformKind, datasetKind, evalSuiteKind];
