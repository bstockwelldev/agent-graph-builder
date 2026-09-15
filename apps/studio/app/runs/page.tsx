"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GraphDefinition } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { studioResourceCardInteractiveClass } from "@/components/studio/studio-resource-card-actions";
import { cn } from "@/lib/utils";

// AGB has no global cross-graph run feed (GET /api/graphs/{id}/runs is
// per-graph only) — per the locked Phase 4 plan, "Runs" becomes "pick a
// graph, see its runs" rather than a single global list. A true global
// endpoint is a candidate Phase 5+ backend addition.
export default function RunsPage() {
  const [graphs, setGraphs] = useState<GraphDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .listGraphs()
      .then((loaded) => {
        if (!cancelled) setGraphs(loaded);
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
  }, []);

  return (
    <StudioPage>
      <StudioPageHeader
        title="Runs"
        description="Pick a graph to see its run history."
        loading={loading}
      />
      {error && !loading ? <p className="text-destructive text-sm">{error}</p> : null}
      {!loading && !error ? (
        <>
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {graphs.map((graph) => (
              <li key={graph.id}>
                <Card className={cn(studioResourceCardInteractiveClass, "p-0")}>
                  <Link href={`/runs/${graph.id}`} className="block p-6">
                    <CardHeader className="p-0">
                      <CardTitle className="text-base">{graph.name}</CardTitle>
                      <CardDescription className="font-mono text-xs">{graph.id}</CardDescription>
                    </CardHeader>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
          {graphs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No graphs yet.{" "}
              <Link href="/graphs" className={buttonVariants({ variant: "link", className: "h-auto p-0" })}>
                Create one
              </Link>
            </p>
          ) : null}
        </>
      ) : null}
    </StudioPage>
  );
}
