"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/graph/ui/Button";
import { Combobox } from "@/components/graph/ui/Combobox";
import { IconButton } from "@/components/graph/ui/IconButton";
import { SkeletonBlock } from "@/components/graph/ui/Skeleton";
import { ResourceEditorDialog, isResourceEditorTab } from "@/components/studio/resource-editor-dialog";
import { RESOURCE_KINDS, type AnyResourceKind, type ResourceLike } from "@/components/studio/resource-kinds";
import { ScopeSelect } from "@/components/studio/scope-select";
import { StudioConfirmDialog } from "@/components/studio/studio-confirm-dialog";
import { useResourceEditor } from "@/hooks/use-resource-editor";
import { useScopedResourceItems } from "@/hooks/use-scoped-resource-items";
import { accentSurface, localType, radius, spacing, text, typeScale } from "@/lib/graph-theme";
import { useWorkbench } from "./WorkbenchProvider";

const alertBox: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[2],
  padding: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${accentSurface.destructive.border}`,
  background: accentSurface.destructive.bg,
  color: accentSurface.destructive.text,
  ...localType.ui,
};

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
 *
 * Styled from the canvas tokens and the graph kit (canvas-styling-plan.md,
 * PR 2). The editor dialog it opens is restyled in PR 1.
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
    <div style={{ padding: spacing[3], color: text.primary }}>
      {/* The title, help and close buttons live in the drawer's title bar. */}
      <div style={{ display: "flex", alignItems: "center", gap: spacing[2], marginBottom: spacing[2] }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Combobox
            aria-label="Resource kind"
            value={kind.id}
            options={RESOURCE_KINDS.map((candidate) => ({ value: candidate.id, label: candidate.panelTitle }))}
            searchPlaceholder="Find a kind…"
            onChange={(next) => {
              const target = RESOURCE_KINDS.find((candidate) => candidate.id === next);
              if (target && target.id !== kind.id) workbench.open(target.panelId);
            }}
          />
        </div>
        <Button disabled={loading || saving} onClick={editor.openCreate} style={{ flexShrink: 0 }}>
          New
        </Button>
      </div>
      <div style={{ marginBottom: spacing[2] }}>
        <ScopeSelect scope={scope} />
      </div>
      {status ? (
        <p role="status" style={{ margin: `0 0 ${spacing[2]}px`, ...typeScale.caption, color: text.secondary }}>
          {status}{" "}
          <button
            type="button"
            className="agb-focus-ring"
            onClick={() => scope.setGraphId(null)}
            style={{ border: 0, background: "none", padding: 0, color: text.primary, textDecoration: "underline", cursor: "pointer", font: "inherit" }}
          >
            Show all
          </button>
        </p>
      ) : null}
      {saveError ? (
        <div role="alert" style={{ ...alertBox, marginBottom: spacing[2] }}>
          <span style={{ flex: 1 }}>{saveError}</span>
          <Button onClick={clearSaveError}>Dismiss</Button>
        </div>
      ) : null}
      {loading ? (
        <SkeletonBlock lines={3} gap={spacing[2]} />
      ) : error ? (
        <div role="alert" style={alertBox}>
          {error}
        </div>
      ) : items.length === 0 ? (
        <p style={{ margin: 0, ...typeScale.caption, color: text.secondary }}>{emptyText}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {items.map((item) => (
            <li key={item.id} style={{ padding: `${spacing[1]}px 0` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button
                  type="button"
                  className="agb-focus-ring agb-hoverable"
                  onClick={() => editor.openEdit(item)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: `${spacing[1]}px ${spacing[2]}px`,
                    border: 0,
                    borderRadius: radius.md,
                    background: "transparent",
                    color: text.primary,
                    textAlign: "left",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    ...localType.ui,
                  }}
                >
                  {label(item)}
                </button>
                <IconButton label={`Edit ${label(item)}`} icon={<Pencil size={14} aria-hidden="true" />} disabled={saving} onClick={() => editor.openEdit(item)} />
                <IconButton
                  label={`Delete ${label(item)}`}
                  icon={<Trash2 size={14} aria-hidden="true" />}
                  tone="destructive"
                  disabled={saving}
                  onClick={() => editor.requestDelete(item)}
                />
              </div>
              {kind.renderPanelDetail ? <div style={{ padding: `0 ${spacing[2]}px` }}>{kind.renderPanelDetail(item)}</div> : null}
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
