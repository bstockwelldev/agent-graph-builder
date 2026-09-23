"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Workflow } from "lucide-react";
import type { ResourceUsage } from "@bstockwelldev/agent-graph-sdk";

import { useWorkbench } from "@/components/workbench/WorkbenchProvider";

const FIELD_LABEL: Record<string, string> = {
  promptId: "prompt template",
  systemPromptId: "system prompt",
  llmProfileId: "model",
  toolName: "tool",
};

/**
 * "Used by" for a registry resource (studio-graph-workbench-redesign-plan.md,
 * Wave 4a / STO-605): every graph node bound to it, from
 * `GET /api/{kind}/{id}/usages`. A node in the open graph is focused in
 * place; a node elsewhere opens that graph with the node selected.
 */
export function ResourceUsageList({
  resourceId,
  loadUsages,
  onNavigate,
}: {
  resourceId: string;
  loadUsages: (id: string) => Promise<ResourceUsage[]>;
  /** Called after a row navigates (e.g. to close the editor dialog). */
  onNavigate?: () => void;
}) {
  const [usages, setUsages] = useState<ResourceUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workbench = useWorkbench();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    setUsages(null);
    setError(null);
    loadUsages(resourceId)
      .then((rows) => {
        if (!cancelled) setUsages(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [loadUsages, resourceId]);

  const open = (usage: ResourceUsage) => {
    const graph = workbench.graphContext;
    onNavigate?.();
    if (graph && graph.graphId === usage.graph_id && graph.focusNode) {
      workbench.close();
      graph.focusNode(usage.node_id, "configure");
    } else {
      router.push(`/graphs/${encodeURIComponent(usage.graph_id)}?node=${encodeURIComponent(usage.node_id)}`);
    }
  };

  return (
    <section aria-label="Used by" className="space-y-1.5">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Used by{usages ? ` · ${usages.length}` : ""}
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : usages === null ? (
        <div className="agb-skeleton h-8 w-full rounded" />
      ) : usages.length === 0 ? (
        <p className="text-muted-foreground text-xs">Not used by any graph yet.</p>
      ) : (
        <ul className="space-y-1">
          {usages.map((usage) => (
            <li key={`${usage.graph_id}:${usage.node_id}:${usage.field}`}>
              <button
                type="button"
                onClick={() => open(usage)}
                className="hover:bg-accent/60 focus-visible:ring-ring flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs outline-none focus-visible:ring-2"
              >
                <Workflow className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{usage.graph_name}</span>
                  <span className="text-muted-foreground block truncate">
                    {usage.node_id} · {FIELD_LABEL[usage.field] ?? usage.field}
                    {usage.via ? ` · via ${usage.via.replace(/^tools:/, "tool ")}` : ""}
                  </span>
                </span>
                <ArrowUpRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
