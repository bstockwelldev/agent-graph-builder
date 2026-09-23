import type { CSSProperties } from "react";
import { useState } from "react";
import type { CounterfactualResult, GraphDefinition, ReplayNodeMode, ReplayRequest } from "@bstockwelldev/agent-graph-sdk";

import {
  buildReplayRequest,
  compareNodes,
  EMPTY_DRAFT,
  MODE_LABEL,
  modelChoices,
  routeChoices,
  type CounterfactualDraft,
} from "@/lib/counterfactual";
import { color, fontFamily, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { PROVIDER_OPTIONS } from "./ProviderModelPicker";
import { Button } from "./ui/Button";
import { Combobox } from "./ui/Combobox";
import { TextInput } from "./ui/fields";
import { Toggle } from "./ui/Toggle";

// Counterfactual replay (STO-609): "what if this router had gone the other
// way / this LLM node had used a different model?" for a recorded run.
// Unchanged nodes stay frozen at their recorded output; nodes downstream
// of a change recompute (backend/app/replay.py).

const AS_RECORDED = "";

export function CounterfactualForm({
  graph,
  busy,
  onSubmit,
  onCancel,
}: {
  graph: Pick<GraphDefinition, "nodes" | "edges">;
  busy: boolean;
  onSubmit: (request: ReplayRequest) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<CounterfactualDraft>(EMPTY_DRAFT);
  const routes = routeChoices(graph);
  const models = modelChoices(graph);
  const request = buildReplayRequest(draft);

  return (
    <div role="group" aria-label="Replay with changes" style={formStyle}>
      {routes.length === 0 && models.length === 0 && (
        <div style={{ ...typeScale.caption, opacity: 0.7 }}>This graph has no routers or model nodes to change.</div>
      )}
      {routes.map((choice) => (
        <label key={choice.nodeId} style={fieldStyle}>
          <span style={labelStyle}>
            Route at <span style={monoStyle}>{choice.nodeId}</span>
          </span>
          <Combobox
            aria-label={`Route at ${choice.nodeId}`}
            value={draft.routes[choice.nodeId] ?? AS_RECORDED}
            disabled={busy}
            onChange={(value) => setDraft((d) => ({ ...d, routes: { ...d.routes, [choice.nodeId]: value } }))}
            options={[{ value: AS_RECORDED, label: "As recorded" }, ...choice.targets.map((target) => ({ value: target, label: `Force → ${target}` }))]}
          />
        </label>
      ))}
      {models.map((choice) => {
        const current = draft.models[choice.nodeId] ?? { provider: AS_RECORDED, model: "" };
        const set = (patch: Partial<typeof current>) =>
          setDraft((d) => ({ ...d, models: { ...d.models, [choice.nodeId]: { ...current, ...patch } } }));
        return (
          <div key={choice.nodeId} style={fieldStyle}>
            <span style={labelStyle}>
              Model at <span style={monoStyle}>{choice.nodeId}</span>
              {choice.recordedModel ? <span style={{ opacity: 0.6 }}> · recorded {choice.recordedModel}</span> : null}
            </span>
            <Combobox
              aria-label={`Provider at ${choice.nodeId}`}
              value={current.provider}
              disabled={busy}
              onChange={(provider) => set({ provider })}
              options={[{ value: AS_RECORDED, label: "As recorded" }, ...PROVIDER_OPTIONS]}
            />
            {current.provider && (
              <TextInput
                aria-label={`Model at ${choice.nodeId}`}
                placeholder="model (provider default when empty)"
                value={current.model}
                disabled={busy}
                onChange={(event) => set({ model: event.target.value })}
                style={{ marginTop: spacing[1] }}
              />
            )}
          </div>
        );
      })}
      <Toggle
        checked={draft.liveAffected}
        disabled={busy}
        onChange={(liveAffected) => setDraft((d) => ({ ...d, liveAffected }))}
        label="Run affected nodes live"
        description="Nodes downstream of a change use the original run's provider instead of the stub. May cost tokens."
      />
      <div style={{ display: "flex", gap: spacing[2], marginTop: spacing[2] }}>
        <Button variant="primary" disabled={busy || request === null} onClick={() => request && onSubmit(request)}>
          {busy ? "Replaying…" : "Replay with changes"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

const MODE_COLOR: Record<ReplayNodeMode, string> = {
  frozen: text.secondary,
  recomputed: color.primary[500],
  live: color.success[500],
  stub_fallback: color.warning[500],
  forced: color.warning[500],
};

export function ModeChip({ mode }: { mode: ReplayNodeMode }) {
  return <span style={{ ...chipStyle, color: MODE_COLOR[mode], borderColor: MODE_COLOR[mode] }}>{MODE_LABEL[mode]}</span>;
}

/** Original vs counterfactual, node by node. */
export function CounterfactualResultView({ result }: { result: CounterfactualResult }) {
  const rows = compareNodes(result.original_traces, result.traces, result.node_modes, result.changed_nodes);
  const changedCount = rows.filter((row) => row.changed).length;
  return (
    <div aria-label="Counterfactual result">
      <div style={{ ...typeScale.caption, opacity: 0.75, marginBottom: spacing[2] }}>
        {changedCount === 0 ? "No node output changed." : `${changedCount} node${changedCount === 1 ? "" : "s"} changed`} · replay of{" "}
        <span style={monoStyle}>{result.original_run_id}</span>
      </div>
      {rows.map((row) => (
        <div key={row.nodeId} data-testid="counterfactual-node" style={{ ...rowStyle, borderColor: row.changed ? color.warning[500] : surface.borderStrong }}>
          <div style={{ display: "flex", alignItems: "center", gap: spacing[2], flexWrap: "wrap" }}>
            <span style={{ ...monoStyle, fontWeight: 600 }}>{row.nodeId}</span>
            {row.mode && <ModeChip mode={row.mode} />}
            {row.onlyIn === "original" && <span style={chipStyle}>Not reached</span>}
            {row.onlyIn === "replay" && <span style={chipStyle}>Newly reached</span>}
          </div>
          {row.changed ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: spacing[2], marginTop: spacing[1] }}>
              <Output label="Original" value={row.before} />
              <Output label="Counterfactual" value={row.after} />
            </div>
          ) : (
            <Output label="Output (unchanged)" value={row.after} />
          )}
        </div>
      ))}
    </div>
  );
}

function Output({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...typeScale.caption, opacity: 0.6 }}>{label}</div>
      <pre style={preStyle}>{value === undefined ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

const monoStyle: CSSProperties = { fontFamily: fontFamily.mono };
const formStyle: CSSProperties = { padding: spacing[2], borderRadius: radius.lg, border: `1px solid ${surface.borderStrong}`, background: surface.raised, marginTop: spacing[2] };
const fieldStyle: CSSProperties = { display: "block", marginBottom: spacing[2] };
const labelStyle: CSSProperties = { ...typeScale.caption, display: "block", marginBottom: spacing[1] };
const rowStyle: CSSProperties = { padding: spacing[2], borderRadius: radius.lg, border: "1px solid", background: surface.raised, marginBottom: spacing[2] };
const chipStyle: CSSProperties = { ...typeScale.caption, fontSize: 11, padding: "0 6px", borderRadius: 999, border: `1px solid ${surface.borderStrong}`, whiteSpace: "nowrap" };
const preStyle: CSSProperties = {
  margin: 0,
  marginTop: 2,
  maxHeight: 120,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: fontFamily.mono,
  fontSize: 11,
  lineHeight: "15px",
  color: text.primary,
};
