"use client";

import { useEffect, useRef } from "react";

import { ResourceEditorDialog, isResourceEditorTab } from "@/components/studio/resource-editor-dialog";
import type { AnyResourceKind } from "@/components/studio/resource-kinds";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useResourceEditor } from "@/hooks/use-resource-editor";
import { cn } from "@/lib/utils";

/**
 * The full page for one resource registry (studio-graph-workbench-redesign-
 * plan.md, Wave 4b / STO-605), driven entirely by its `ResourceKindConfig`.
 * Replaces five hand-copied page shells. `?id=<resourceId>` opens that
 * resource's editor (and `&tab=usage|history` a tab) -- the deep link the
 * workbench panel's "Open full page" uses.
 */
export function ResourcePage({ kind }: { kind: AnyResourceKind }) {
  const editor = useResourceEditor(kind);
  const { items, loading, error, refetch, saving, saveError, clearSaveError } = editor;

  // Deep link, read from location rather than useSearchParams so the page
  // stays statically renderable (no Suspense boundary needed). Applied once,
  // after the list has loaded.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current || loading) return;
    deepLinkHandledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const item = id ? items.find((candidate) => candidate.id === id) : undefined;
    if (!item) return;
    const tab = params.get("tab");
    editor.openEdit(item, isResourceEditorTab(tab) ? tab : "overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the list first loads
  }, [items, loading]);

  return (
    <StudioPage>
      <StudioPageHeader title={kind.pageTitle} description={kind.pageDescription} loading={loading} onRefresh={refetch} />
      <Button type="button" size="sm" variant="synth" className="mb-4" disabled={loading || saving} onClick={editor.openCreate}>
        New {kind.noun}
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
          <ul className={kind.listLayout === "grid" ? "grid gap-5 md:grid-cols-2" : "space-y-4"}>
            {items.map((item) => {
              const label = kind.itemLabel(item);
              return (
                <li key={item.id}>
                  <Card
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit ${kind.noun} ${label}`}
                    className={cn(studioResourceCardInteractiveClass)}
                    onClick={() => editor.openEdit(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        editor.openEdit(item);
                      }
                    }}
                  >
                    <CardHeader>
                      {kind.renderCardHeader(item)}
                      <p className="text-muted-foreground pt-1 text-[11px]">{studioCardEditHint}</p>
                    </CardHeader>
                    <CardContent className={kind.renderCardBody ? "space-y-3" : undefined}>
                      <div
                        className="flex flex-wrap items-center gap-1"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <StudioCardEditIconButton label={label} disabled={saving} onClick={() => editor.openEdit(item)} />
                        <StudioCardDeleteIconButton label={label} disabled={saving} onClick={() => editor.requestDelete(item)} />
                      </div>
                      {kind.renderCardBody?.(item)}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
          {items.length === 0 ? <p className="text-muted-foreground text-sm">{kind.emptyText}</p> : null}
        </>
      ) : null}

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
    </StudioPage>
  );
}
