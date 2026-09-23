"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { ResourceEditorDialog } from "@/components/studio/resource-editor-dialog";
import type { AnyResourceKind, ResourceLike } from "@/components/studio/resource-kinds";
import { StudioConfirmDialog } from "@/components/studio/studio-confirm-dialog";
import {
  StudioCardDeleteIconButton,
  StudioCardEditIconButton,
} from "@/components/studio/studio-resource-card-actions";
import { Button } from "@/components/ui/button";
import { useResourceEditor } from "@/hooks/use-resource-editor";
import { useWorkbench } from "./WorkbenchProvider";

/**
 * Workbench-drawer browser for one resource registry. Since Wave 4b
 * (studio-graph-workbench-redesign-plan.md, STO-605) it's driven by the same
 * `ResourceKindConfig` and `ResourceEditorDialog` (Overview / Usage /
 * History) as the full page -- no second copy of any form. Opened from a
 * bound graph node with `{ resourceId }` it goes straight to that
 * resource's editor (Wave 4a).
 */
export function ResourceBrowserPanel({ kind }: { kind: AnyResourceKind }) {
  const editor = useResourceEditor(kind);
  const { items, loading, error, saving, saveError, clearSaveError } = editor;

  const workbench = useWorkbench();
  const requestedId = (workbench.panelContext as { resourceId?: string } | null)?.resourceId;
  const handledRequestRef = useRef<unknown>(null);
  useEffect(() => {
    if (!requestedId || loading || handledRequestRef.current === workbench.panelContext) return;
    const item = items.find((candidate) => candidate.id === requestedId);
    if (!item) return;
    handledRequestRef.current = workbench.panelContext;
    editor.openEdit(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openEdit only sets state
  }, [items, loading, requestedId, workbench.panelContext]);

  const label = (item: ResourceLike) => kind.itemLabel(item) || item.id;
  // "Open full page" deep-links to the resource being edited (ResourcePage `?id=`).
  const fullPageHref = editor.editorOpen && editor.editing ? `${kind.routeHref}?id=${encodeURIComponent(editor.editing.id)}` : kind.routeHref;

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{kind.panelTitle}</div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={loading || saving} onClick={editor.openCreate}>
            New
          </Button>
          <Link href={fullPageHref} className="text-muted-foreground text-xs hover:underline">
            Open full page &rarr;
          </Link>
        </div>
      </div>
      {saveError ? (
        <div className="mb-2 space-y-1" role="alert">
          <p className="text-destructive text-xs">{saveError}</p>
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={clearSaveError}>
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
        <div className="text-muted-foreground text-xs">{kind.emptyText}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-1">
              <button type="button" className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => editor.openEdit(item)}>
                {label(item)}
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                <StudioCardEditIconButton label={label(item)} disabled={saving} onClick={() => editor.openEdit(item)} />
                <StudioCardDeleteIconButton label={label(item)} disabled={saving} onClick={() => editor.requestDelete(item)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ResourceEditorDialog
        kind={kind}
        open={editor.editorOpen}
        onOpenChange={editor.setEditorOpen}
        editing={editor.editing}
        form={editor.form}
        setForm={editor.setForm}
        saving={saving}
        onSave={() => void editor.save()}
        initialTab={editor.initialTab}
      />

      <StudioConfirmDialog
        open={editor.deleteTarget !== null}
        onOpenChange={(open) => !open && editor.setDeleteTarget(null)}
        title={`Delete ${kind.noun}`}
        description={editor.deleteDescription}
        loading={saving}
        onConfirm={editor.confirmDelete}
      />
    </div>
  );
}
