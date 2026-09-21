"use client";

import type { AgentProfile, LlmProfile, McpServerConfig, PromptTemplate, ToolDefinition } from "@bstockwelldev/agent-graph-sdk";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Phase 10 Slice A follow-up (docs/planning/features/studio-shell-ux-gap-analysis.md):
// per-resource-kind field JSX + pre-save normalization, ported directly
// from each full CRUD page's own Dialog form (apps/studio/app/{agents,
// prompts,tools,mcp,llm-profiles}/page.tsx) so ResourceBrowserPanel's inline
// editor behaves identically to the page it's a shortcut for — same
// required-field validation, same JSON-textarea leniency for tools, same
// newline-joined list for agents' optional elements.

function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export const promptFormConfig = {
  emptyForm: (): Partial<PromptTemplate> => ({ id: genId("prompt"), name: "", body: "" }),
  renderFields: (
    form: Partial<PromptTemplate>,
    setForm: (patch: Partial<PromptTemplate>) => void,
    editing: PromptTemplate | null,
  ) => (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="panel-prompt-id">Id</Label>
        <Input
          id="panel-prompt-id"
          value={form.id ?? ""}
          onChange={(event) => setForm({ id: event.target.value })}
          disabled={Boolean(editing)}
          className={cn(editing && "opacity-80")}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="panel-prompt-name">Name</Label>
        <Input
          id="panel-prompt-name"
          value={form.name ?? ""}
          onChange={(event) => setForm({ name: event.target.value })}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="panel-prompt-body">Body</Label>
        <Textarea
          id="panel-prompt-body"
          value={form.body ?? ""}
          onChange={(event) => setForm({ body: event.target.value })}
          rows={8}
          className="font-mono text-xs"
        />
      </div>
    </>
  ),
  normalize: (form: Partial<PromptTemplate>): PromptTemplate | null => {
    const id = form.id?.trim();
    const name = form.name?.trim();
    const body = form.body?.trim();
    if (!id || !name || !body) return null;
    return { id, name, body };
  },
};

export const toolFormConfig = {
  emptyForm: (): Partial<ToolDefinition> => ({
    id: genId("tool"),
    description: "",
    parameters_json: "{}",
    requires_approval: false,
  }),
  renderFields: (
    form: Partial<ToolDefinition>,
    setForm: (patch: Partial<ToolDefinition>) => void,
    editing: ToolDefinition | null,
  ) => (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="panel-tool-id">Id</Label>
        <Input
          id="panel-tool-id"
          value={form.id ?? ""}
          onChange={(event) => setForm({ id: event.target.value })}
          disabled={Boolean(editing)}
          className={cn("font-mono text-sm", editing && "opacity-80")}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="panel-tool-desc">Description</Label>
        <Textarea
          id="panel-tool-desc"
          value={form.description ?? ""}
          onChange={(event) => setForm({ description: event.target.value })}
          rows={2}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="panel-tool-params">Parameters (JSON)</Label>
        <Textarea
          id="panel-tool-params"
          value={form.parameters_json ?? "{}"}
          onChange={(event) => setForm({ parameters_json: event.target.value })}
          rows={5}
          className="font-mono text-xs"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id="panel-tool-approval"
          type="checkbox"
          checked={form.requires_approval ?? false}
          onChange={(event) => setForm({ requires_approval: event.target.checked })}
          className="border-input size-4 rounded border"
        />
        <Label htmlFor="panel-tool-approval" className="font-normal">
          Requires human approval in Run
        </Label>
      </div>
    </>
  ),
  normalize: (form: Partial<ToolDefinition>): ToolDefinition | null => {
    const id = form.id?.trim();
    const description = form.description?.trim();
    if (!id || !description) return null;
    const raw = (form.parameters_json ?? "{}").trim();
    let parameters_json = raw || "{}";
    try {
      parameters_json = JSON.stringify(JSON.parse(parameters_json));
    } catch {
      // Lenient, matching tools/page.tsx's normalizeParametersJson: invalid
      // JSON is stored as raw text rather than blocking save.
    }
    return { id, description, parameters_json, requires_approval: form.requires_approval ?? false };
  },
};

export const agentFormConfig = {
  emptyForm: (): Partial<AgentProfile> => ({
    id: genId("agent"),
    name: "",
    description: "",
    default_flow_id: "",
    system_instructions: "",
    optional_elements: [],
  }),
  renderFields: (
    form: Partial<AgentProfile>,
    setForm: (patch: Partial<AgentProfile>) => void,
    editing: AgentProfile | null,
  ) => {
    // join/split round-trip cleanly for any textarea input (split(join(x))
    // === x), so the array itself can be the live form state — no scratch
    // string field needed alongside AgentProfile's actual shape.
    const optionalElementsText = (form.optional_elements ?? []).join("\n");
    return (
      <>
        <div className="space-y-1.5">
          <Label htmlFor="panel-agent-id">Id</Label>
          <Input
            id="panel-agent-id"
            value={form.id ?? ""}
            onChange={(event) => setForm({ id: event.target.value })}
            disabled={Boolean(editing)}
            className={cn("font-mono text-sm", editing && "opacity-80")}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="panel-agent-name">Name</Label>
          <Input
            id="panel-agent-name"
            value={form.name ?? ""}
            onChange={(event) => setForm({ name: event.target.value })}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="panel-agent-description">Description</Label>
          <Textarea
            id="panel-agent-description"
            value={form.description ?? ""}
            onChange={(event) => setForm({ description: event.target.value })}
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="panel-agent-default-graph">Default graph id</Label>
          <Input
            id="panel-agent-default-graph"
            value={form.default_flow_id ?? ""}
            onChange={(event) => setForm({ default_flow_id: event.target.value })}
            className="font-mono text-sm"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="panel-agent-system-instructions">System instructions</Label>
          <Textarea
            id="panel-agent-system-instructions"
            value={form.system_instructions ?? ""}
            onChange={(event) => setForm({ system_instructions: event.target.value })}
            rows={4}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="panel-agent-optional-elements">Optional elements (one per line)</Label>
          <Textarea
            id="panel-agent-optional-elements"
            value={optionalElementsText}
            onChange={(event) => setForm({ optional_elements: event.target.value.split("\n") })}
            rows={3}
          />
        </div>
      </>
    );
  },
  normalize: (form: Partial<AgentProfile>): AgentProfile | null => {
    const id = form.id?.trim();
    const name = form.name?.trim();
    if (!id || !name) return null;
    return {
      id,
      name,
      description: form.description?.trim() || null,
      default_flow_id: form.default_flow_id?.trim() || null,
      system_instructions: form.system_instructions?.trim() || null,
      optional_elements: (form.optional_elements ?? [])
        .map((line) => line.trim())
        .filter(Boolean),
    };
  },
};

const TRANSPORTS: McpServerConfig["transport"][] = ["http", "sse", "stdio"];

export const mcpFormConfig = {
  emptyForm: (): Partial<McpServerConfig> => ({
    id: genId("mcp"),
    name: "",
    url: "",
    transport: "http",
    enabled: true,
  }),
  renderFields: (
    form: Partial<McpServerConfig>,
    setForm: (patch: Partial<McpServerConfig>) => void,
    editing: McpServerConfig | null,
  ) => (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="panel-mcp-id">Id</Label>
        <Input
          id="panel-mcp-id"
          value={form.id ?? ""}
          onChange={(event) => setForm({ id: event.target.value })}
          disabled={Boolean(editing)}
          className={cn("font-mono text-sm", editing && "opacity-80")}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="panel-mcp-name">Name</Label>
        <Input
          id="panel-mcp-name"
          value={form.name ?? ""}
          onChange={(event) => setForm({ name: event.target.value })}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="panel-mcp-url">URL</Label>
        <Input
          id="panel-mcp-url"
          value={form.url ?? ""}
          onChange={(event) => setForm({ url: event.target.value })}
          className="font-mono text-sm"
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="panel-mcp-transport">Transport</Label>
        <Select
          value={form.transport ?? "http"}
          onValueChange={(value) => setForm({ transport: value as McpServerConfig["transport"] })}
        >
          <SelectTrigger id="panel-mcp-transport" className="w-full">
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
      <div className="flex items-center gap-2">
        <input
          id="panel-mcp-enabled"
          type="checkbox"
          checked={form.enabled ?? true}
          onChange={(event) => setForm({ enabled: event.target.checked })}
          className="border-input size-4 rounded border"
        />
        <Label htmlFor="panel-mcp-enabled" className="font-normal">
          Enabled
        </Label>
      </div>
    </>
  ),
  normalize: (form: Partial<McpServerConfig>): McpServerConfig | null => {
    const id = form.id?.trim();
    const name = form.name?.trim();
    const url = form.url?.trim();
    if (!id || !name || !url) return null;
    return { id, name, url, transport: form.transport ?? "http", enabled: form.enabled ?? true };
  },
};

export const llmProfileFormConfig = {
  emptyForm: (): Partial<LlmProfile> => ({
    id: genId("llm"),
    name: "",
    model: "",
    model_provider: "",
    description: "",
  }),
  renderFields: (
    form: Partial<LlmProfile>,
    setForm: (patch: Partial<LlmProfile>) => void,
    editing: LlmProfile | null,
  ) => (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="panel-llm-id">Id</Label>
        <Input
          id="panel-llm-id"
          value={form.id ?? ""}
          onChange={(event) => setForm({ id: event.target.value })}
          disabled={Boolean(editing)}
          className={cn("font-mono text-sm", editing && "opacity-80")}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="panel-llm-name">Name</Label>
        <Input
          id="panel-llm-name"
          value={form.name ?? ""}
          onChange={(event) => setForm({ name: event.target.value })}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="panel-llm-model">Model</Label>
        <Input
          id="panel-llm-model"
          value={form.model ?? ""}
          onChange={(event) => setForm({ model: event.target.value })}
          className="font-mono text-sm"
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="panel-llm-provider">Provider</Label>
        <Input
          id="panel-llm-provider"
          value={form.model_provider ?? ""}
          onChange={(event) => setForm({ model_provider: event.target.value })}
          className="font-mono text-sm"
          autoComplete="off"
          placeholder="stub, groq, google, azure, ollama, openai_compat"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="panel-llm-description">Description</Label>
        <Textarea
          id="panel-llm-description"
          value={form.description ?? ""}
          onChange={(event) => setForm({ description: event.target.value })}
          rows={2}
        />
      </div>
    </>
  ),
  normalize: (form: Partial<LlmProfile>): LlmProfile | null => {
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
};
