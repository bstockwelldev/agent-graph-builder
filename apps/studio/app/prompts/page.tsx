"use client";

import { useState } from "react";
import type { PromptTemplate } from "@bstockwelldev/agent-graph-sdk";

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

export default function PromptsPage() {
  const { items, loading, error, refetch, save, remove, saving, saveError, clearSaveError } =
    useResourceList<PromptTemplate>(client.prompts);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formBody, setFormBody] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PromptTemplate | null>(null);

  function openCreate() {
    clearSaveError();
    setEditing(null);
    setFormId(`prompt_${crypto.randomUUID().slice(0, 8)}`);
    setFormName("");
    setFormBody("");
    setEditorOpen(true);
  }

  function openEdit(prompt: PromptTemplate) {
    clearSaveError();
    setEditing(prompt);
    setFormId(prompt.id);
    setFormName(prompt.name);
    setFormBody(prompt.body);
    setEditorOpen(true);
  }

  async function handleSave() {
    if (!formId.trim() || !formName.trim() || !formBody.trim()) return;
    await save(
      { id: formId.trim(), name: formName.trim(), body: formBody.trim() },
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
        title="Prompt Lab"
        description="Prompt templates a graph's prompt/llm nodes can reference by id."
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
        New prompt
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
          <ul className="space-y-4">
            {items.map((prompt) => (
              <li key={prompt.id}>
                <Card
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit prompt ${prompt.name}`}
                  className={cn(studioResourceCardInteractiveClass)}
                  onClick={() => openEdit(prompt)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openEdit(prompt);
                    }
                  }}
                >
                  <CardHeader>
                    <CardTitle className="text-base">{prompt.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">{prompt.id}</CardDescription>
                    <p className="text-muted-foreground pt-1 text-[11px]">{studioCardEditHint}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div
                      className="flex flex-wrap items-center gap-1"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <StudioCardEditIconButton
                        label={prompt.name}
                        disabled={saving}
                        onClick={() => openEdit(prompt)}
                      />
                      <StudioCardDeleteIconButton
                        label={prompt.name}
                        disabled={saving}
                        onClick={() => {
                          clearSaveError();
                          setDeleteTarget(prompt);
                        }}
                      />
                    </div>
                    <pre className="bg-surface-container-lowest/90 max-h-48 overflow-auto rounded-lg p-3 font-mono text-xs whitespace-pre-wrap ring-1 ring-outline-variant/20">
                      {prompt.body}
                    </pre>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No prompt templates.</p>
          ) : null}
        </>
      ) : null}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit prompt" : "New prompt"}</DialogTitle>
            <DialogDescription>
              Graph nodes reference prompts by id. Changing id may break existing refs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="prompt-id">Id</Label>
              <Input
                id="prompt-id"
                value={formId}
                onChange={(event) => setFormId(event.target.value)}
                disabled={Boolean(editing)}
                className={cn(editing && "opacity-80")}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prompt-name">Name</Label>
              <Input
                id="prompt-name"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prompt-body">Body</Label>
              <Textarea
                id="prompt-body"
                value={formBody}
                onChange={(event) => setFormBody(event.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
            </div>
            {editing ? (
              <ResourceVersionHistory resourceId={editing.id} versionsClient={client.prompts.versions} />
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
                disabled={!formId.trim() || !formName.trim() || !formBody.trim() || saving}
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
        title="Delete prompt"
        description={deleteTarget ? `Remove "${deleteTarget.name}" (${deleteTarget.id})?` : ""}
        loading={saving}
        onConfirm={handleDelete}
      />
    </StudioPage>
  );
}
