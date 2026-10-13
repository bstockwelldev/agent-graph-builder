"use client";

import { useEffect, useRef } from "react";

import { ResourceEditorDialog, isResourceEditorTab } from "@/components/studio/resource-editor-dialog";
import { RESOURCE_KINDS, type AnyResourceKind, type ResourceLike } from "@/components/studio/resource-kinds";
import { ScopeSelect } from "@/components/studio/scope-select";
import { StudioConfirmDialog } from "@/components/studio/studio-confirm-dialog";
import {
  StudioCardDeleteIconButton,
  StudioCardEditIconButton,
} from "@/components/studio/studio-resource-card-actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useResourceEditor } from "@/hooks/use-resource-editor";
import { useScopedResourceItems } from "@/hooks/use-scoped-resource-items";
import { useWorkbench } from "./WorkbenchProvider";

/**
 * Workbench-drawer browser for one resource registry. Since Wave 4b
 * (studio-graph-workbench-redesign-plan.md, STO-605) it's driven by the same
 * `ResourceKindConfig` and `ResourceEditorDialog` (Overview / Usage /
 * History) -- one editor for every registry. Opened from a
 * bound graph node with `{ resourceId }` it goes straight to that
 * resource's editor (Wave 4a).
 *
 * Canvas-first landing plan, Phase 2 (§4): everything the resource pages do,
 * so the pages can go -- the graph Scope that narrows the list (and is
 * remembered), `{ resourceId, tab }` deep links (what `?panel=&id=&tab=`
 * opens), and a kind switcher in place of the `/resources` hub.
 */
export function ResourceBrowserPanel({ kind }: { kind: AnyResourceKind }) {
  const editor = useResourceEditor(kind);
  const { items: allItems, loading, error, saving, saveError, clearSaveError } = editor;
  const { scope, items, status, emptyText } = useScopedResourceItems(kind, allItems);

  const workbench = useWorkbench();
  const request = workbench.panelContext as { resourceId?: string; tab?: string } | null;
  const requestedId = request?.resourceId;
  const handledRequestRef = useRef<unknown>(null);
  useEffect(() => {
    if (!requestedId || loading || handledRequestRef.current === workbench.panelContext) return;
    // Look in the whole registry, not the scoped list: a deep link to a
    // resource the remembered scope hides still has to open.
    const item = allItems.find((candidate) => candidate.id === requestedId);
    if (!item) return;
    handledRequestRef.current = workbench.panelContext;
    editor.openEdit(item, isResourceEditorTab(request?.tab) ? request.tab : "overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openEdit only sets state
  }, [allItems, loading, requestedId, workbench.panelContext]);

  const label = (item: ResourceLike) => kind.itemLabel(item) || item.id;

  return (
    <div className="p-3">
      {/* The title, help and close buttons live in the drawer's title bar. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Select value={kind.id} onValueChange={(next) => next && next !== kind.id && workbench.open(RESOURCE_KINDS.find((candidate) => candidate.id === next)?.panelId ?? kind.panelId)}>
          <SelectTrigger aria-label="Resource kind" size="sm" className="w-40">
            <SelectValue>{(value: string) => RESOURCE_KINDS.find((candidate) => candidate.id === value)?.panelTitle ?? value}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {RESOURCE_KINDS.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.panelTitle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={loading || saving} onClick={editor.openCreate}>
            New
          </Button>
        </div>
      </div>
      <div className="mb-2">
        <ScopeSelect scope={scope} />
      </div>
      {status ? (
        <p className="text-muted-foreground mb-2 text-xs" role="status">
          {status}{" "}
          <Button type="button" variant="link" size="xs" className="h-auto p-0 text-xs" onClick={() => scope.setGraphId(null)}>
            Show all
          </Button>
        </p>
      ) : null}
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
        <div className="text-muted-foreground text-xs">{emptyText}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <div className="flex items-center justify-between gap-1">
                <button type="button" className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => editor.openEdit(item)}>
                  {label(item)}
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <StudioCardEditIconButton label={label(item)} disabled={saving} onClick={() => editor.openEdit(item)} />
                  <StudioCardDeleteIconButton label={label(item)} disabled={saving} onClick={() => editor.requestDelete(item)} />
                </div>
              </div>
              {kind.renderPanelDetail?.(item)}
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
