import type { CSSProperties } from "react";
import { useState } from "react";
import type { Diagnostic, NodeTrace, PlatformEvent, RunSummary } from "../types";

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
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={buttonStyle} onClick={onCompile}>
            Compile
          </button>
          <button style={{ ...buttonStyle, background: "#1f3a2a", borderColor: "#2f5a3f" }} disabled={running} onClick={() => onRun(question)}>
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {diagnostics.length > 0 && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Diagnostics</div>
          {diagnostics.map((d, i) => (
            <div key={i} style={{ fontSize: 12, color: d.severity === "error" ? "#f0a0a0" : "#e8d090", marginBottom: 4 }}>
              [{d.severity}] {d.code}
              {d.node_id ? ` (${d.node_id})` : ""}: {d.message}
            </div>
          ))}
        </div>
      )}

      {runSummary && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Run status</div>
          <div style={{ fontSize: 12 }}>
            {runSummary.run_id} — <b>{runSummary.status}</b>
          </div>
          {runSummary.status === "succeeded" && (
            <div style={{ fontSize: 13, marginTop: 6, whiteSpace: "pre-wrap" }}>
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
          <div style={{ fontSize: 11, opacity: 0.6 }}>Input</div>
          <pre style={preStyle}>{JSON.stringify(selectedTrace.input, null, 2)}</pre>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Output</div>
          <pre style={preStyle}>{JSON.stringify(selectedTrace.output, null, 2)}</pre>
          {selectedTrace.error && <div style={{ color: "#f0a0a0", fontSize: 12 }}>{selectedTrace.error}</div>}
        </div>
      )}

      <div style={{ ...sectionStyle, flex: 1, overflowY: "auto" }}>
        <div style={headingStyle}>Event log</div>
        {events.map((e) => (
          <div key={e.sequence} style={{ fontSize: 11, marginBottom: 3, fontFamily: "monospace" }}>
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
  borderLeft: "1px solid #2a2d35",
  background: "#181a20",
  color: "#e8eaed",
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
};

const sectionStyle: CSSProperties = {
  padding: 12,
  borderBottom: "1px solid #2a2d35",
};

const headingStyle: CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  opacity: 0.6,
  marginBottom: 8,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #2f333d",
  background: "#20232b",
  color: "#e8eaed",
  fontSize: 13,
};

const buttonStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #2f333d",
  background: "#20232b",
  color: "#e8eaed",
  cursor: "pointer",
  fontSize: 13,
};

const preStyle: CSSProperties = {
  fontSize: 11,
  background: "#111318",
  padding: 8,
  borderRadius: 6,
  overflowX: "auto",
  marginTop: 2,
  marginBottom: 8,
};
