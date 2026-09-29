"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GraphScope } from "@/hooks/use-graph-scope";

const WORKSPACE = "__workspace__";

/** The page-header Scope picker: Workspace, or one graph (use-graph-scope.ts). */
export function ScopeSelect({ scope }: { scope: GraphScope }) {
  const { graphId, graphs, ready, setGraphId } = scope;
  return (
    <div className="flex items-center gap-2">
      <Select value={graphId ?? WORKSPACE} disabled={!ready} onValueChange={(next) => setGraphId(!next || next === WORKSPACE ? null : String(next))}>
        <SelectTrigger aria-label="Scope" size="sm" className="w-56">
          <SelectValue>{(value: string) => (value === WORKSPACE ? "Workspace" : (graphs.find((graph) => graph.id === value)?.name ?? value))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={WORKSPACE}>Workspace</SelectItem>
          {graphs.map((graph) => (
            <SelectItem key={graph.id} value={graph.id}>
              {graph.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {graphId ? (
        <Link
          href={`/graphs/${encodeURIComponent(graphId)}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          aria-label={`Open ${scope.graph?.name ?? graphId}`}
        >
          <ExternalLink className="size-3.5" aria-hidden /> Open
        </Link>
      ) : null}
    </div>
  );
}
