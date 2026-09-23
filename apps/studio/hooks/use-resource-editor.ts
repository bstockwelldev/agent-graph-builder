"use client";

import { useEffect, useState } from "react";

import type { AnyResourceKind, ResourceLike } from "@/components/studio/resource-kinds";
import type { ResourceEditorTab } from "@/components/studio/resource-editor-dialog";
import { useResourceList } from "@/hooks/use-resource-list";

/** "Used by 2 nodes in 1 graph", or null when unused / unknown. */
export function usageWarning(usages: { graph_id: string }[] | null): string | null {
  if (!usages || usages.length === 0) return null;
  const graphs = new Set(usages.map((usage) => usage.graph_id)).size;
  const nodes = usages.length;
  return `Used by ${nodes} node${nodes === 1 ? "" : "s"} in ${graphs} graph${graphs === 1 ? "" : "s"}; they will fail validation until rebound.`;
}

/**
 * Editor + delete state for one resource kind (Wave 4b), shared by the full
 * resource page and the workbench panel so both behave identically: list via
 * useResourceList, the open editor's form, save/delete, and the usage
 * warning shown before deleting something graphs still reference.
 */
export function useResourceEditor(kind: AnyResourceKind) {
  const list = useResourceList<ResourceLike>(kind.client);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceLike | null>(null);
  const [form, setFormState] = useState<Record<string, unknown>>({});
  const [initialTab, setInitialTab] = useState<ResourceEditorTab>("overview");
  const [deleteTarget, setDeleteTarget] = useState<ResourceLike | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  const setForm = (patch: Record<string, unknown>) => setFormState((prev) => ({ ...prev, ...patch }));

  const openCreate = () => {
    list.clearSaveError();
    setEditing(null);
    setInitialTab("overview");
    setFormState(kind.emptyForm());
    setEditorOpen(true);
  };

  const openEdit = (item: ResourceLike, tab: ResourceEditorTab = "overview") => {
    list.clearSaveError();
    setEditing(item);
    setInitialTab(tab);
    setFormState(kind.toForm ? kind.toForm(item) : { ...item });
    setEditorOpen(true);
  };

  const save = async () => {
    const normalized = kind.normalize(form);
    if (!normalized) return;
    await list.save(normalized, !editing);
    setEditorOpen(false);
  };

  const requestDelete = (item: ResourceLike) => {
    list.clearSaveError();
    setDeleteTarget(item);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await list.remove(deleteTarget.id);
    setDeleteTarget(null);
  };

  useEffect(() => {
    setDeleteWarning(null);
    if (!deleteTarget || !kind.client.usages) return;
    let cancelled = false;
    kind.client
      .usages(deleteTarget.id)
      .then((usages) => {
        if (!cancelled) setDeleteWarning(usageWarning(usages));
      })
      .catch(() => {
        // The warning is advisory; delete still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, [deleteTarget, kind]);

  const deleteDescription = deleteTarget
    ? [kind.deleteDescription(deleteTarget), deleteWarning].filter(Boolean).join(" ")
    : "";

  return {
    ...list,
    editorOpen,
    setEditorOpen,
    editing,
    form,
    setForm,
    initialTab,
    openCreate,
    openEdit,
    save,
    deleteTarget,
    setDeleteTarget,
    requestDelete,
    confirmDelete,
    deleteDescription,
  };
}
