"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ResourceUsage, ResourceVersionIndexEntry } from "@bstockwelldev/agent-graph-sdk";

import { useResourceList } from "@/hooks/use-resource-list";
import { StudioConfirmDialog } from "@/components/studio/studio-confirm-dialog";
import { ResourceUsageList } from "@/components/studio/resource-usage-list";
import { ResourceVersionHistory } from "@/components/studio/resource-version-history";
import { useWorkbench } from "./WorkbenchProvider";
import {
  StudioCardDeleteIconButton,
  StudioCardEditIconButton,
} from "@/components/studio/studio-resource-card-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Phase 10 Slice A follow-up (docs/planning/features/studio-shell-ux-gap-analysis.md):
// inline create/edit for the workbench drawer, closing the gap analysis's
// finding that this panel was list-only with an "Open full page" link as
// its only door to actually editing a resource. Reuses useResourceList<T>
// (already generic — this just starts destructuring save/remove/saving/
// saveError it previously discarded) and the same Dialog/StudioConfirmDialog/
// ResourceVersionHistory building blocks every full CRUD page already uses;
// only the field JSX and pre-save normalization genuinely differ per
// resource kind (prompts/tools/agents/mcp/llm-profiles), so those are the
// one thing callers supply — everything else (list, edit/delete icons,
// Dialog chrome, delete confirm, version history) stays shared here.
type ResourceLike = { id: string; name?: string | null; description?: string | null };

function displayLabel(item: ResourceLike): string {
  if (item.name) return item.name;
  if (item.description) return item.description;
  return item.id;
}

// Singular label for dialog titles/messages, e.g. "Agents" -> "agent".
function singular(title: string): string {
  const lower = title.toLowerCase();
  return lower.endsWith("s") ? lower.slice(0, -1) : lower;
}

export function ResourceBrowserPanel<T extends ResourceLike>({
  resourceClient,
  title,
  routeHref,
  emptyForm,
  renderFields,
  normalize,
}: {
  resourceClient: {
    list: () => Promise<T[]>;
    create: (resource: T) => Promise<T>;
    update: (resource: T) => Promise<T>;
    delete: (id: string) => Promise<{ deleted: boolean }>;
    /** Wave 4a "used by" (GET /api/{kind}/{id}/usages). */
    usages?: (id: string) => Promise<ResourceUsage[]>;
    versions: {
      publish: (resourceId: string) => Promise<{ created: boolean }>;
      list: (resourceId: string) => Promise<ResourceVersionIndexEntry[]>;
    };
  };
  title: string;
  routeHref: string;
  /** Starting state for "New" — typically just a fresh generated id. */
  emptyForm: () => Partial<T>;
  /** The one thing that genuinely varies per resource kind: its fields. */
  renderFields: (
    form: Partial<T>,
    setForm: (patch: Partial<T>) => void,
    editing: T | null,
  ) => ReactNode;
  /** Trims/normalizes `form` into a savable `T`, or returns null when
   * required fields are missing — doubles as the Save-button validity
   * gate, mirroring each full page's own disabled-Save condition. */
  normalize: (form: Partial<T>) => T | null;
}) {
  const { items, loading, error, save, remove, saving, saveError, clearSaveError } =
    useResourceList(resourceClient);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setFormState] = useState<Partial<T>>({});
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  // Wave 4a: opened from a node's "Open" button with `{ resourceId }` --
  // jump straight to that resource's editor, once per open.
  const workbench = useWorkbench();
  const requestedId = (workbench.panelContext as { resourceId?: string } | null)?.resourceId;
  const handledRequestRef = useRef<unknown>(null);
  useEffect(() => {
    if (!requestedId || loading || handledRequestRef.current === workbench.panelContext) return;
    const item = items.find((candidate) => candidate.id === requestedId);
    if (!item) return;
    handledRequestRef.current = workbench.panelContext;
    openEdit(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openEdit only sets state
  }, [items, loading, requestedId, workbench.panelContext]);

  function setForm(patch: Partial<T>) {
    setFormState((prev) => ({ ...prev, ...patch }));
  }

  function openCreate() {
    clearSaveError();
    setEditing(null);
    setFormState(emptyForm());
    setEditorOpen(true);
  }

  function openEdit(item: T) {
    clearSaveError();
    setEditing(item);
    setFormState(item);
    setEditorOpen(true);
  }

  async function handleSave() {
    const normalized = normalize(form);
    if (!normalized) return;
    await save(normalized, !editing);
    setEditorOpen(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await remove(deleteTarget.id);
    setDeleteTarget(null);
  }

  const label = singular(title);
  const canSave = normalize(form) !== null;

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            disabled={loading || saving}
            onClick={openCreate}
          >
            New
          </Button>
          <Link href={routeHref} className="text-muted-foreground text-xs hover:underline">
            Open full page &rarr;
          </Link>
        </div>
      </div>
      {saveError ? (
        <div className="mb-2 space-y-1" role="alert">
          <p className="text-destructive text-xs">{saveError}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={clearSaveError}
          >
            Dismiss
          </Button>
        </div>
      ) : null}
      {loading ? (
        <div className="flex flex-col gap-2">
          <div className="agb-skeleton h-4 w-full rounded" />
          <div className="agb-skeleton h-4 w-full rounded" />
          <div className="agb-skeleton h-4 w-2/3 rounded" />
        </div>
      ) : error ? (
        <div role="alert" className="text-destructive text-xs">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="text-muted-foreground text-xs">No {title.toLowerCase()} yet.</div>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-1">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                onClick={() => openEdit(item)}
              >
                {displayLabel(item)}
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                <StudioCardEditIconButton
                  label={displayLabel(item)}
                  disabled={saving}
                  onClick={() => openEdit(item)}
                />
                <StudioCardDeleteIconButton
                  label={displayLabel(item)}
                  disabled={saving}
                  onClick={() => {
                    clearSaveError();
                    setDeleteTarget(item);
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${label}` : `New ${label}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {renderFields(form, setForm, editing)}
            {editing && resourceClient.usages ? (
              <ResourceUsageList
                resourceId={editing.id}
                loadUsages={resourceClient.usages}
                onNavigate={() => setEditorOpen(false)}
              />
            ) : null}
            {editing ? (
              <ResourceVersionHistory resourceId={editing.id} versionsClient={resourceClient.versions} />
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
                disabled={!canSave || saving}
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
        title={`Delete ${label}`}
        description={deleteTarget ? `Remove "${displayLabel(deleteTarget)}"?` : ""}
        loading={saving}
        onConfirm={handleDelete}
      />
    </div>
  );
}
