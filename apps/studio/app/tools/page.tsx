"use client";

import { useState } from "react";
import type { ToolDefinition } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { StudioConfirmDialog } from "@/components/studio/studio-confirm-dialog";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
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
import { Textarea } from "@/components/ui/textarea";
import { useResourceList } from "@/hooks/use-resource-list";
import { cn } from "@/lib/utils";

function normalizeParametersJson(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "{}";
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    return trimmed;
  }
}

export default function ToolsPage() {
  const { items, loading, error, refetch, save, remove, saving, saveError, clearSaveError } =
    useResourceList<ToolDefinition>(client.tools);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ToolDefinition | null>(null);
  const [formId, setFormId] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formParametersJson, setFormParametersJson] = useState("{}");
  const [formRequiresApproval, setFormRequiresApproval] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ToolDefinition | null>(null);

  function openCreate() {
    clearSaveError();
    setEditing(null);
    setFormId(`tool_${crypto.randomUUID().slice(0, 8)}`);
    setFormDescription("");
    setFormParametersJson("{}");
    setFormRequiresApproval(false);
    setEditorOpen(true);
  }

  function openEdit(tool: ToolDefinition) {
    clearSaveError();
    setEditing(tool);
    setFormId(tool.id);
    setFormDescription(tool.description);
    setFormParametersJson(tool.parameters_json || "{}");
    setFormRequiresApproval(Boolean(tool.requires_approval));
    setEditorOpen(true);
  }

  async function handleSave() {
    if (!formId.trim() || !formDescription.trim()) return;
    await save(
      {
        id: formId.trim(),
        description: formDescription.trim(),
        parameters_json: normalizeParametersJson(formParametersJson),
        requires_approval: formRequiresApproval,
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
        title="Tool registry"
        description="Catalog definitions exposed to graphs. Tool nodes bind to a registry entry by id."
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
        New tool
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
            {items.map((tool) => (
              <li key={tool.id}>
                <Card
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit tool ${tool.id}`}
                  className={cn(studioResourceCardInteractiveClass)}
                  onClick={() => openEdit(tool)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openEdit(tool);
                    }
                  }}
                >
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="font-mono text-base">{tool.id}</CardTitle>
                      {tool.requires_approval ? <Badge variant="outline">Approval</Badge> : null}
                      {tool.mcp_server_id ? <Badge variant="outline">MCP</Badge> : null}
                    </div>
                    <CardDescription>{tool.description}</CardDescription>
                    <p className="text-muted-foreground pt-1 text-[11px]">{studioCardEditHint}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div
                      className="flex flex-wrap items-center gap-1"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <StudioCardEditIconButton
                        label={tool.id}
                        disabled={saving}
                        onClick={() => openEdit(tool)}
                      />
                      <StudioCardDeleteIconButton
                        label={tool.id}
                        disabled={saving}
                        onClick={() => {
                          clearSaveError();
                          setDeleteTarget(tool);
                        }}
                      />
                    </div>
                    <pre className="bg-surface-container-lowest/90 max-h-36 overflow-auto rounded-lg p-2 font-mono text-[11px] ring-1 ring-outline-variant/20">
                      {tool.parameters_json}
                    </pre>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No tools configured.</p>
          ) : null}
        </>
      ) : null}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit tool" : "New tool"}</DialogTitle>
            <DialogDescription>
              Id matches the tool name a `tool` node&apos;s config references.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tool-id">Id</Label>
              <Input
                id="tool-id"
                value={formId}
                onChange={(event) => setFormId(event.target.value)}
                disabled={Boolean(editing)}
                className={cn("font-mono text-sm", editing && "opacity-80")}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tool-desc">Description</Label>
              <Textarea
                id="tool-desc"
                value={formDescription}
                onChange={(event) => setFormDescription(event.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tool-params">Parameters (JSON)</Label>
              <Textarea
                id="tool-params"
                value={formParametersJson}
                onChange={(event) => setFormParametersJson(event.target.value)}
                rows={6}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="tool-approval"
                type="checkbox"
                checked={formRequiresApproval}
                onChange={(event) => setFormRequiresApproval(event.target.checked)}
                className="border-input size-4 rounded border"
              />
              <Label htmlFor="tool-approval" className="font-normal">
                Requires human approval in Run
              </Label>
            </div>
          </div>
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="synth"
                disabled={!formId.trim() || !formDescription.trim() || saving}
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
        title="Delete tool"
        description={
          deleteTarget ? `Remove tool "${deleteTarget.id}"? Graph nodes may reference it.` : ""
        }
        loading={saving}
        onConfirm={handleDelete}
      />
    </StudioPage>
  );
}
