"use client";

import { useCallback, useState } from "react";
import type { ResourceVersionIndexEntry } from "@bstockwelldev/agent-graph-sdk";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// P1 rollout plan, parallel track ("Versioned reusable entity registry" —
// docs/planning/features/p1-rollout-plan.md). Shared across the five
// versionable resource pages (prompts/tools/mcp/agents/llm-profiles): a
// "Publish version" action plus a compact history list, wired to each
// page's `client.<kind>.versions` sub-client (backend/app/resource_versions.py).
// Not shown for a resource still being created (there's nothing to
// version until the first save).
type VersionsClient = {
  publish: (resourceId: string) => Promise<{ created: boolean }>;
  list: (resourceId: string) => Promise<ResourceVersionIndexEntry[]>;
};

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ResourceVersionHistory({
  resourceId,
  versionsClient,
}: {
  resourceId: string;
  versionsClient: VersionsClient;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<ResourceVersionIndexEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPublishCreated, setLastPublishCreated] = useState<boolean | null>(null);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await versionsClient.list(resourceId);
      setVersions([...loaded].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [resourceId, versionsClient]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next && versions === null) void loadVersions();
    },
    [loadVersions, versions],
  );

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    setError(null);
    try {
      const result = await versionsClient.publish(resourceId);
      setLastPublishCreated(result.created);
      await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }, [loadVersions, resourceId, versionsClient]);

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className="space-y-2">
      <div className="flex items-center justify-between">
        <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" />}>
          {open ? "Hide version history" : "Version history"}
        </CollapsibleTrigger>
        <Button type="button" variant="outline" size="sm" disabled={publishing} onClick={() => void handlePublish()}>
          {publishing ? "Publishing…" : "Publish version"}
        </Button>
      </div>
      {lastPublishCreated !== null && (
        <p className="text-muted-foreground text-xs">
          {lastPublishCreated ? "New version published." : "Already up to date — no changes since the last version."}
        </p>
      )}
      <CollapsibleContent className="space-y-1.5">
        {loading ? (
          <p className="text-muted-foreground text-xs">Loading…</p>
        ) : error ? (
          <p className="text-destructive text-xs">{error}</p>
        ) : !versions || versions.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No versions yet. Publish one to snapshot the current saved state.
          </p>
        ) : (
          <ul className="space-y-1">
            {versions.map((version) => (
              <li key={version.version_id} className="text-muted-foreground flex justify-between gap-2 text-xs">
                <span className="font-mono">{version.fingerprint.slice(0, 10)}</span>
                <span>{formatTimestamp(version.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
