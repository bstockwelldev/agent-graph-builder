"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Diagnostic, GraphDefinition, GraphNode, ReleaseIndexEntry } from "@bstockwelldev/agent-graph-sdk";
import { runInputVariables } from "@bstockwelldev/agent-graph-sdk/graph";

import { client } from "@/lib/api-client";
import { color, spacing, text, typeScale } from "@/lib/graph-theme";
import { referenceableGraphs, setMappingRow } from "@/lib/subgraphs";
import { Combobox, type ComboboxOption } from "./ui/Combobox";
import { Field } from "./ui/Field";
import { Group } from "./ui/Group";
import { TemplateEditor } from "./ui/TemplateEditor";

/**
 * Configure tab for a `subgraph` node (large-graph complexity, Wave 7c /
 * STO-612): which graph it runs, which version, and how the parent's
 * values map onto the child's input variables.
 */
export function SubgraphConfig({
  node,
  graphId,
  set,
  fieldIssues,
  variables,
}: {
  node: GraphNode;
  graphId: string | null;
  set: (key: string, value: unknown) => void;
  fieldIssues: (key: string) => Diagnostic[];
  variables: readonly string[];
}) {
  const graphs = useGraphList();
  const targetId = typeof node.config.graphId === "string" ? node.config.graphId : "";
  const version = typeof node.config.version === "string" && node.config.version ? node.config.version : "latest";
  const mapping = (node.config.inputMapping ?? undefined) as Record<string, string> | undefined;
  const releases = useReleases(targetId);
  const child = graphs?.find((graph) => graph.id === targetId);

  const graphOptions = useMemo<ComboboxOption[]>(() => {
    const safe = referenceableGraphs(graphs ?? [], graphId ?? "");
    const options: ComboboxOption[] = safe.map((graph) => ({ value: graph.id, label: graph.name, description: graph.id }));
    // Keep a now-cyclic current target visible (by name) instead of a bare id.
    const current = graphs?.find((graph) => graph.id === targetId);
    if (current && !safe.includes(current)) {
      options.unshift({ value: current.id, label: current.name, description: "Leads back to this graph" });
    }
    return options;
  }, [graphs, graphId, targetId]);
  const versionOptions: ComboboxOption[] = [
    { value: "latest", label: "Latest release", description: "Falls back to the saved draft until the graph is published" },
    { value: "draft", label: "Draft", description: "Always the saved draft — can't be published" },
    ...releases.map((release) => ({ value: release.release_id, label: release.release_id, description: release.created_at, group: "Pinned release" })),
  ];
  const inputs = child ? runInputVariables(child.nodes) : [];

  return (
    <Group title="Subgraph">
      <Field label="Graph" hint="Runs this saved graph as a nested run and outputs its result." issues={fieldIssues("graphId")}>
        {(id) => (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Combobox id={id} aria-label="Graph" value={targetId} options={graphOptions} onChange={(v) => set("graphId", v)} searchPlaceholder="Search graphs…" />
            </div>
            {targetId && (
              <a href={`/graphs/${encodeURIComponent(targetId)}`} className="agb-focus-ring agb-hoverable" style={linkStyle} aria-label="Open graph" title="Open graph">
                <ExternalLink size={15} />
              </a>
            )}
          </div>
        )}
      </Field>
      <Field label="Version" hint="Publishing this graph freezes the exact child release it uses." issues={fieldIssues("version")}>
        {(id) => <Combobox id={id} aria-label="Version" value={version} options={versionOptions} onChange={(v) => set("version", v)} />}
      </Field>
      {child && (
        <Field
          label="Inputs"
          hint={`Leave empty to pass the upstream output to ${inputs[0]}. Templates can use {upstream} and this graph's variables.`}
          issues={fieldIssues("inputMapping")}
        >
          <div style={{ display: "grid", gap: spacing[2] }} role="group" aria-label="Input mapping">
            {inputs.map((variable, index) => (
              <div key={variable}>
                <div style={{ ...typeScale.caption, color: text.secondary, marginBottom: 2 }}>
                  {variable}
                  {!mapping && index === 0 && <span style={{ color: color.primary[500] }}> ← upstream</span>}
                </div>
                <TemplateEditor
                  id={`subgraph-input-${node.id}-${variable}`}
                  aria-label={`Input ${variable}`}
                  value={mapping?.[variable] ?? ""}
                  onChange={(value) => set("inputMapping", setMappingRow(mapping, variable, value))}
                  variables={[...new Set([...variables, "upstream"])]}
                  rows={1}
                />
              </div>
            ))}
          </div>
        </Field>
      )}
    </Group>
  );
}

function useGraphList(): GraphDefinition[] | null {
  const [graphs, setGraphs] = useState<GraphDefinition[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    client
      .graphs.list()
      .then((list) => {
        if (!cancelled) setGraphs(list);
      })
      .catch(() => {
        if (!cancelled) setGraphs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return graphs;
}

function useReleases(graphId: string): ReleaseIndexEntry[] {
  const [releases, setReleases] = useState<ReleaseIndexEntry[]>([]);
  useEffect(() => {
    if (!graphId) {
      setReleases([]);
      return;
    }
    let cancelled = false;
    client
      .releases.list(graphId)
      .then((list) => {
        if (!cancelled) setReleases(list);
      })
      .catch(() => {
        if (!cancelled) setReleases([]);
      });
    return () => {
      cancelled = true;
    };
  }, [graphId]);
  return releases;
}

const linkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  flexShrink: 0,
  color: text.secondary,
  borderRadius: 8,
} as const;
