import type { CSSProperties, RefObject } from "react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { validationSummary } from "../diagnostics";
import type { ChatProvider, Diagnostic, NodeTrace, PlatformEvent, RunSummary } from "../types";
import { accentSurface, color, fontFamily, localType, radius, spacing, surface, text, typeScale } from "../theme";
import { Button } from "./ui/Button";
import { PasswordInput, Select, TextArea } from "./ui/fields";

const CATALOG_PROVIDERS: ChatProvider[] = ["ollama", "groq", "azure"];
const API_KEY_PROVIDERS: ChatProvider[] = ["groq", "google", "azure", "openai_compat"];

function formatDuration(trace: NodeTrace): string | null {
  if (!trace.completed_at) return null;
  const ms = new Date(trace.completed_at).getTime() - new Date(trace.started_at).getTime();
  if (ms < 0) return null;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatRunLabel(run: RunSummary): string {
  const question = String(run.input?.question ?? "").trim();
  const snippet = question.length > 36 ? `${question.slice(0, 33)}…` : question || run.run_id;
  const when = run.started_at ? new Date(run.started_at).toLocaleString() : "";
  return when ? `${snippet} · ${when}` : snippet;
}

function diagnosticKey(diagnostic: Diagnostic, index: number): string {
  return `${diagnostic.code}-${diagnostic.node_id ?? ""}-${diagnostic.edge_id ?? ""}-${index}`;
}

export function RunPanel({
  graphId,
  diagnostics,
  diagnosticsSectionRef,
  providerBlockMessage,
  inspectionRunId,
  onExitInspection,
  onCompile,
  onRun,
  onDiagnosticClick,
  runSummary,
  runHistory,
  onSelectRun,
  events,
  selectedTrace,
}: {
  graphId: string | null;
  diagnostics: Diagnostic[];
  diagnosticsSectionRef?: RefObject<HTMLDivElement>;
  providerBlockMessage?: string | null;
  inspectionRunId?: string | null;
  onExitInspection?: () => void;
  onCompile: () => void;
  onRun: (question: string, provider: ChatProvider, model?: string, apiKey?: string) => void;
  onDiagnosticClick: (diagnostic: Diagnostic) => void;
  runSummary: RunSummary | null;
  runHistory: RunSummary[];
  onSelectRun: (runId: string) => void;
  events: PlatformEvent[];
  selectedTrace: NodeTrace | null;
}) {
  const [question, setQuestion] = useState("How does a database index work?");
  const [provider, setProvider] = useState<ChatProvider>("stub");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelOptions, setModelOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [modelCatalogMessage, setModelCatalogMessage] = useState("");
  const [apiKeyLabel, setApiKeyLabel] = useState("API key");
  const [apiKeyEnvVar, setApiKeyEnvVar] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const running = runSummary?.status === "queued" || runSummary?.status === "running";
  const summary = validationSummary(diagnostics);
  const inspecting = Boolean(inspectionRunId && runSummary);
  const showModelSelect = CATALOG_PROVIDERS.includes(provider);
  const showApiKeyField = API_KEY_PROVIDERS.includes(provider);

  useEffect(() => {
    // Always clear any typed key on provider change -- never carry a key
    // entered for one provider over to another.
    setApiKey("");

    if (!showApiKeyField) {
      setApiKeyLabel("API key");
      setApiKeyEnvVar("");
      setApiKeyConfigured(false);
      return;
    }

    let cancelled = false;
    api
      .providerCredentials(provider)
      .then((credentials) => {
        if (cancelled) return;
        setApiKeyLabel(credentials.label || "API key");
        setApiKeyEnvVar(credentials.env_var);
        // The server only ever tells us whether a key is configured, never
        // the value -- see backend/app/provider_credentials.py. Leaving the
        // field blank means "use the server's own key"; typing one here
        // sends it as a per-run override instead.
        setApiKeyConfigured(credentials.configured);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load provider credentials:", err);
        setApiKeyConfigured(false);
      });

    return () => {
      cancelled = true;
    };
  }, [provider, showApiKeyField]);

  useEffect(() => {
    if (!showModelSelect) {
      setModelOptions([]);
      setSelectedModel("");
      setModelCatalogMessage("");
      return;
    }

    let cancelled = false;
    api
      .listProviderModels(provider, graphId ?? undefined)
      .then((catalog) => {
        if (cancelled) return;
        setModelOptions(catalog.models);
        setModelCatalogMessage(catalog.message);
        setSelectedModel((current) => {
          if (current && catalog.models.some((option) => option.id === current)) {
            return current;
          }
          return catalog.models[0]?.id ?? "";
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load provider models:", err);
        setModelOptions([]);
        setSelectedModel("");
        setModelCatalogMessage("Could not load model catalog.");
      });

    return () => {
      cancelled = true;
    };
  }, [graphId, provider, showModelSelect]);

  return (
    <div style={containerStyle}>
      {inspecting && runSummary && (
        <div style={{ ...sectionStyle, background: color.neutral[900] }}>
          <div style={headingStyle}>Run inspection</div>
          <div style={{ ...typeScale.caption, lineHeight: "16px", marginBottom: spacing[2] }}>
            Inspecting run · <b>{runSummary.status}</b>
            {runSummary.started_at ? ` · ${new Date(runSummary.started_at).toLocaleString()}` : ""}
          </div>
          {runSummary.input?.question != null && (
            <div style={{ ...typeScale.caption, opacity: 0.75, marginBottom: spacing[1] }}>
              Question: {String(runSummary.input.question)}
            </div>
          )}
          {runSummary.provider && (
            <div style={{ ...typeScale.caption, opacity: 0.75, marginBottom: spacing[2] }}>
              Provider: {runSummary.provider}
            </div>
          )}
          {onExitInspection && (
            <Button variant="secondary" onClick={onExitInspection} style={{ width: "100%" }}>
              Exit inspection
            </Button>
          )}
        </div>
      )}

        <div style={sectionStyle}>
        <div style={headingStyle}>Run</div>
        <TextArea
          style={{ height: 60 }}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="User question (fed into the Input node)"
        />
        <div style={{ marginTop: spacing[2] }}>
          <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>Model provider</div>
          <Select value={provider} onChange={(e) => setProvider(e.target.value as ChatProvider)}>
            <option value="stub">Stub (offline)</option>
            <option value="groq">Groq</option>
            <option value="google">Google Gemini</option>
            <option value="azure">Azure OpenAI</option>
            <option value="ollama">Ollama (local LLM)</option>
            <option value="openai_compat">OpenAI-compatible (HTTP)</option>
          </Select>
        </div>
        {showApiKeyField && (
          <div style={{ marginTop: spacing[2] }}>
            <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>
              {apiKeyLabel}
              {apiKeyEnvVar ? ` (${apiKeyEnvVar})` : ""}
              {apiKeyConfigured ? " -- configured on server, leave blank to use it" : ""}
            </div>
            <PasswordInput
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeyConfigured ? "Leave blank to use the server's key, or override here" : `Enter ${apiKeyEnvVar || "API key"}`}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}
        {showModelSelect && (
          <div style={{ marginTop: spacing[2] }}>
            <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>Model</div>
            <Select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={modelOptions.length === 0}
            >
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
            {modelCatalogMessage && (
              <div style={{ ...typeScale.caption, opacity: 0.6, marginTop: spacing[1], lineHeight: "16px" }}>
                {modelCatalogMessage}
              </div>
            )}
          </div>
        )}
        {providerBlockMessage && (
          <div style={{ ...typeScale.caption, color: accentSurface.destructive.text, marginTop: spacing[2], lineHeight: "16px" }}>
            {providerBlockMessage}
          </div>
        )}
        <div style={{ display: "flex", gap: spacing[2], marginTop: spacing[2] }}>
          <Button variant="secondary" onClick={onCompile}>
            Compile
          </Button>
          <Button
            variant="primary"
            disabled={running}
            onClick={() =>
              onRun(
                question,
                provider,
                showModelSelect ? selectedModel || undefined : undefined,
                showApiKeyField ? apiKey.trim() || undefined : undefined,
              )
            }
          >
            {running ? "Running…" : "Run"}
          </Button>
        </div>
      </div>

      <div
        ref={diagnosticsSectionRef}
        style={sectionStyle}
        tabIndex={-1}
        aria-live="polite"
        aria-label={`Graph validation: ${summary.label}`}
      >
        <div style={headingStyle}>Diagnostics</div>
        {diagnostics.length === 0 ? (
          <div style={{ ...typeScale.caption, color: color.success[500] }}>No issues — graph is ready to compile.</div>
        ) : (
          diagnostics.map((diagnostic, index) => {
            const clickable = Boolean(diagnostic.node_id || diagnostic.edge_id);
            const content = (
              <>
                <span style={{ fontWeight: 600 }}>{diagnostic.severity === "error" ? "Error" : "Warning"}</span>
                {": "}
                {diagnostic.message}
              </>
            );
            if (!clickable) {
              return (
                <div
                  key={diagnosticKey(diagnostic, index)}
                  style={{
                    ...typeScale.caption,
                    color: diagnostic.severity === "error" ? accentSurface.destructive.text : color.warning[500],
                    marginBottom: spacing[1],
                    lineHeight: "16px",
                  }}
                >
                  {content}
                </div>
              );
            }
            return (
              <button
                key={diagnosticKey(diagnostic, index)}
                type="button"
                onClick={() => onDiagnosticClick(diagnostic)}
                style={diagnosticButtonStyle(diagnostic.severity)}
              >
                {content}
              </button>
            );
          })
        )}
      </div>

      {runHistory.length > 0 && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Run history</div>
          <div style={historyListStyle}>
            {runHistory.map((run) => {
              const active = inspectionRunId ? run.run_id === inspectionRunId : runSummary?.run_id === run.run_id;
              return (
                <button
                  key={run.run_id}
                  type="button"
                  onClick={() => onSelectRun(run.run_id)}
                  style={{
                    ...historyButtonStyle,
                    borderColor: active ? color.primary[600] : surface.borderStrong,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: spacing[2] }}>
                    <span style={{ fontWeight: 600 }}>{run.status}</span>
                    {run.provider && <span style={{ opacity: 0.6 }}>{run.provider}</span>}
                  </div>
                  <div style={{ ...typeScale.caption, opacity: 0.75, textAlign: "left", marginTop: spacing[1] }}>
                    {formatRunLabel(run)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {runSummary && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Run status</div>
          <div style={typeScale.caption}>
            {runSummary.run_id} — <b>{runSummary.status}</b>
          </div>
          {runSummary.status === "succeeded" && (
            <div style={{ ...scrollableBlockStyle, ...localType.ui, marginTop: spacing[2] - 2, whiteSpace: "pre-wrap" }}>
              {String(runSummary.result)}
            </div>
          )}
        </div>
      )}

      {selectedTrace && (
        <div style={sectionStyle}>
          <div style={headingStyle}>
            Node trace: {selectedTrace.node_id} ({selectedTrace.status}
            {formatDuration(selectedTrace) ? ` · ${formatDuration(selectedTrace)}` : ""})
          </div>
          <div style={scrollableBlockStyle}>
            <div style={{ ...typeScale.caption, opacity: 0.6 }}>Input</div>
            <pre style={preStyle}>{JSON.stringify(selectedTrace.input, null, 2)}</pre>
            <div style={{ ...typeScale.caption, opacity: 0.6 }}>Output</div>
            <pre style={preStyle}>{JSON.stringify(selectedTrace.output, null, 2)}</pre>
            {selectedTrace.error && (
              <div style={{ ...typeScale.caption, color: accentSurface.destructive.text }}>{selectedTrace.error}</div>
            )}
          </div>
        </div>
      )}

      <div style={eventLogSectionStyle}>
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

function diagnosticButtonStyle(severity: Diagnostic["severity"]): CSSProperties {
  return {
    display: "block",
    width: "100%",
    marginBottom: spacing[1],
    padding: spacing[2],
    borderRadius: radius.lg,
    border: `1px solid ${severity === "error" ? accentSurface.destructive.border : color.warning[700]}`,
    background: severity === "error" ? accentSurface.destructive.bg : surface.raised,
    color: severity === "error" ? accentSurface.destructive.text : color.warning[500],
    cursor: "pointer",
    textAlign: "left",
    ...typeScale.caption,
    lineHeight: "16px",
  };
}

const containerStyle: CSSProperties = {
  width: 340,
  height: "100%",
  minHeight: 0,
  borderLeft: `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.primary,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const sectionStyle: CSSProperties = {
  padding: spacing[3],
  borderBottom: `1px solid ${surface.border}`,
  flexShrink: 0,
};

const historyListStyle: CSSProperties = {
  maxHeight: 200,
  overflowY: "auto",
};

const scrollableBlockStyle: CSSProperties = {
  maxHeight: 160,
  overflowY: "auto",
};

const eventLogSectionStyle: CSSProperties = {
  ...sectionStyle,
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  borderBottom: "none",
};

const headingStyle: CSSProperties = {
  ...localType.label,
  opacity: 0.6,
  marginBottom: spacing[2],
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

const historyButtonStyle: CSSProperties = {
  display: "block",
  width: "100%",
  marginBottom: spacing[2],
  padding: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  color: text.primary,
  cursor: "pointer",
  textAlign: "left",
};
