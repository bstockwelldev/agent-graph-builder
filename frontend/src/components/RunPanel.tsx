import type { CSSProperties } from "react";
import { useState } from "react";
import type { Diagnostic, NodeTrace, PlatformEvent, RunSummary } from "../types";
import { accentSurface, color, fontFamily, localType, radius, spacing, surface, text, typeScale } from "../theme";

export function RunPanel({
  diagnostics,
  onCompile,
  onRun,
  runSummary,
  events,
  selectedTrace,
}: {
  diagnostics: Diagnostic[];
  onCompile: () => void;
  onRun: (question: string) => void;
  runSummary: RunSummary | null;
  events: PlatformEvent[];
  selectedTrace: NodeTrace | null;
}) {
  const [question, setQuestion] = useState("How does a database index work?");
  const running = runSummary?.status === "queued" || runSummary?.status === "running";

  return (
    <div style={containerStyle}>
      <div style={sectionStyle}>
        <div style={headingStyle}>Run</div>
        <textarea
          style={{ ...inputStyle, height: 60 }}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="User question (fed into the Input node)"
        />
        <div style={{ display: "flex", gap: spacing[2], marginTop: spacing[2] }}>
          <button style={buttonStyle} onClick={onCompile}>
            Compile
          </button>
          <button
            style={{ ...buttonStyle, background: accentSurface.successAction.bg, borderColor: accentSurface.successAction.border }}
            disabled={running}
            onClick={() => onRun(question)}
          >
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {diagnostics.length > 0 && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Diagnostics</div>
          {diagnostics.map((d, i) => (
            <div
              key={i}
              style={{ ...typeScale.caption, color: d.severity === "error" ? accentSurface.destructive.text : color.warning[500], marginBottom: spacing[1] }}
            >
              [{d.severity}] {d.code}
              {d.node_id ? ` (${d.node_id})` : ""}: {d.message}
            </div>
          ))}
        </div>
      )}

      {runSummary && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Run status</div>
          <div style={typeScale.caption}>
            {runSummary.run_id} — <b>{runSummary.status}</b>
          </div>
          {runSummary.status === "succeeded" && (
            <div style={{ ...localType.ui, marginTop: spacing[2] - 2, whiteSpace: "pre-wrap" }}>
              {String(runSummary.result)}
            </div>
          )}
        </div>
      )}

      {selectedTrace && (
        <div style={sectionStyle}>
          <div style={headingStyle}>
            Node trace: {selectedTrace.node_id} ({selectedTrace.status})
          </div>
          <div style={{ ...typeScale.caption, opacity: 0.6 }}>Input</div>
          <pre style={preStyle}>{JSON.stringify(selectedTrace.input, null, 2)}</pre>
          <div style={{ ...typeScale.caption, opacity: 0.6 }}>Output</div>
          <pre style={preStyle}>{JSON.stringify(selectedTrace.output, null, 2)}</pre>
          {selectedTrace.error && (
            <div style={{ ...typeScale.caption, color: accentSurface.destructive.text }}>{selectedTrace.error}</div>
          )}
        </div>
      )}

      <div style={{ ...sectionStyle, flex: 1, overflowY: "auto" }}>
        <div style={headingStyle}>Event log</div>
        {events.map((e) => (
          <div key={e.sequence} style={{ ...typeScale.caption, marginBottom: spacing[1] - 1, fontFamily: fontFamily.mono }}>
            <span style={{ opacity: 0.5 }}>[{e.sequence}]</span> {e.event_type}
            {e.node_id ? ` · ${e.node_id}` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

const containerStyle: CSSProperties = {
  width: 340,
  borderLeft: `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.primary,
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
};

const sectionStyle: CSSProperties = {
  padding: spacing[3],
  borderBottom: `1px solid ${surface.border}`,
};

const headingStyle: CSSProperties = {
  ...localType.label,
  opacity: 0.6,
  marginBottom: spacing[2],
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: `${spacing[2]}px`,
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  color: text.primary,
  ...localType.ui,
};

const buttonStyle: CSSProperties = {
  padding: `${spacing[2]}px ${spacing[3]}px`,
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  color: text.primary,
  cursor: "pointer",
  ...localType.ui,
};

const preStyle: CSSProperties = {
  ...typeScale.caption,
  background: surface.page,
  padding: spacing[2],
  borderRadius: radius.lg,
  overflowX: "auto",
  marginTop: 2,
  marginBottom: spacing[2],
};
