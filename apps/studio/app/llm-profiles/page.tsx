"use client";

import { useState } from "react";
import type { LlmProfile } from "@bstockwelldev/agent-graph-sdk";

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

// New in the studio (no MUI source screen — MUI has no dedicated LLM-profile
// CRUD page). Nav placement confirmed with the user during Phase 4 planning:
// its own top-level Build entry, not nested under Agents or Tools.
export default function LlmProfilesPage() {
  const { items, loading, error, refetch, save, remove, saving, saveError, clearSaveError } =
    useResourceList<LlmProfile>(client.llmProfiles);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<LlmProfile | null>(null);
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formModelProvider, setFormModelProvider] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<LlmProfile | null>(null);

  function openCreate() {
    clearSaveError();
    setEditing(null);
    setFormId(`llm_${crypto.randomUUID().slice(0, 8)}`);
    setFormName("");
    setFormModel("");
    setFormModelProvider("");
    setFormDescription("");
    setEditorOpen(true);
  }

  function openEdit(profile: LlmProfile) {
    clearSaveError();
    setEditing(profile);
    setFormId(profile.id);
    setFormName(profile.name);
    setFormModel(profile.model);
    setFormModelProvider(profile.model_provider ?? "");
    setFormDescription(profile.description ?? "");
    setEditorOpen(true);
  }

  async function handleSave() {
    if (!formId.trim() || !formName.trim() || !formModel.trim()) return;
    await save(
      {
        id: formId.trim(),
        name: formName.trim(),
        model: formModel.trim(),
        model_provider: formModelProvider.trim() || null,
        description: formDescription.trim() || null,
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
        title="LLM profiles"
        description="Named model + provider presets. Graphs and agents can reference a profile instead of hard-coding a model string."
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
        New LLM profile
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
            {items.map((profile) => (
              <li key={profile.id}>
                <Card
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit LLM profile ${profile.name}`}
                  className={cn(studioResourceCardInteractiveClass)}
                  onClick={() => openEdit(profile)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openEdit(profile);
                    }
                  }}
                >
                  <CardHeader>
                    <CardTitle className="text-base">{profile.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {profile.model_provider ? `${profile.model_provider} · ` : ""}
                      {profile.model}
                    </CardDescription>
                    <p className="text-muted-foreground pt-1 text-[11px]">{studioCardEditHint}</p>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="flex flex-wrap items-center gap-1"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <StudioCardEditIconButton
                        label={profile.name}
                        disabled={saving}
                        onClick={() => openEdit(profile)}
                      />
                      <StudioCardDeleteIconButton
                        label={profile.name}
                        disabled={saving}
                        onClick={() => {
                          clearSaveError();
                          setDeleteTarget(profile);
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No LLM profiles.</p>
          ) : null}
        </>
      ) : null}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit LLM profile" : "New LLM profile"}</DialogTitle>
            <DialogDescription>A named model + provider preset.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="llm-id">Id</Label>
              <Input
                id="llm-id"
                value={formId}
                onChange={(event) => setFormId(event.target.value)}
                disabled={Boolean(editing)}
                className={cn("font-mono text-sm", editing && "opacity-80")}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="llm-name">Name</Label>
              <Input
                id="llm-name"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="llm-model">Model</Label>
              <Input
                id="llm-model"
                value={formModel}
                onChange={(event) => setFormModel(event.target.value)}
                className="font-mono text-sm"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="llm-provider">Provider</Label>
              <Input
                id="llm-provider"
                value={formModelProvider}
                onChange={(event) => setFormModelProvider(event.target.value)}
                className="font-mono text-sm"
                autoComplete="off"
                placeholder="stub, groq, google, azure, ollama, openai_compat"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="llm-description">Description</Label>
              <Textarea
                id="llm-description"
                value={formDescription}
                onChange={(event) => setFormDescription(event.target.value)}
                rows={2}
              />
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
                disabled={!formId.trim() || !formName.trim() || !formModel.trim() || saving}
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
        title="Delete LLM profile"
        description={deleteTarget ? `Remove LLM profile "${deleteTarget.name}"?` : ""}
        loading={saving}
        onConfirm={handleDelete}
      />
    </StudioPage>
  );
}
