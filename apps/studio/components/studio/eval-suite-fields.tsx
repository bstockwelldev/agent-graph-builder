"use client";

import { useEffect, useState } from "react";
import type { EvalSuite, FixtureDataset, GraphSummary } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { EVAL_SCORERS, suiteScorerKinds, type EvalScorerKind } from "@/lib/evals";

import { Picker } from "./agent-fields";
import { CheckField, TextField } from "./resource-fields";

/** The editor's suite: the threshold is edited as a percentage string. */
export type EvalSuiteForm = EvalSuite & { threshold_text?: string };

function useOptions<T>(load: () => Promise<readonly T[]>): T[] | null {
  const [items, setItems] = useState<T[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(load)
      .then(
        (list) => !cancelled && setItems([...list]),
        () => !cancelled && setItems([]),
      );
    return () => {
      cancelled = true;
    };
    // Loaded once per editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return items;
}

/** "80" -> 0.8; null when it isn't a percentage. */
export function thresholdFromText(text: string | undefined): number | null {
  const value = Number((text ?? "").trim());
  return (text ?? "").trim() !== "" && Number.isFinite(value) && value >= 0 && value <= 100 ? value / 100 : null;
}

/** An eval suite's graph, dataset, scorers and pass mark. */
export function EvalSuiteFields({
  form,
  setForm,
  idPrefix,
}: {
  form: Partial<EvalSuiteForm>;
  setForm: (patch: Partial<EvalSuiteForm>) => void;
  idPrefix: string;
}) {
  const graphs = useOptions<GraphSummary>(() => client.graphs.summaries.list());
  const datasets = useOptions<FixtureDataset>(() => client.datasets.list());
  const kinds = suiteScorerKinds({ scorers: form.scorers });
  const toggle = (kind: EvalScorerKind, on: boolean) => {
    const next = on ? [...kinds, kind] : kinds.filter((item) => item !== kind);
    // Keep the registry's order, and any weights already set.
    const weights = new Map((form.scorers ?? []).map((scorer) => [scorer.kind, scorer]));
    setForm({
      scorers: EVAL_SCORERS.filter((scorer) => next.includes(scorer.kind)).map((scorer) => weights.get(scorer.kind) ?? { kind: scorer.kind, weight: 1, args: {} }),
    });
  };
  const thresholdError = thresholdFromText(form.threshold_text) === null ? "A percentage from 0 to 100." : null;
  return (
    <>
      <Picker
        id={`${idPrefix}-graph`}
        label="Graph"
        required
        value={form.graph_id}
        onChange={(graph_id) => setForm({ graph_id: graph_id ?? "" })}
        options={(graphs ?? []).map((graph) => ({ value: graph.id, label: graph.name }))}
        loading={graphs === null}
      />
      <Picker
        id={`${idPrefix}-dataset`}
        label="Dataset"
        hint="Its fixtures are the cases; each fixture's expected fields are what gets checked."
        required
        value={form.dataset_id}
        onChange={(dataset_id) => setForm({ dataset_id: dataset_id ?? "" })}
        options={(datasets ?? []).map((dataset) => ({ value: dataset.id, label: `${dataset.name} (${dataset.fixtures.length})` }))}
        loading={datasets === null}
      />
      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-sm leading-none font-medium">Scorers</legend>
        {EVAL_SCORERS.map((scorer) => (
          <div key={scorer.kind}>
            <CheckField
              id={`${idPrefix}-scorer-${scorer.kind}`}
              label={`${scorer.label}: ${scorer.checks}`}
              checked={kinds.includes(scorer.kind)}
              onChange={(on) => toggle(scorer.kind, on)}
            />
          </div>
        ))}
      </fieldset>
      <TextField
        id={`${idPrefix}-threshold`}
        label="Pass mark (%)"
        required
        value={form.threshold_text ?? ""}
        onChange={(threshold_text) => setForm({ threshold_text })}
        error={thresholdError}
        hint="A case passes when its weighted score reaches this."
      />
    </>
  );
}
