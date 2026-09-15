"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { RunSummary } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_VARIANT: Record<RunSummary["status"], string> = {
  succeeded: "text-emerald-400",
  failed: "text-destructive",
  paused: "text-amber-400",
  running: "text-primary",
  queued: "text-muted-foreground",
};

export default function GraphRunsPage({ params }: { params: Promise<{ graphId: string }> }) {
  const { graphId } = use(params);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client
      .listRuns(graphId)
      .then((loaded) => {
        if (!cancelled) setRuns(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [graphId]);

  return (
    <StudioPage>
      <Link
        href="/runs"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "mb-2 w-fit" })}
      >
        &larr; Runs
      </Link>
      <StudioPageHeader
        title="Run history"
        description={<span className="font-mono text-xs">{graphId}</span>}
        loading={loading}
      />
      {error && !loading ? <p className="text-destructive text-sm">{error}</p> : null}
      {!loading && !error ? (
        <>
          <ul className="space-y-3">
            {runs.map((run) => (
              <li key={run.run_id}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="font-mono text-sm">{run.run_id}</CardTitle>
                      <Badge variant="outline" className={STATUS_VARIANT[run.status]}>
                        {run.status}
                      </Badge>
                      {run.provider ? <Badge variant="outline">{run.provider}</Badge> : null}
                    </div>
                  </CardHeader>
                  <CardContent className="text-muted-foreground space-y-1 text-xs">
                    {run.started_at ? <p>Started: {run.started_at}</p> : null}
                    {run.completed_at ? <p>Completed: {run.completed_at}</p> : null}
                    {run.error ? <p className="text-destructive">{run.error}</p> : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          {runs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No runs for this graph yet.</p>
          ) : null}
        </>
      ) : null}
    </StudioPage>
  );
}
