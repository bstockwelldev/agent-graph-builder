"use client";

import { useState, type CSSProperties } from "react";
import type { GraphSummary, ReleaseIndexEntry } from "@bstockwelldev/agent-graph-sdk";
import { useReleases } from "@bstockwelldev/agent-graph-sdk/react";

import { Button } from "@/components/graph/ui/Button";
import { Combobox } from "@/components/graph/ui/Combobox";
import { Field } from "@/components/graph/ui/Field";
import { TextInput } from "@/components/graph/ui/fields";
import { fontFamily, localType, radius, spacing, surface, text } from "@/lib/graph-theme";
import type { RunTarget } from "@/lib/chatRuns";

const DRAFT = "__draft__";
const LATEST = "__latest__";

/**
 * Explicit "Run a graph" picker in the chat composer (STO-600): graph,
 * version (the saved draft, the latest release, or a specific release) and
 * one field per input variable. Submits a RunTarget; ChatPanel decides
 * whether it needs a confirm step.
 *
 * Token-styled (apps/studio/AGENTS.md): the chat panel lives on the
 * token-styled graph canvas, so it uses graph-theme tokens, not Tailwind.
 */
export function ChatRunPicker({
  graphs,
  defaultGraphId,
  onSubmit,
  onCancel,
}: {
  graphs: GraphSummary[];
  defaultGraphId?: string | null;
  onSubmit: (target: RunTarget) => void;
  onCancel: () => void;
}) {
  const [graphId, setGraphId] = useState<string>(
    (defaultGraphId && graphs.some((graph) => graph.id === defaultGraphId) ? defaultGraphId : graphs[0]?.id) ?? "",
  );
  const [version, setVersion] = useState<string>(DRAFT);
  const [input, setInput] = useState<Record<string, string>>({});
  const graph = graphs.find((candidate) => candidate.id === graphId) ?? null;
  const variables = graph ? graph.input_variables : [];

  // Newest first. No releases (or unreachable): the draft is still runnable.
  const releases = useReleases(graphId, { select: newestFirst }).data ?? [];

  const formStyle: CSSProperties = {
    margin: `0 ${spacing[3]}px ${spacing[2]}px`,
    display: "flex",
    flexDirection: "column",
    gap: spacing[2],
    borderRadius: radius.lg,
    border: `1px solid ${surface.border}`,
    background: surface.card,
    padding: spacing[3],
    ...localType.ui,
    color: text.primary,
  };

  return (
    <form
      aria-label="Run a graph"
      style={formStyle}
      onSubmit={(event) => {
        event.preventDefault();
        if (!graph) return;
        const release = version === DRAFT ? null : version === LATEST ? "latest" : version;
        const filled = Object.fromEntries(variables.map((name) => [name, input[name] ?? ""]));
        onSubmit({ graph, release, input: filled, inferred: false });
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: spacing[2] }}>
        <Field label="Graph">
          {(id) => (
            <Combobox
              id={id}
              aria-label="Graph"
              value={graphId}
              options={graphs.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
              onChange={(value) => {
                if (!value) return;
                setGraphId(value);
                setVersion(DRAFT);
              }}
              placeholder="Choose a graph"
            />
          )}
        </Field>
        <Field label="Version">
          {(id) => (
            <Combobox
              id={id}
              aria-label="Version"
              value={version}
              options={[
                { value: DRAFT, label: "Draft (saved)" },
                ...(releases.length > 0 ? [{ value: LATEST, label: "Latest release" }] : []),
                ...releases.map((release) => ({
                  value: release.release_id,
                  label: `${release.release_id} · ${new Date(release.created_at).toLocaleDateString()}`,
                })),
              ]}
              onChange={(value) => value && setVersion(value)}
            />
          )}
        </Field>
      </div>
      {variables.map((name) => (
        <Field key={name} label={<span style={{ fontFamily: fontFamily.mono }}>{name}</span>}>
          {(id) => (
            <TextInput
              id={id}
              value={input[name] ?? ""}
              onChange={(event) => setInput((current) => ({ ...current, [name]: event.target.value }))}
            />
          )}
        </Field>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: spacing[2] }}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!graph}>
          {version === DRAFT ? "Run draft" : "Review & run"}
        </Button>
      </div>
    </form>
  );
}

function newestFirst(list: ReleaseIndexEntry[]): ReleaseIndexEntry[] {
  return [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
