"use client";

import { useEffect, useRef, useState } from "react";

import { ResourceEditorDialog, isResourceEditorTab } from "@/components/studio/resource-editor-dialog";
import type { AnyResourceKind, ResourceKindId } from "@/components/studio/resource-kinds";
import { ScopeSelect } from "@/components/studio/scope-select";
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
import { useGraphScope } from "@/hooks/use-graph-scope";
import { useResourceEditor } from "@/hooks/use-resource-editor";
import { client } from "@/lib/api-client";
import { errorDetail } from "@/lib/apiErrors";
import { cn } from "@/lib/utils";

/** Each kind's key in `GET /api/graphs/{id}/resources`. */
const SCOPE_KEY: Record<ResourceKindId, string> = {
  prompts: "prompts",
  tools: "tools",
  agents: "agents",
  mcp: "mcp-servers",
  llmProfiles: "llm-profiles",
  transforms: "transforms",
};

/** With a graph in scope: the ids of this kind it uses (null while loading). */
function useScopedIds(kind: AnyResourceKind, graphId: string | null, refreshKey: unknown) {
  const [state, setState] = useState<{ graphId: string; ids: Set<string> | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!graphId) {
      setState(null);
      return;
    }
    let cancelled = false;
    setState({ graphId, ids: null, error: null });
    client.graphs.resources(graphId).then(
      ({ ids }) => !cancelled && setState({ graphId, ids: new Set(ids[SCOPE_KEY[kind.id]] ?? []), error: null }),
      (err: unknown) => !cancelled && setState({ graphId, ids: null, error: errorDetail(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [graphId, kind.id, refreshKey]);
  return state?.graphId === graphId ? state : null;
}

/**
 * The full page for one resource registry (studio-graph-workbench-redesign-
 * plan.md, Wave 4b / STO-605), driven entirely by its `ResourceKindConfig`.
 * Replaces five hand-copied page shells. `?id=<resourceId>` opens that
 * resource's editor (and `&tab=usage|history` a tab) -- the deep link the
 * workbench panel's "Open full page" uses.
 */
export function ResourcePage({ kind }: { kind: AnyResourceKind }) {
  const editor = useResourceEditor(kind);
  const { items: allItems, loading, error, refetch, saving, saveError, clearSaveError } = editor;
  // Slice 4: with a graph in scope, only what that graph uses.
  const scope = useGraphScope();
  const scoped = useScopedIds(kind, scope.graphId, allItems);
  const items = scoped?.ids ? allItems.filter((item) => scoped.ids!.has(item.id)) : allItems;
  const noun = kind.panelTitle.toLowerCase();

  // Deep link, read from location rather than useSearchParams so the page
  // stays statically renderable (no Suspense boundary needed). Applied once,
  // after the list has loaded.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current || loading) return;
    deepLinkHandledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const item = id ? allItems.find((candidate) => candidate.id === id) : undefined;
    if (!item) return;
    const tab = params.get("tab");
    editor.openEdit(item, isResourceEditorTab(tab) ? tab : "overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the list first loads
  }, [allItems, loading]);

  return (
    <StudioPage>
      <StudioPageHeader
        title={kind.pageTitle}
        description={kind.pageDescription}
        loading={loading}
        onRefresh={refetch}
        actions={<ScopeSelect scope={scope} />}
      />
      {scope.graph ? (
        <p className="text-muted-foreground mb-3 text-sm" role="status">
          {scoped?.error
            ? `Couldn't load what ${scope.graph.name} uses: ${scoped.error}`
            : scoped?.ids
              ? `${items.length} of ${allItems.length} ${noun} used by ${scope.graph.name}.`
              : `Loading what ${scope.graph.name} uses…`}{" "}
          <Button type="button" variant="link" size="xs" className="h-auto p-0" onClick={() => scope.setGraphId(null)}>
            Show all
          </Button>
        </p>
      ) : null}
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
                  {/* Stretched-button card: the whole card is one "Edit" target for pointer and
                      keyboard, without nesting the edit/delete buttons inside another button. */}
                  <Card className={cn(studioResourceCardInteractiveClass, "relative")}>
                    <button
                      type="button"
                      aria-label={`Edit ${kind.noun} ${label}`}
                      className="focus-visible:ring-primary/60 absolute inset-0 rounded-[inherit] focus-visible:ring-2 focus-visible:outline-none"
                      onClick={() => editor.openEdit(item)}
                    />
                    <CardHeader>
                      {kind.renderCardHeader(item)}
                      <p className="text-muted-foreground pt-1 text-[11px]">{studioCardEditHint}</p>
                    </CardHeader>
                    <CardContent className={kind.renderCardBody ? "space-y-3" : undefined}>
                      <div className="relative flex flex-wrap items-center gap-1">
                        <StudioCardEditIconButton label={label} disabled={saving} onClick={() => editor.openEdit(item)} />
                        <StudioCardDeleteIconButton label={label} disabled={saving} onClick={() => editor.requestDelete(item)} />
                      </div>
                      {kind.renderCardBody ? (
                        // Above the stretched button so a scrollable body still scrolls
                        // and its text can be selected; a click still opens the editor.
                        <div className="relative" onClick={() => editor.openEdit(item)}>
                          {kind.renderCardBody(item)}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">{scope.graph && scoped?.ids ? `${scope.graph.name} uses no ${noun}.` : kind.emptyText}</p>
          ) : null}
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
