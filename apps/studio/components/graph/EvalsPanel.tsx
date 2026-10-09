import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import type { EvalComparison, EvalRun, EvalSuite, FixtureDataset, ReleaseIndexEntry } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { errorDetail } from "@/lib/apiErrors";
import { DEFAULT_SCORERS, caseVerdict, describeEvalRun, formatDelta, formatScore, formatUsd, scorerLabel } from "@/lib/evals";
import { color, fontFamily, radius, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { PROVIDER_ORDER, providerLabel } from "@/lib/providers";
import { Button } from "./ui/Button";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { PasswordInput, Select, TextInput } from "./ui/fields";

// Scored evals for this graph (backend/app/evals.py): pick a suite, run it
// on Stub (or a live model with a key), read the per-case scores, and
// compare a run with the one before it. Suites are edited on /eval-suites;
// a first one can be made here from a dataset.

const VERDICT_LOOK = {
  pass: { label: "Pass", color: color.success[500] },
  fail: { label: "Fail", color: color.error[500] },
  error: { label: "Error", color: color.warning[500] },
  unscored: { label: "Not scored", color: text.secondary },
} as const;

function newSuiteId(): string {
  return `eval_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

export function EvalsPanel({
  graphId,
  layout = "rail",
  reducedMotion = false,
  onOpenRun,
}: {
  graphId: string | null;
  layout?: "rail" | "drawer";
  reducedMotion?: boolean;
  /** A case's run: open it in the Run panel. */
  onOpenRun?: (runId: string) => void;
}) {
  const [suites, setSuites] = useState<EvalSuite[] | null>(null);
  const [datasets, setDatasets] = useState<FixtureDataset[]>([]);
  const [releases, setReleases] = useState<ReleaseIndexEntry[]>([]);
  const [suiteId, setSuiteId] = useState("");
  const [target, setTarget] = useState("draft");
  const [provider, setProvider] = useState("stub");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<EvalRun[]>([]);
  const [current, setCurrent] = useState<EvalRun | null>(null);
  const [comparison, setComparison] = useState<EvalComparison | null>(null);
  const [newDatasetId, setNewDatasetId] = useState("");

  const loadSuites = useCallback(async (id: string, preferred?: string | null) => {
    try {
      const all = await client.evals.suites.list();
      const mine = all.filter((suite) => suite.graph_id === id);
      setSuites(mine);
      setSuiteId((selected) => {
        if (preferred && mine.some((suite) => suite.id === preferred)) return preferred;
        if (selected && mine.some((suite) => suite.id === selected)) return selected;
        return mine[0]?.id ?? "";
      });
    } catch (err) {
      setSuites([]);
      setError(errorDetail(err));
    }
  }, []);

  useEffect(() => {
    if (!graphId) return;
    const fromUrl = new URLSearchParams(window.location.search).get("suite");
    void loadSuites(graphId, fromUrl);
    client.datasets.list().then(setDatasets, () => setDatasets([]));
    client.releases.list(graphId).then(setReleases, () => setReleases([]));
  }, [graphId, loadSuites]);

  useEffect(() => {
    setCurrent(null);
    setComparison(null);
    if (!suiteId) {
      setHistory([]);
      return;
    }
    client.evals.runs(suiteId).then(
      (runs) => {
        setHistory(runs);
        setCurrent(runs[0] ?? null);
      },
      () => setHistory([]),
    );
  }, [suiteId]);

  const suite = suites?.find((item) => item.id === suiteId) ?? null;
  const live = provider !== "stub";

  async function run() {
    if (!suite) return;
    setRunning(true);
    setError(null);
    setComparison(null);
    try {
      const result = await client.evals.run(suite.id, {
        target,
        provider,
        model: live && model.trim() ? model.trim() : undefined,
        apiKey: live && apiKey.trim() ? apiKey.trim() : undefined,
      });
      setCurrent(result);
      setHistory((runs) => [result, ...runs]);
    } catch (err) {
      setError(errorDetail(err));
    } finally {
      setRunning(false);
    }
  }

  async function compareWithPrevious(candidate: EvalRun) {
    const index = history.findIndex((item) => item.id === candidate.id);
    const baseline = history[index + 1];
    if (!baseline) return;
    try {
      setComparison(await client.evals.compare(baseline.id, candidate.id));
    } catch (err) {
      setError(errorDetail(err));
    }
  }

  async function createSuite() {
    if (!graphId || !newDatasetId) return;
    const dataset = datasets.find((item) => item.id === newDatasetId);
    const now = new Date().toISOString();
    try {
      const created = await client.evals.suites.create({
        id: newSuiteId(),
        name: dataset ? `${dataset.name} eval` : "Eval suite",
        graph_id: graphId,
        dataset_id: newDatasetId,
        scorers: DEFAULT_SCORERS.map((kind) => ({ kind, weight: 1, args: {} })),
        pass_threshold: 1,
        created_at: now,
        updated_at: now,
      });
      await loadSuites(graphId, created.id);
    } catch (err) {
      setError(errorDetail(err));
    }
  }

  return (
    <div style={containerStyle(layout)}>
      <div style={scrollerStyle}>
        <CollapsibleSection sectionId="evals-run" title="Run a suite" defaultOpen reducedMotion={reducedMotion}>
          {suites === null ? (
            <div role="status" style={captionStyle}>
              Loading suites…
            </div>
          ) : suites.length === 0 ? (
            <div>
              <p style={{ ...captionStyle, marginTop: 0 }}>
                No eval suites for this graph. Pick a dataset whose fixtures have <code style={monoStyle}>expected</code> fields to
                start one, or manage suites on <a href="/eval-suites" style={linkStyle}>Eval suites</a>.
              </p>
              <label style={labelStyle}>
                Dataset
                <Select value={newDatasetId} onChange={(event) => setNewDatasetId(event.target.value)}>
                  <option value="">Choose a dataset</option>
                  {datasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name} ({dataset.fixtures.length})
                    </option>
                  ))}
                </Select>
              </label>
              <Button variant="primary" disabled={!newDatasetId} onClick={() => void createSuite()} style={{ marginTop: spacing[2] }}>
                Create suite
              </Button>
            </div>
          ) : (
            <>
              <label style={labelStyle}>
                Suite
                <Select value={suiteId} onChange={(event) => setSuiteId(event.target.value)}>
                  {suites.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </label>
              {suite && (
                <div style={{ ...captionStyle, marginBottom: spacing[2] }}>
                  {(suite.scorers ?? []).map((scorer) => scorerLabel(scorer.kind)).join(" · ")} · pass at {formatScore(suite.pass_threshold ?? 1)} ·{" "}
                  <a href={`/eval-suites`} style={linkStyle}>
                    Edit suites
                  </a>
                </div>
              )}
              <label style={labelStyle}>
                Target
                <Select value={target} onChange={(event) => setTarget(event.target.value)}>
                  <option value="draft">Saved draft</option>
                  {releases.map((release) => (
                    <option key={release.release_id} value={release.release_id}>
                      Release {release.release_id}
                    </option>
                  ))}
                </Select>
              </label>
              <label style={labelStyle}>
                Provider
                <Select value={provider} onChange={(event) => setProvider(event.target.value)}>
                  {PROVIDER_ORDER.map((item) => (
                    <option key={item} value={item}>
                      {providerLabel(item)}
                    </option>
                  ))}
                </Select>
              </label>
              {live && (
                <>
                  <label style={labelStyle}>
                    Model (optional)
                    <TextInput value={model} onChange={(event) => setModel(event.target.value)} placeholder="Provider default" />
                  </label>
                  <label style={labelStyle}>
                    API key
                    <PasswordInput value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" />
                  </label>
                  <p role="note" style={{ ...captionStyle, color: color.warning[500] }}>
                    Live runs call the model once per fixture (up to 50) and are billed by the provider. The key is used for this run
                    only and never stored. Estimated cost shows with the results.
                  </p>
                </>
              )}
              <Button variant="primary" disabled={!suite || running} onClick={() => void run()} style={{ minHeight: shell.touchTarget.min }}>
                {running ? "Running…" : "Run suite"}
              </Button>
            </>
          )}
          {error && (
            <div role="alert" style={{ ...captionStyle, color: color.warning[500], marginTop: spacing[2] }}>
              {error}
            </div>
          )}
        </CollapsibleSection>

        {current && (
          <CollapsibleSection sectionId="evals-results" title="Results" defaultOpen reducedMotion={reducedMotion}>
            <div role="status" aria-label="Eval result" style={{ ...typeScale.caption, marginBottom: spacing[2] }}>
              <strong style={{ fontSize: 16 }}>{formatScore(current.score)}</strong> · pass rate {formatScore(current.pass_rate)} · est.{" "}
              {formatUsd(current.estimated_usd)}
              {current.partial ? " · stopped early" : ""}
            </div>
            <table aria-label="Eval cases" style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Case</th>
                  <th style={thStyle}>Result</th>
                  <th style={thStyle}>Score</th>
                  <th style={thStyle}>Why</th>
                </tr>
              </thead>
              <tbody>
                {(current.cases ?? []).map((item) => {
                  const verdict = VERDICT_LOOK[caseVerdict(item)];
                  const why = item.error || (item.scores ?? []).filter((score) => !score.passed).map((score) => `${scorerLabel(score.scorer)}: ${score.detail || "failed"}`).join("; ");
                  return (
                    <tr key={item.fixture_index}>
                      <td style={tdStyle}>
                        {item.run_id && onOpenRun ? (
                          <button type="button" className="agb-focus-ring agb-hoverable" onClick={() => onOpenRun(item.run_id!)} style={linkButtonStyle} aria-label={`Open the run for case ${item.fixture_index + 1}`}>
                            #{item.fixture_index + 1}
                          </button>
                        ) : (
                          `#${item.fixture_index + 1}`
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: verdict.color, fontWeight: 600 }}>{verdict.label}</td>
                      <td style={{ ...tdStyle, ...monoStyle }}>{formatScore(item.score)}</td>
                      <td style={{ ...tdStyle, color: text.secondary, overflowWrap: "anywhere" }}>{why || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CollapsibleSection>
        )}

        {history.length > 0 && (
          <CollapsibleSection sectionId="evals-history" title={`History (${history.length})`} defaultOpen reducedMotion={reducedMotion}>
            <ul aria-label="Eval runs" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: spacing[1] }}>
              {history.map((item, index) => (
                <li key={item.id} style={{ ...typeScale.caption, display: "flex", gap: spacing[2], alignItems: "center" }}>
                  <button
                    type="button"
                    className="agb-focus-ring agb-hoverable"
                    aria-pressed={current?.id === item.id}
                    onClick={() => {
                      setCurrent(item);
                      setComparison(null);
                    }}
                    style={{ ...linkButtonStyle, flex: 1, textAlign: "left", fontWeight: current?.id === item.id ? 600 : 400 }}
                  >
                    {describeEvalRun(item)}
                  </button>
                  {index < history.length - 1 && (
                    <Button variant="ghost" onClick={() => void compareWithPrevious(item)} aria-label={`Compare ${item.id} with the run before`}>
                      Compare
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {comparison && (
              <div role="region" aria-label="Eval comparison" style={{ ...rowStyle, marginTop: spacing[2] }}>
                <div style={{ ...typeScale.caption, fontWeight: 600 }}>
                  Score {formatDelta(comparison.score_delta)} · pass rate {formatDelta(comparison.pass_rate_delta)}
                </div>
                {(comparison.cases ?? [])
                  .filter((item) => item.delta !== 0)
                  .map((item) => (
                    <div key={item.fixture_index} style={{ ...captionStyle, marginTop: spacing[1] }}>
                      #{item.fixture_index + 1}: {formatScore(item.baseline_score)} → {formatScore(item.candidate_score)} ({formatDelta(item.delta)})
                    </div>
                  ))}
              </div>
            )}
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

const containerStyle = (layout: "rail" | "drawer"): CSSProperties => ({
  width: "100%",
  height: layout === "rail" ? "100%" : "auto",
  minHeight: 0,
  borderLeft: layout === "drawer" ? undefined : `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.primary,
  display: "flex",
  flexDirection: "column",
  overflow: layout === "rail" ? "hidden" : "visible",
});

const scrollerStyle: CSSProperties = { padding: shell.panelPadding, flex: 1, minHeight: 0, overflowY: "auto" };
const captionStyle: CSSProperties = { ...typeScale.caption, color: text.secondary, lineHeight: "16px" };
const monoStyle: CSSProperties = { fontFamily: fontFamily.mono };
const linkStyle: CSSProperties = { color: color.primary[500], textDecoration: "underline", textUnderlineOffset: 2 };
const labelStyle: CSSProperties = { ...typeScale.caption, display: "grid", gap: 4, marginBottom: spacing[2] };
const linkButtonStyle: CSSProperties = { background: "none", border: "none", padding: 0, color: color.primary[500], cursor: "pointer", font: "inherit" };
const rowStyle: CSSProperties = {
  padding: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
};
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", ...typeScale.caption };
const thStyle: CSSProperties = { textAlign: "left", fontWeight: 600, padding: "4px 6px", borderBottom: `1px solid ${surface.border}`, color: text.secondary };
const tdStyle: CSSProperties = { padding: "4px 6px", borderBottom: `1px solid ${surface.border}`, verticalAlign: "top" };
