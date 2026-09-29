"use client";

import { useEffect, useState } from "react";
import type { McpDiscovery, McpServerConfig, ToolDefinition } from "@bstockwelldev/agent-graph-sdk";
import { Plus, PlugZap, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorDetail } from "@/lib/apiErrors";
import { client } from "@/lib/api-client";
import { emitResourceChanged } from "@/lib/resourceEvents";

import { FieldLabel } from "./resource-fields";

/**
 * MCP server form parts (resource-forms-consistency-plan.md, slice 3): the
 * transport select (only http runs), write-only request headers, and
 * "Test connection", which lists the server's tools with one-click
 * "Add to registry".
 */

/** One header row. `stored`: the server has a value the studio never sees;
 * a blank value keeps it. */
export type HeaderRow = { name: string; value: string; stored: boolean };

/** The form's view of a server: the resource plus its header rows
 * (`undefined` until an existing server's names load). */
export type McpServerForm = McpServerConfig & { _headers?: HeaderRow[]; _headersEdited?: boolean };

const TRANSPORTS: { value: McpServerConfig["transport"]; label: string; runs: boolean }[] = [
  { value: "http", label: "HTTP", runs: true },
  { value: "sse", label: "SSE (not yet)", runs: false },
  { value: "stdio", label: "stdio (not yet)", runs: false },
];

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function headerIssues(rows: HeaderRow[] | undefined): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    const name = row.name.trim();
    if (!name && !row.value.trim()) continue;
    if (!name) issues.push("Name every header.");
    else if (!HEADER_NAME.test(name)) issues.push(`"${name}" isn't a valid header name.`);
    else if (seen.has(name.toLowerCase())) issues.push(`Header ${name} is listed twice.`);
    else if (!row.stored && !row.value.trim()) issues.push(`Add a value for header ${name}.`);
    if (name) seen.add(name.toLowerCase());
  }
  return issues;
}

/** The headers PUT body: blank values of stored rows keep what's stored. */
export function headersUpdate(rows: HeaderRow[]): Record<string, string | null> {
  const update: Record<string, string | null> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    update[name] = row.value.trim() ? row.value : row.stored ? null : row.value;
  }
  return update;
}

export function TransportField({ id, value, onChange }: { id: string; value: McpServerConfig["transport"]; onChange: (value: McpServerConfig["transport"]) => void }) {
  const current = TRANSPORTS.find((option) => option.value === value);
  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={id}>Transport</FieldLabel>
      <Select value={value} onValueChange={(next) => onChange(next as McpServerConfig["transport"])}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{(selected: string) => TRANSPORTS.find((option) => option.value === selected)?.label ?? selected}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {TRANSPORTS.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={!option.runs && option.value !== value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current && !current.runs ? (
        <p className="text-destructive text-xs">Tools on this server won&apos;t run until it uses HTTP; only HTTP is implemented.</p>
      ) : null}
    </div>
  );
}

export function HeadersField({
  idPrefix,
  serverId,
  rows,
  onLoad,
  onChange,
}: {
  idPrefix: string;
  /** Set for an existing server: its stored header names load once. */
  serverId: string | null;
  rows: HeaderRow[] | undefined;
  /** The stored rows (or none, for a new server) arrived. */
  onLoad: (rows: HeaderRow[]) => void;
  /** The user edited the rows. */
  onChange: (rows: HeaderRow[]) => void;
}) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const loaded = rows !== undefined;

  useEffect(() => {
    if (loaded) return;
    if (!serverId) {
      onLoad([]);
      return;
    }
    let cancelled = false;
    client.mcpServers.headers.get(serverId).then(
      ({ names }) => {
        if (!cancelled) onLoad(names.map((name) => ({ name, value: "", stored: true })));
      },
      (err: unknown) => {
        if (!cancelled) setLoadError(errorDetail(err));
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per server
  }, [loaded, serverId]);

  const list = rows ?? [];
  const update = (index: number, patch: Partial<HeaderRow>) => onChange(list.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">Request headers</legend>
      <p className="text-muted-foreground text-xs">
        Sent with every request, e.g. Authorization. Values are stored on the server and never shown again.
      </p>
      {loadError ? <p className="text-destructive text-xs">{loadError}</p> : null}
      {!loaded && !loadError ? <p className="text-muted-foreground text-xs">Loading headers…</p> : null}
      {list.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            aria-label={`Header ${index + 1} name`}
            value={row.name}
            onChange={(event) => update(index, { name: event.target.value, stored: false })}
            disabled={row.stored}
            placeholder="Authorization"
            className="w-2/5 font-mono text-sm"
            autoComplete="off"
          />
          <Input
            id={`${idPrefix}-header-${index}`}
            aria-label={`Header ${row.name.trim() || index + 1} value`}
            type="password"
            value={row.value}
            onChange={(event) => update(index, { value: event.target.value })}
            placeholder={row.stored ? "Stored; type to replace" : "Value"}
            className="flex-1 font-mono text-sm"
            autoComplete="new-password"
          />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove header ${row.name.trim() || index + 1}`} onClick={() => onChange(list.filter((_, i) => i !== index))}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      {loaded ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...list, { name: "", value: "", stored: false }])}>
          <Plus aria-hidden /> Add header
        </Button>
      ) : null}
    </fieldset>
  );
}

/** A registry tool id for a server's remote tool: `serverId.toolName`, the
 * backend's namespaced key, with anything an id can't hold replaced. */
export function registryToolId(serverId: string, toolName: string): string {
  return `${serverId}.${toolName}`.replace(/[^A-Za-z0-9_.-]+/g, "_");
}

export function McpDiscoverySection({ server }: { server: McpServerConfig }) {
  const [result, setResult] = useState<McpDiscovery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registry, setRegistry] = useState<ToolDefinition[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  const test = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const [discovery, tools] = await Promise.all([client.mcpServers.discover(server.id), client.tools.list()]);
      setResult(discovery);
      setRegistry(tools);
    } catch (err) {
      setError(errorDetail(err));
    } finally {
      setBusy(false);
    }
  };

  const add = async (tool: McpDiscovery["tools"][number]) => {
    setAdding(tool.name);
    setError(null);
    try {
      const created = await client.tools.create({
        id: registryToolId(server.id, tool.name),
        description: tool.description?.trim() || `${tool.name} on ${server.name}`,
        parameters_json: JSON.stringify(tool.input_schema ?? {}),
        requires_approval: false,
        mcp_server_id: server.id,
        mcp_tool_name: tool.name,
      });
      setRegistry((prev) => [...prev, created]);
      emitResourceChanged();
    } catch (err) {
      setError(errorDetail(err));
    } finally {
      setAdding(null);
    }
  };

  const bound = (name: string) => registry.find((tool) => tool.mcp_server_id === server.id && tool.mcp_tool_name === name);

  return (
    <section aria-label="Connection" className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">Uses the saved URL and headers.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void test()} disabled={busy}>
          <PlugZap aria-hidden /> {busy ? "Connecting…" : "Test connection"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
      {result && !result.ok ? (
        <p role="alert" className="text-destructive text-xs">
          Couldn&apos;t connect: {result.error}
        </p>
      ) : null}
      {result?.ok ? (
        <div role="status" className="space-y-2">
          <p className="text-sm">
            Connected · {result.tools.length} tool{result.tools.length === 1 ? "" : "s"}
          </p>
          <ul className="space-y-1.5">
            {result.tools.map((tool) => {
              const existing = bound(tool.name);
              return (
                <li key={tool.name} className="flex items-start justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-mono">{tool.name}</span>
                    {tool.description ? <span className="text-muted-foreground block text-xs">{tool.description}</span> : null}
                  </span>
                  {existing ? (
                    <Badge variant="secondary" className="shrink-0 font-mono">
                      {existing.id}
                    </Badge>
                  ) : (
                    <Button type="button" variant="ghost" size="xs" className="shrink-0" aria-label={`Add ${tool.name} to the tool registry`} disabled={adding !== null} onClick={() => void add(tool)}>
                      <Plus aria-hidden /> {adding === tool.name ? "Adding…" : "Add to registry"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
