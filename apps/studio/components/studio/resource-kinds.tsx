"use client";

import type { ReactNode } from "react";
import type {
  AgentProfile,
  LlmProfile,
  McpServerConfig,
  PromptTemplate,
  ResourceUsage,
  ResourceVersionIndexEntry,
  ToolDefinition,
} from "@bstockwelldev/agent-graph-sdk";

import { Badge } from "@/components/ui/badge";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";

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
export type ResourceKindId = "prompts" | "tools" | "agents" | "mcp" | "llmProfiles";

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
  routeHref: string;
  client: ResourceKindClient<T>;
  /** Singular, for "New …" / "Edit …" / "Delete …": "prompt", "MCP server". */
  noun: string;
  /** Plural, for the panel header: "Prompts", "MCP Servers". */
  panelTitle: string;
  pageTitle: string;
  pageDescription: string;
  dialogDescription: ReactNode;
  emptyText: string;
  listLayout: "stack" | "grid";
  /** How an item is named in labels (tools are named by id). */
  itemLabel: (item: T) => string;
  deleteDescription: (item: T) => string;
  /** Card header content below the title row (title, badges, description). */
  renderCardHeader: (item: T) => ReactNode;
  /** Optional card body under the actions (a prompt's body, a tool's params). */
  renderCardBody?: (item: T) => ReactNode;
  emptyForm: () => Partial<T>;
  /** Editor state for an existing item (defaults to the item itself). */
  toForm?: (item: T) => Partial<T>;
  /** Trims/validates `form` into a savable resource, or null when required
   * fields are missing (doubles as the Save button's enabled gate). */
  normalize: (form: Partial<T>) => T | null;
  renderFields: (props: ResourceFieldsProps<T>) => ReactNode;
};

/** Registry configs are heterogeneous in T; consumers only see this erased shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyResourceKind = ResourceKindConfig<any>;

function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function IdField<T extends ResourceLike>({ form, setForm, editing, idPrefix, mono = true }: ResourceFieldsProps<T> & { mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-id`}>Id</Label>
      <Input
        id={`${idPrefix}-id`}
        value={form.id ?? ""}
        onChange={(event) => setForm({ id: event.target.value } as Partial<T>)}
        disabled={Boolean(editing)}
        className={cn(mono && "font-mono text-sm", editing && "opacity-80")}
        autoComplete="off"
      />
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  mono = false,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(mono && "font-mono text-sm")}
        autoComplete="off"
        placeholder={placeholder}
      />
    </div>
  );
}

function AreaField({
  id,
  label,
  value,
  onChange,
  rows,
  mono = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className={cn(mono && "font-mono text-xs")} />
    </div>
  );
}

function CheckField({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="border-input size-4 rounded border"
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

const preClass =
  "bg-surface-container-lowest/90 overflow-auto rounded-lg font-mono whitespace-pre-wrap ring-1 ring-outline-variant/20";

// ---------------------------------------------------------------- prompts

export const promptKind: ResourceKindConfig<PromptTemplate> = {
  id: "prompts",
  panelId: "prompts",
  routeHref: "/prompts",
  client: client.prompts,
  noun: "prompt",
  panelTitle: "Prompts",
  pageTitle: "Prompt Lab",
  pageDescription: "Prompt templates a graph's prompt/llm nodes can reference by id.",
  dialogDescription: "Graph nodes reference prompts by id. Changing id may break existing refs.",
  emptyText: "No prompt templates.",
  listLayout: "stack",
  itemLabel: (prompt) => prompt.name,
  deleteDescription: (prompt) => `Remove "${prompt.name}" (${prompt.id})?`,
  renderCardHeader: (prompt) => (
    <>
      <CardTitle className="text-base">{prompt.name}</CardTitle>
      <CardDescription className="font-mono text-xs">{prompt.id}</CardDescription>
    </>
  ),
  renderCardBody: (prompt) => <pre className={cn(preClass, "max-h-48 p-3 text-xs")}>{prompt.body}</pre>,
  emptyForm: () => ({ id: genId("prompt"), name: "", body: "" }),
  normalize: (form) => {
    const id = form.id?.trim();
    const name = form.name?.trim();
    const body = form.body?.trim();
    if (!id || !name || !body) return null;
    return { id, name, body };
  },
  renderFields: (props) => (
    <>
      <IdField {...props} mono={false} />
      <TextField id={`${props.idPrefix}-name`} label="Name" value={props.form.name ?? ""} onChange={(name) => props.setForm({ name })} />
      <AreaField id={`${props.idPrefix}-body`} label="Body" value={props.form.body ?? ""} onChange={(body) => props.setForm({ body })} rows={10} mono />
    </>
  ),
};

// ------------------------------------------------------------------ tools

/** Lenient: valid JSON is compacted; invalid JSON is stored as typed rather than blocking save. */
export function normalizeParametersJson(raw: string | undefined): string {
  const text = (raw ?? "{}").trim() || "{}";
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

export const toolKind: ResourceKindConfig<ToolDefinition> = {
  id: "tools",
  panelId: "tools",
  routeHref: "/tools",
  client: client.tools,
  noun: "tool",
  panelTitle: "Tools",
  pageTitle: "Tool registry",
  pageDescription: "Catalog definitions exposed to graphs. Tool nodes bind to a registry entry by id.",
  dialogDescription: "Id matches the tool name a `tool` node's config references.",
  emptyText: "No tools configured.",
  listLayout: "grid",
  itemLabel: (tool) => tool.id,
  deleteDescription: (tool) => `Remove tool "${tool.id}"? Graph nodes may reference it.`,
  renderCardHeader: (tool) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle className="font-mono text-base">{tool.id}</CardTitle>
        {tool.requires_approval ? <Badge variant="outline">Approval</Badge> : null}
        {tool.mcp_server_id ? <Badge variant="outline">MCP</Badge> : null}
      </div>
      <CardDescription>{tool.description}</CardDescription>
    </>
  ),
  renderCardBody: (tool) => <pre className={cn(preClass, "max-h-36 p-2 text-[11px]")}>{tool.parameters_json}</pre>,
  emptyForm: () => ({ id: genId("tool"), description: "", parameters_json: "{}", requires_approval: false }),
  toForm: (tool) => ({ ...tool, parameters_json: tool.parameters_json || "{}" }),
  normalize: (form) => {
    const id = form.id?.trim();
    const description = form.description?.trim();
    if (!id || !description) return null;
    return {
      ...(form as ToolDefinition),
      id,
      description,
      parameters_json: normalizeParametersJson(form.parameters_json),
      requires_approval: form.requires_approval ?? false,
    };
  },
  renderFields: (props) => (
    <>
      <IdField {...props} />
      <AreaField id={`${props.idPrefix}-desc`} label="Description" value={props.form.description ?? ""} onChange={(description) => props.setForm({ description })} rows={2} />
      <AreaField
        id={`${props.idPrefix}-params`}
        label="Parameters (JSON)"
        value={props.form.parameters_json ?? "{}"}
        onChange={(parameters_json) => props.setForm({ parameters_json })}
        rows={6}
        mono
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
  routeHref: "/agents",
  client: client.agents,
  noun: "agent",
  panelTitle: "Agents",
  pageTitle: "Agents",
  pageDescription: "Named profiles with a default graph, system instructions, and optional elements merged into a run.",
  dialogDescription: "A named profile a run can select to merge a default graph and system instructions.",
  emptyText: "No agent profiles.",
  listLayout: "grid",
  itemLabel: (agent) => agent.name,
  deleteDescription: (agent) => `Remove agent profile "${agent.name}"?`,
  renderCardHeader: (agent) => (
    <>
      <CardTitle className="text-base">{agent.name}</CardTitle>
      <CardDescription>
        {agent.description || agent.default_flow_id
          ? `${agent.description ?? ""}${agent.default_flow_id ? ` · default graph: ${agent.default_flow_id}` : ""}`
          : "No description."}
      </CardDescription>
    </>
  ),
  emptyForm: () => ({
    id: genId("agent"),
    name: "",
    description: "",
    default_flow_id: "",
    system_instructions: "",
    optional_elements: [],
  }),
  normalize: (form) => {
    const id = form.id?.trim();
    const name = form.name?.trim();
    if (!id || !name) return null;
    return {
      id,
      name,
      description: form.description?.trim() || null,
      default_flow_id: form.default_flow_id?.trim() || null,
      system_instructions: form.system_instructions?.trim() || null,
      optional_elements: (form.optional_elements ?? []).map((line) => line.trim()).filter(Boolean),
    };
  },
  // join/split round-trip cleanly (split(join(x)) === x), so the array
  // itself is the live form state -- no scratch string field needed.
  renderFields: (props) => (
    <>
      <IdField {...props} />
      <TextField id={`${props.idPrefix}-name`} label="Name" value={props.form.name ?? ""} onChange={(name) => props.setForm({ name })} />
      <AreaField id={`${props.idPrefix}-description`} label="Description" value={props.form.description ?? ""} onChange={(description) => props.setForm({ description })} rows={2} />
      <TextField
        id={`${props.idPrefix}-default-graph`}
        label="Default graph id"
        value={props.form.default_flow_id ?? ""}
        onChange={(default_flow_id) => props.setForm({ default_flow_id })}
        mono
      />
      <AreaField
        id={`${props.idPrefix}-system-instructions`}
        label="System instructions"
        value={props.form.system_instructions ?? ""}
        onChange={(system_instructions) => props.setForm({ system_instructions })}
        rows={4}
      />
      <AreaField
        id={`${props.idPrefix}-optional-elements`}
        label="Optional elements (one per line)"
        value={(props.form.optional_elements ?? []).join("\n")}
        onChange={(text) => props.setForm({ optional_elements: text.split("\n") })}
        rows={3}
      />
    </>
  ),
};

// -------------------------------------------------------------------- mcp

const TRANSPORTS: McpServerConfig["transport"][] = ["http", "sse", "stdio"];

export const mcpKind: ResourceKindConfig<McpServerConfig> = {
  id: "mcp",
  panelId: "mcp",
  routeHref: "/mcp",
  client: client.mcpServers,
  noun: "MCP server",
  panelTitle: "MCP Servers",
  pageTitle: "MCP servers",
  pageDescription:
    "Remote tool servers. Only http transport is currently dispatched by tool nodes; sse/stdio validate but don't execute yet.",
  dialogDescription: 'Tools bind via mcp_server_id + mcp_tool_name; the identity is "serverId.toolName".',
  emptyText: "No MCP servers configured.",
  listLayout: "grid",
  itemLabel: (server) => server.name,
  deleteDescription: (server) => `Remove MCP server "${server.name}"?`,
  renderCardHeader: (server) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle className="text-base">{server.name}</CardTitle>
        <Badge variant="outline">{server.transport}</Badge>
        {!server.enabled ? <Badge variant="outline">Disabled</Badge> : null}
      </div>
      <CardDescription className="font-mono text-xs">{server.url}</CardDescription>
    </>
  ),
  emptyForm: () => ({ id: genId("mcp"), name: "", url: "", transport: "http", enabled: true }),
  normalize: (form) => {
    const id = form.id?.trim();
    const name = form.name?.trim();
    const url = form.url?.trim();
    if (!id || !name || !url) return null;
    return { id, name, url, transport: form.transport ?? "http", enabled: form.enabled ?? true };
  },
  renderFields: (props) => (
    <>
      <IdField {...props} />
      <TextField id={`${props.idPrefix}-name`} label="Name" value={props.form.name ?? ""} onChange={(name) => props.setForm({ name })} />
      <TextField id={`${props.idPrefix}-url`} label="URL" value={props.form.url ?? ""} onChange={(url) => props.setForm({ url })} mono />
      <div className="space-y-1.5">
        <Label htmlFor={`${props.idPrefix}-transport`}>Transport</Label>
        <Select
          value={props.form.transport ?? "http"}
          onValueChange={(value) => props.setForm({ transport: value as McpServerConfig["transport"] })}
        >
          <SelectTrigger id={`${props.idPrefix}-transport`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSPORTS.map((transport) => (
              <SelectItem key={transport} value={transport}>
                {transport}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <CheckField id={`${props.idPrefix}-enabled`} label="Enabled" checked={props.form.enabled ?? true} onChange={(enabled) => props.setForm({ enabled })} />
    </>
  ),
};

// ----------------------------------------------------------- llm profiles

export const llmProfileKind: ResourceKindConfig<LlmProfile> = {
  id: "llmProfiles",
  panelId: "llmProfiles",
  routeHref: "/llm-profiles",
  client: client.llmProfiles,
  noun: "LLM profile",
  panelTitle: "LLM Profiles",
  pageTitle: "LLM profiles",
  pageDescription:
    "Named model + provider presets. Graphs and agents can reference a profile instead of hard-coding a model string.",
  dialogDescription: "A named model + provider preset.",
  emptyText: "No LLM profiles.",
  listLayout: "grid",
  itemLabel: (profile) => profile.name,
  deleteDescription: (profile) => `Remove LLM profile "${profile.name}"?`,
  renderCardHeader: (profile) => (
    <>
      <CardTitle className="text-base">{profile.name}</CardTitle>
      <CardDescription className="font-mono text-xs">
        {profile.model_provider ? `${profile.model_provider} · ` : ""}
        {profile.model}
      </CardDescription>
    </>
  ),
  emptyForm: () => ({ id: genId("llm"), name: "", model: "", model_provider: "", description: "" }),
  normalize: (form) => {
    const id = form.id?.trim();
    const name = form.name?.trim();
    const model = form.model?.trim();
    if (!id || !name || !model) return null;
    return {
      id,
      name,
      model,
      model_provider: form.model_provider?.trim() || null,
      description: form.description?.trim() || null,
    };
  },
  renderFields: (props) => (
    <>
      <IdField {...props} />
      <TextField id={`${props.idPrefix}-name`} label="Name" value={props.form.name ?? ""} onChange={(name) => props.setForm({ name })} />
      <TextField id={`${props.idPrefix}-model`} label="Model" value={props.form.model ?? ""} onChange={(model) => props.setForm({ model })} mono />
      <TextField
        id={`${props.idPrefix}-provider`}
        label="Provider"
        value={props.form.model_provider ?? ""}
        onChange={(model_provider) => props.setForm({ model_provider })}
        mono
        placeholder="stub, groq, google, azure, ollama, openai_compat"
      />
      <AreaField id={`${props.idPrefix}-description`} label="Description" value={props.form.description ?? ""} onChange={(description) => props.setForm({ description })} rows={2} />
    </>
  ),
};

/** Every CRUD registry, in nav order (studio-nav.tsx RESOURCE_ITEMS). */
export const RESOURCE_KINDS: readonly AnyResourceKind[] = [agentKind, promptKind, toolKind, mcpKind, llmProfileKind];
