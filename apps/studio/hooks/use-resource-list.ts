"use client";

import { useCallback, useEffect, useState } from "react";
import { emitResourceChanged } from "@/lib/resourceEvents";

type ResourceClient<T extends { id: string }> = {
  list: () => Promise<T[]>;
  create: (resource: T) => Promise<T>;
  update: (resource: T) => Promise<T>;
  delete: (id: string) => Promise<{ deleted: boolean }>;
};

/**
 * Generic CRUD list state for one of the studio's stored resource kinds
 * (prompts/tools/mcp servers/agents/llm profiles). Replaces MUI's
 * whole-document useStudioApi() + local array-splicing per page — each
 * resource kind now has its own SDK-backed CRUD route (studio-consolidation
 * Phase 3), so there is no shared document to read-modify-write.
 */
export function useResourceList<T extends { id: string }>(resourceClient: ResourceClient<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await resourceClient.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [resourceClient]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const save = useCallback(
    async (resource: T, isNew: boolean) => {
      setSaving(true);
      setSaveError(null);
      try {
        const saved = isNew
          ? await resourceClient.create(resource)
          : await resourceClient.update(resource);
        setItems((prev) => {
          const exists = prev.some((item) => item.id === saved.id);
          return exists
            ? prev.map((item) => (item.id === saved.id ? saved : item))
            : [...prev, saved];
        });
        // Wave 4a: nodes bound to this resource show its live content.
        emitResourceChanged();
        return saved;
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [resourceClient],
  );

  const remove = useCallback(
    async (id: string) => {
      setSaving(true);
      setSaveError(null);
      try {
        await resourceClient.delete(id);
        setItems((prev) => prev.filter((item) => item.id !== id));
        emitResourceChanged();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [resourceClient],
  );

  return {
    items,
    loading,
    error,
    refetch,
    save,
    remove,
    saving,
    saveError,
    clearSaveError: () => setSaveError(null),
  };
}
