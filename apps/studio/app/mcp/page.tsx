"use client";

import { useState } from "react";
import type { McpServerConfig } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { StudioConfirmDialog } from "@/components/studio/studio-confirm-dialog";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import { ResourceVersionHistory } from "@/components/studio/resource-version-history";
import {
  StudioCardDeleteIconButton,
  StudioCardEditIconButton,
  studioCardEditHint,
  studioResourceCardInteractiveClass,
} from "@/components/studio/studio-resource-card-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResourceList } from "@/hooks/use-resource-list";
import { cn } from "@/lib/utils";

const TRANSPORTS: McpServerConfig["transport"][] = ["http", "sse", "stdio"];

export default function McpPage() {
  const { items, loading, error, refetch, save, remove, saving, saveError, clearSaveError } =
    useResourceList<McpServerConfig>(client.mcpServers);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<McpServerConfig | null>(null);
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formTransport, setFormTransport] = useState<McpServerConfig["transport"]>("http");
  const [formEnabled, setFormEnabled] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<McpServerConfig | null>(null);

  function openCreate() {
    clearSaveError();
    setEditing(null);
    setFormId(`mcp_${crypto.randomUUID().slice(0, 8)}`);
    setFormName("");
    setFormUrl("");
    setFormTransport("http");
    setFormEnabled(true);
    setEditorOpen(true);
  }

  function openEdit(server: McpServerConfig) {
    clearSaveError();
    setEditing(server);
    setFormId(server.id);
    setFormName(server.name);
    setFormUrl(server.url);
    setFormTransport(server.transport);
    setFormEnabled(server.enabled);
    setEditorOpen(true);
  }

  async function handleSave() {
    if (!formId.trim() || !formName.trim() || !formUrl.trim()) return;
    await save(
      {
        id: formId.trim(),
        name: formName.trim(),
        url: formUrl.trim(),
        transport: formTransport,
        enabled: formEnabled,
      },
      !editing,
    );
    setEditorOpen(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await remove(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <StudioPage>
      <StudioPageHeader
        title="MCP servers"
        description="Remote tool servers. Only http transport is currently dispatched by tool nodes; sse/stdio validate but don't execute yet."
        loading={loading}
        onRefresh={refetch}
      />
      <Button
        type="button"
        size="sm"
        variant="synth"
        className="mb-4"
        disabled={loading || saving}
        onClick={openCreate}
      >
        New MCP server
      </Button>
      {saveError ? (
        <div className="glass-panel ring-destructive/30 mb-4 space-y-2 rounded-lg p-4 ring-1" role="alert">
          <p className="text-destructive text-sm">{saveError}</p>
          <Button type="button" size="sm" variant="outline" onClick={clearSaveError}>
            Dismiss
          </Button>
        </div>
      ) : null}
      {error && !loading ? (
        <div className="glass-panel ring-destructive/30 space-y-2 rounded-lg p-4 ring-1" role="alert">
          <p className="text-destructive text-sm">{error}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {!loading && !error ? (
        <>
          <ul className="grid gap-5 md:grid-cols-2">
            {items.map((server) => (
              <li key={server.id}>
                <Card
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit MCP server ${server.name}`}
                  className={cn(studioResourceCardInteractiveClass)}
                  onClick={() => openEdit(server)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openEdit(server);
                    }
                  }}
                >
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{server.name}</CardTitle>
                      <Badge variant="outline">{server.transport}</Badge>
                      {!server.enabled ? <Badge variant="outline">Disabled</Badge> : null}
                    </div>
                    <CardDescription className="font-mono text-xs">{server.url}</CardDescription>
                    <p className="text-muted-foreground pt-1 text-[11px]">{studioCardEditHint}</p>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="flex flex-wrap items-center gap-1"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <StudioCardEditIconButton
                        label={server.name}
                        disabled={saving}
                        onClick={() => openEdit(server)}
                      />
                      <StudioCardDeleteIconButton
                        label={server.name}
                        disabled={saving}
                        onClick={() => {
                          clearSaveError();
                          setDeleteTarget(server);
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No MCP servers configured.</p>
          ) : null}
        </>
      ) : null}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit MCP server" : "New MCP server"}</DialogTitle>
            <DialogDescription>
              Tools bind via mcp_server_id + mcp_tool_name; the identity is &quot;serverId.toolName&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-id">Id</Label>
              <Input
                id="mcp-id"
                value={formId}
                onChange={(event) => setFormId(event.target.value)}
                disabled={Boolean(editing)}
                className={cn("font-mono text-sm", editing && "opacity-80")}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-name">Name</Label>
              <Input
                id="mcp-name"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-url">URL</Label>
              <Input
                id="mcp-url"
                value={formUrl}
                onChange={(event) => setFormUrl(event.target.value)}
                className="font-mono text-sm"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-transport">Transport</Label>
              <Select
                value={formTransport}
                onValueChange={(value) => setFormTransport(value as McpServerConfig["transport"])}
              >
                <SelectTrigger id="mcp-transport" className="w-full">
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
                id="mcp-enabled"
                type="checkbox"
                checked={formEnabled}
                onChange={(event) => setFormEnabled(event.target.checked)}
                className="border-input size-4 rounded border"
              />
              <Label htmlFor="mcp-enabled" className="font-normal">
                Enabled
              </Label>
            </div>
            {editing ? (
              <ResourceVersionHistory resourceId={editing.id} versionsClient={client.mcpServers.versions} />
            ) : null}
          </div>
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="synth"
                disabled={!formId.trim() || !formName.trim() || !formUrl.trim() || saving}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StudioConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete MCP server"
        description={deleteTarget ? `Remove MCP server "${deleteTarget.name}"?` : ""}
        loading={saving}
        onConfirm={handleDelete}
      />
    </StudioPage>
  );
}
