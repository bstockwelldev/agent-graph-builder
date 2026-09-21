"use client";

import { useState } from "react";
import type { AgentProfile } from "@bstockwelldev/agent-graph-sdk";

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

export default function AgentsPage() {
  const { items, loading, error, refetch, save, remove, saving, saveError, clearSaveError } =
    useResourceList<AgentProfile>(client.agents);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDefaultGraphId, setFormDefaultGraphId] = useState("");
  const [formSystemInstructions, setFormSystemInstructions] = useState("");
  const [formOptionalElements, setFormOptionalElements] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AgentProfile | null>(null);

  function openCreate() {
    clearSaveError();
    setEditing(null);
    setFormId(`agent_${crypto.randomUUID().slice(0, 8)}`);
    setFormName("");
    setFormDescription("");
    setFormDefaultGraphId("");
    setFormSystemInstructions("");
    setFormOptionalElements("");
    setEditorOpen(true);
  }

  function openEdit(agent: AgentProfile) {
    clearSaveError();
    setEditing(agent);
    setFormId(agent.id);
    setFormName(agent.name);
    setFormDescription(agent.description ?? "");
    setFormDefaultGraphId(agent.default_flow_id ?? "");
    setFormSystemInstructions(agent.system_instructions ?? "");
    setFormOptionalElements(agent.optional_elements.join("\n"));
    setEditorOpen(true);
  }

  async function handleSave() {
    if (!formId.trim() || !formName.trim()) return;
    await save(
      {
        id: formId.trim(),
        name: formName.trim(),
        description: formDescription.trim() || null,
        default_flow_id: formDefaultGraphId.trim() || null,
        system_instructions: formSystemInstructions.trim() || null,
        optional_elements: formOptionalElements
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
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
        title="Agents"
        description="Named profiles with a default graph, system instructions, and optional elements merged into a run."
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
        New agent
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
            {items.map((agent) => (
              <li key={agent.id}>
                <Card
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit agent ${agent.name}`}
                  className={cn(studioResourceCardInteractiveClass)}
                  onClick={() => openEdit(agent)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openEdit(agent);
                    }
                  }}
                >
                  <CardHeader>
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    <CardDescription>
                      {agent.description || agent.default_flow_id
                        ? `${agent.description ?? ""}${
                            agent.default_flow_id ? ` · default graph: ${agent.default_flow_id}` : ""
                          }`
                        : "No description."}
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
                        label={agent.name}
                        disabled={saving}
                        onClick={() => openEdit(agent)}
                      />
                      <StudioCardDeleteIconButton
                        label={agent.name}
                        disabled={saving}
                        onClick={() => {
                          clearSaveError();
                          setDeleteTarget(agent);
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No agent profiles.</p>
          ) : null}
        </>
      ) : null}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit agent" : "New agent"}</DialogTitle>
            <DialogDescription>
              A named profile a run can select to merge a default graph and system instructions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="agent-id">Id</Label>
              <Input
                id="agent-id"
                value={formId}
                onChange={(event) => setFormId(event.target.value)}
                disabled={Boolean(editing)}
                className={cn("font-mono text-sm", editing && "opacity-80")}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-name">Name</Label>
              <Input
                id="agent-name"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-description">Description</Label>
              <Textarea
                id="agent-description"
                value={formDescription}
                onChange={(event) => setFormDescription(event.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-default-graph">Default graph id</Label>
              <Input
                id="agent-default-graph"
                value={formDefaultGraphId}
                onChange={(event) => setFormDefaultGraphId(event.target.value)}
                className="font-mono text-sm"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-system-instructions">System instructions</Label>
              <Textarea
                id="agent-system-instructions"
                value={formSystemInstructions}
                onChange={(event) => setFormSystemInstructions(event.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-optional-elements">Optional elements (one per line)</Label>
              <Textarea
                id="agent-optional-elements"
                value={formOptionalElements}
                onChange={(event) => setFormOptionalElements(event.target.value)}
                rows={3}
              />
            </div>
            {editing ? (
              <ResourceVersionHistory resourceId={editing.id} versionsClient={client.agents.versions} />
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
                disabled={!formId.trim() || !formName.trim() || saving}
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
        title="Delete agent"
        description={deleteTarget ? `Remove agent profile "${deleteTarget.name}"?` : ""}
        loading={saving}
        onConfirm={handleDelete}
      />
    </StudioPage>
  );
}
