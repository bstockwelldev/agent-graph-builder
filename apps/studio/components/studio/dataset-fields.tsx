"use client";

import { useEffect, useState } from "react";
import type { FixtureDataset, GraphSummary } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { fixturesTextIssue } from "@/lib/datasets";

import { Picker } from "./agent-fields";
import { AreaField } from "./resource-fields";

/** The editor's dataset: fixtures are edited as JSON text and parsed on save. */
export type DatasetForm = FixtureDataset & { fixtures_text?: string };

function useGraphOptions(): GraphSummary[] | null {
  const [graphs, setGraphs] = useState<GraphSummary[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => client.graphs.summaries.list())
      .then(
        (list) => !cancelled && setGraphs([...list]),
        () => !cancelled && setGraphs([]),
      );
    return () => {
      cancelled = true;
    };
  }, []);
  return graphs;
}

/** A dataset's graph (provenance, and where "Open in routing lab" goes), fixtures, and source. */
export function DatasetFields({
  form,
  setForm,
  idPrefix,
}: {
  form: Partial<DatasetForm>;
  setForm: (patch: Partial<DatasetForm>) => void;
  idPrefix: string;
}) {
  const graphs = useGraphOptions();
  const text = form.fixtures_text ?? "[]";
  const issue = fixturesTextIssue(text);
  const options = (graphs ?? []).map((graph) => ({ value: graph.id, label: graph.name }));
  // A stored graph id that no longer exists still shows, so saving doesn't silently drop it.
  if (form.graph_id && graphs && !graphs.some((graph) => graph.id === form.graph_id)) {
    options.push({ value: form.graph_id, label: `${form.graph_id} (missing)` });
  }
  return (
    <>
      <Picker
        id={`${idPrefix}-graph`}
        label="Graph"
        hint="The graph it was captured from, and where “Open in routing lab” goes. Any graph can run any dataset."
        value={form.graph_id}
        onChange={(graph_id) => setForm({ graph_id })}
        options={options}
        noneLabel="No graph"
        loading={graphs === null}
      />
      <AreaField
        id={`${idPrefix}-fixtures`}
        label="Fixtures (JSON)"
        required
        value={text}
        onChange={(fixtures_text) => setForm({ fixtures_text })}
        rows={10}
        mono
        error={issue}
      />
      {issue ? null : (
        <p className="text-muted-foreground -mt-2 text-xs">
          An array of <code>{'{"input": {…}, "node_outputs": {…}, "expected": {…}}'}</code>; node outputs freeze those nodes.
          For scored evals, <code>expected</code> takes <code>output</code>, <code>contains</code>, <code>regex</code>,{" "}
          <code>json_fields</code> and <code>route</code>.
        </p>
      )}
      {form.source === "runs" ? (
        <p className="text-muted-foreground text-xs">
          Captured from {form.source_run_ids?.length ?? 0} run{form.source_run_ids?.length === 1 ? "" : "s"}.
        </p>
      ) : null}
    </>
  );
}
