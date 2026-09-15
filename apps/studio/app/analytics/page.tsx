"use client";

import { useEffect, useState } from "react";
import type { GraphDefinition, RunSummary } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Totals = {
  graphs: number;
  runs: number;
  succeeded: number;
  failed: number;
  paused: number;
};

// Phase 4c stub: a simple aggregation over list_runs_for_graph across all
// graphs, no spend estimation. The full port (estimate-llm-spend.ts
// equivalent, dashboards) is Phase 5 scope per the locked plan.
export default function AnalyticsPage() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const graphs: GraphDefinition[] = await client.listGraphs();
        const runsByGraph = await Promise.all(graphs.map((graph) => client.listRuns(graph.id)));
        const runs: RunSummary[] = runsByGraph.flat();
        if (cancelled) return;
        setTotals({
          graphs: graphs.length,
          runs: runs.length,
          succeeded: runs.filter((run) => run.status === "succeeded").length,
          failed: runs.filter((run) => run.status === "failed").length,
          paused: runs.filter((run) => run.status === "paused").length,
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <StudioPage>
      <StudioPageHeader
        title="Analytics"
        description="Run totals across every graph. Spend estimation and per-graph breakdowns are a later addition."
        loading={loading}
      />
      {error && !loading ? <p className="text-destructive text-sm">{error}</p> : null}
      {totals ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              ["Graphs", totals.graphs],
              ["Total runs", totals.runs],
              ["Succeeded", totals.succeeded],
              ["Failed", totals.failed],
              ["Paused", totals.paused],
            ] as const
          ).map(([label, value]) => (
            <Card key={label}>
              <CardHeader>
                <CardTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wide">
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </StudioPage>
  );
}
