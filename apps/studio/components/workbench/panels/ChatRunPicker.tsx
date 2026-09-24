"use client";

import { useEffect, useState } from "react";
import type { GraphDefinition, ReleaseIndexEntry } from "@bstockwelldev/agent-graph-sdk";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { client } from "@/lib/api-client";
import { graphInputVariables, type RunTarget } from "@/lib/chatRuns";

const DRAFT = "__draft__";
const LATEST = "__latest__";

/**
 * Explicit "Run a graph" picker in the chat composer (STO-600): graph,
 * version (the saved draft, the latest release, or a specific release) and
 * one field per input variable. Submits a RunTarget; ChatPanel decides
 * whether it needs a confirm step.
 */
export function ChatRunPicker({
  graphs,
  defaultGraphId,
  onSubmit,
  onCancel,
}: {
  graphs: GraphDefinition[];
  defaultGraphId?: string | null;
  onSubmit: (target: RunTarget) => void;
  onCancel: () => void;
}) {
  const [graphId, setGraphId] = useState<string>(
    (defaultGraphId && graphs.some((graph) => graph.id === defaultGraphId) ? defaultGraphId : graphs[0]?.id) ?? "",
  );
  const [version, setVersion] = useState<string>(DRAFT);
  const [releases, setReleases] = useState<ReleaseIndexEntry[]>([]);
  const [input, setInput] = useState<Record<string, string>>({});
  const graph = graphs.find((candidate) => candidate.id === graphId) ?? null;
  const variables = graph ? graphInputVariables(graph) : [];

  useEffect(() => {
    setVersion(DRAFT);
    setReleases([]);
    if (!graphId) return;
    let cancelled = false;
    client
      .releases.list(graphId)
      .then((list) => {
        if (!cancelled) setReleases([...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
      })
      .catch(() => {
        // No releases (or unreachable): the draft is still runnable.
      });
    return () => {
      cancelled = true;
    };
  }, [graphId]);

  return (
    <form
      aria-label="Run a graph"
      className="bg-card mx-3 mb-2 space-y-2 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!graph) return;
        const release = version === DRAFT ? null : version === LATEST ? "latest" : version;
        const filled = Object.fromEntries(variables.map((name) => [name, input[name] ?? ""]));
        onSubmit({ graph, release, input: filled, inferred: false });
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="chat-run-graph" className="text-xs">
            Graph
          </Label>
          <Select
            value={graphId}
            onValueChange={(value) => value && setGraphId(value)}
            items={Object.fromEntries(graphs.map((candidate) => [candidate.id, candidate.name]))}
          >
            <SelectTrigger id="chat-run-graph" className="h-8 w-full text-xs">
              <SelectValue placeholder="Choose a graph" />
            </SelectTrigger>
            <SelectContent>
              {graphs.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="chat-run-version" className="text-xs">
            Version
          </Label>
          <Select
            value={version}
            onValueChange={(value) => value && setVersion(value)}
            items={{
              [DRAFT]: "Draft (saved)",
              [LATEST]: "Latest release",
              ...Object.fromEntries(releases.map((release) => [release.release_id, release.release_id])),
            }}
          >
            <SelectTrigger id="chat-run-version" className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DRAFT}>Draft (saved)</SelectItem>
              {releases.length > 0 ? <SelectItem value={LATEST}>Latest release</SelectItem> : null}
              {releases.map((release) => (
                <SelectItem key={release.release_id} value={release.release_id}>
                  {release.release_id} · {new Date(release.created_at).toLocaleDateString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {variables.map((name) => (
        <div key={name} className="space-y-1">
          <Label htmlFor={`chat-run-input-${name}`} className="font-mono text-xs">
            {name}
          </Label>
          <Input
            id={`chat-run-input-${name}`}
            className="h-8 text-xs"
            value={input[name] ?? ""}
            onChange={(event) => setInput((current) => ({ ...current, [name]: event.target.value }))}
          />
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant="synth" className="h-7 text-xs" disabled={!graph}>
          {version === DRAFT ? "Run draft" : "Review & run"}
        </Button>
      </div>
    </form>
  );
}
