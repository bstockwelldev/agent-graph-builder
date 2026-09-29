"use client";

import { useEffect, useState } from "react";
import type { McpDiscovery, McpServerConfig, ToolDefinition } from "@bstockwelldev/agent-graph-sdk";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorDetail } from "@/lib/apiErrors";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { AreaField, FieldLabel } from "./resource-fields";

/**
 * Where a registry tool's results come from (resource-forms-consistency-
 * plan.md, slice 3): a mock echo, or a tool on an MCP server. For MCP the
 * server and its tool are pickers, and picking a tool fills the
 * parameters from the server's schema (then read-only).
 */
export type ToolSource = "mock" | "mcp";

/** The form's view of a tool: the definition plus the chosen source, which
 * is explicit so picking "MCP" sticks before a server is chosen. */
export type ToolForm = ToolDefinition & { _source?: ToolSource };

export function toolSource(form: Partial<ToolForm>): ToolSource {
  return form._source ?? (form.mcp_server_id ? "mcp" : "mock");
}

const SOURCES: { value: ToolSource; label: string; hint: string }[] = [
  { value: "mock", label: "Mock", hint: "Echoes its input back. Useful while designing a graph." },
  { value: "mcp", label: "MCP server", hint: "Calls a tool on one of your MCP servers." },
];

export function ToolSourceFields({
  idPrefix,
  form,
  setForm,
  parametersError,
}: {
  idPrefix: string;
  form: Partial<ToolForm>;
  setForm: (patch: Partial<ToolForm>) => void;
  parametersError: string | null;
}) {
  const source = toolSource(form);
  const [servers, setServers] = useState<McpServerConfig[] | null>(null);
  const [discovery, setDiscovery] = useState<{ serverId: string; result: McpDiscovery | null; error: string | null } | null>(null);
  const serverId = form.mcp_server_id ?? null;

  useEffect(() => {
    if (source !== "mcp" || servers !== null) return;
    let cancelled = false;
    client.mcpServers.list().then(
      (list) => !cancelled && setServers(list),
      () => !cancelled && setServers([]),
    );
    return () => {
      cancelled = true;
    };
  }, [servers, source]);

  useEffect(() => {
    if (source !== "mcp" || !serverId) return;
    let cancelled = false;
    setDiscovery({ serverId, result: null, error: null });
    client.mcpServers.discover(serverId).then(
      (result) => !cancelled && setDiscovery({ serverId, result, error: result.ok ? null : `Couldn't connect: ${result.error}` }),
      (err: unknown) => !cancelled && setDiscovery({ serverId, result: null, error: errorDetail(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [serverId, source]);

  const remoteTools = discovery?.serverId === serverId && discovery.result?.ok ? discovery.result.tools : null;
  const picked = remoteTools?.find((tool) => tool.name === form.mcp_tool_name) ?? null;
  const pickSource = (next: ToolSource) =>
    setForm(next === "mock" ? { _source: "mock", mcp_server_id: null, mcp_tool_name: null } : { _source: "mcp" });

  return (
    <>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Source</legend>
        <div role="radiogroup" aria-label="Tool source" className="bg-muted inline-flex rounded-lg p-0.5">
          {SOURCES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={source === option.value}
              onClick={() => pickSource(option.value)}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                source === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">{SOURCES.find((option) => option.value === source)?.hint}</p>
      </fieldset>

      {source === "mcp" ? (
        <>
          <div className="space-y-1.5">
            <FieldLabel htmlFor={`${idPrefix}-server`} required>
              MCP server
            </FieldLabel>
            <Select
              value={serverId ?? ""}
              onValueChange={(next) => setForm({ _source: "mcp", mcp_server_id: next ? String(next) : null, mcp_tool_name: null })}
            >
              <SelectTrigger id={`${idPrefix}-server`} className="w-full" aria-label="MCP server" aria-required>
                <SelectValue placeholder={servers === null ? "Loading…" : servers.length === 0 ? "No MCP servers yet" : "Choose a server"}>
                  {(value: string) => servers?.find((server) => server.id === value)?.name ?? value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(servers ?? []).map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    {server.name}
                    {!server.enabled ? " (disabled)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {serverId ? (
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${idPrefix}-remote`} required>
                Server tool
              </FieldLabel>
              {remoteTools ? (
                <Select
                  value={form.mcp_tool_name ?? ""}
                  onValueChange={(next) => {
                    const tool = remoteTools.find((entry) => entry.name === next);
                    if (!tool) return;
                    setForm({
                      mcp_tool_name: tool.name,
                      parameters_json: JSON.stringify(tool.input_schema ?? {}, null, 2),
                      ...(form.description?.trim() ? {} : { description: tool.description ?? "" }),
                    });
                  }}
                >
                  <SelectTrigger id={`${idPrefix}-remote`} className="w-full" aria-label="Server tool" aria-required>
                    <SelectValue placeholder={remoteTools.length === 0 ? "The server lists no tools" : "Choose a tool"} />
                  </SelectTrigger>
                  <SelectContent>
                    {remoteTools.map((tool) => (
                      <SelectItem key={tool.name} value={tool.name}>
                        {tool.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                // Discovery failed or is off (public demo): the name can still be typed.
                <Input
                  id={`${idPrefix}-remote`}
                  value={form.mcp_tool_name ?? ""}
                  onChange={(event) => setForm({ mcp_tool_name: event.target.value })}
                  placeholder={discovery?.error ? "Tool name on the server" : "Loading tools…"}
                  className="font-mono text-sm"
                  aria-required
                  autoComplete="off"
                />
              )}
              {discovery?.serverId === serverId && discovery.error ? <p className="text-muted-foreground text-xs">{discovery.error} You can type the tool&apos;s name.</p> : null}
            </div>
          ) : null}
        </>
      ) : null}

      <AreaField
        id={`${idPrefix}-params`}
        label={picked ? "Parameters (from the server)" : "Parameters (JSON Schema)"}
        value={form.parameters_json ?? "{}"}
        onChange={(parameters_json) => setForm({ parameters_json })}
        rows={6}
        mono
        readOnly={Boolean(picked)}
        error={parametersError}
      />
    </>
  );
}
