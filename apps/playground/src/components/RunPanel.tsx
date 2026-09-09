import type { CSSProperties, RefObject } from "react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { validationSummary } from "../diagnostics";
import type { ChatProvider, Diagnostic, NodeTrace, PlatformEvent, RunSummary } from "../types";
import { PROVIDER_TAXONOMY } from "../content/taxonomy";
import { accentSurface, color, fontFamily, localType, radius, shell, spacing, surface, text, typeScale } from "../theme";
import { TaxonomyTooltip } from "./Tooltip";
import { Button } from "./ui/Button";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { Skeleton, SkeletonBlock } from "./ui/Skeleton";
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
  runHistoryLoading = false,
  onSelectRun,
  events,
  selectedTrace,
  compiling = false,
  layout = "rail",
  reducedMotion = false,
}: {
  graphId: string | null;
  diagnostics: Diagnostic[];
  diagnosticsSectionRef?: RefObject<HTMLDivElement>;
  providerBlockMessage?: string | null;
  inspectionRunId?: string | null;
  onExitInspection?: () => void;
  onCompile: () => Promise<void> | void;
  onRun: (question: string, provider: ChatProvider, model?: string, apiKey?: string) => Promise<void> | void;
  onDiagnosticClick: (diagnostic: Diagnostic) => void;
  runSummary: RunSummary | null;
  runHistory: RunSummary[];
  runHistoryLoading?: boolean;
  onSelectRun: (runId: string) => void;
  events: PlatformEvent[];
  selectedTrace: NodeTrace | null;
  compiling?: boolean;
  layout?: "rail" | "drawer";
  reducedMotion?: boolean;
}) {
  const [question, setQuestion] = useState("How does a database index work?");
  const [provider, setProvider] = useState<ChatProvider>("stub");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelOptions, setModelOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [modelCatalogMessage, setModelCatalogMessage] = useState("");
  const [modelCatalogLoading, setModelCatalogLoading] = useState(false);
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
      setModelCatalogLoading(false);
      return;
    }

    let cancelled = false;
    setModelCatalogLoading(true);
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
      })
      .finally(() => {
        if (!cancelled) setModelCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [graphId, provider, showModelSelect]);

  return (
    <div style={containerStyle(layout)}>
      {inspecting && runSummary && (
        <div style={{ ...sectionStyle, background: color.neutral[900] }}>
          <CollapsibleSection sectionId="run-inspection" title="Run inspection" defaultOpen reducedMotion={reducedMotion}>
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
          </CollapsibleSection>
        </div>
      )}

      <div style={sectionStyle}>
        <CollapsibleSection sectionId="run-controls" title="Run" reducedMotion={reducedMotion}>
          <TextArea
            rows={4}
            style={{ minHeight: 96, resize: "vertical" }}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="User question (fed into the Input node)"
            disabled={running || compiling}
          />
          <div style={{ marginTop: spacing[2] }}>
            <TaxonomyTooltip
              layout="inline"
              title={PROVIDER_TAXONOMY[provider]?.title ?? "Model provider"}
              summary={PROVIDER_TAXONOMY[provider]?.summary ?? "Chat provider for LLM nodes"}
              details={PROVIDER_TAXONOMY[provider]?.details ?? "Select which backend executes LLM nodes at run time."}
            >
              <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>Model provider</div>
            </TaxonomyTooltip>
            <Select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ChatProvider)}
              disabled={running || compiling}
            >
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
                disabled={running || compiling}
              />
            </div>
          )}
          {showModelSelect && (
            <div style={{ marginTop: spacing[2] }}>
              <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>Model</div>
              {modelCatalogLoading ? (
                <Skeleton height={36} style={{ borderRadius: radius.lg }} />
              ) : (
                <Select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={modelOptions.length === 0 || running || compiling}
                >
                  {modelOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
              {modelCatalogMessage && !modelCatalogLoading && (
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
          {running && (
            <div style={{ marginTop: spacing[2] }} aria-busy="true" aria-label="Run in progress">
              <SkeletonBlock lines={2} gap={spacing[1]} />
            </div>
          )}
          <div style={{ display: "flex", gap: spacing[2], marginTop: spacing[2] }}>
            <Button variant="secondary" disabled={compiling || running} onClick={() => void onCompile()} style={{ minHeight: shell.touchTarget.min }}>
              {compiling ? "Compiling…" : "Compile"}
            </Button>
            <Button
              variant="primary"
              disabled={running || compiling}
              style={{ minHeight: shell.touchTarget.min }}
              onClick={() =>
                void onRun(
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
        </CollapsibleSection>
      </div>

      <div ref={diagnosticsSectionRef} style={sectionStyle} tabIndex={-1} aria-live="polite" aria-label={`Graph validation: ${summary.label}`}>
        <CollapsibleSection sectionId="run-diagnostics" title="Diagnostics" reducedMotion={reducedMotion}>
          {diagnostics.length === 0 ? (
            <div role="status" style={{ ...typeScale.caption, color: color.success[500], lineHeight: "18px" }}>
              No issues — graph is ready to compile.
            </div>
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
        </CollapsibleSection>
      </div>

      <div style={sectionStyle}>
        <CollapsibleSection sectionId="run-history" title="Run history" defaultOpen={runHistory.length > 0} reducedMotion={reducedMotion}>
          {runHistoryLoading ? (
            <SkeletonBlock lines={2} gap={spacing[2]} />
          ) : runHistory.length === 0 ? (
            <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
              No runs yet for this graph. Compile and run to see history here.
            </div>
          ) : (
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
          )}
        </CollapsibleSection>
      </div>

      {runSummary && (
        <div style={sectionStyle}>
          <CollapsibleSection sectionId="run-status" title="Run status" defaultOpen reducedMotion={reducedMotion}>
            <div style={typeScale.caption}>
              {runSummary.run_id} — <b>{runSummary.status}</b>
            </div>
            {runSummary.status === "succeeded" && (
              <div style={{ ...scrollableBlockStyle, ...localType.ui, marginTop: spacing[2] - 2, whiteSpace: "pre-wrap" }}>
                {String(runSummary.result)}
              </div>
            )}
          </CollapsibleSection>
        </div>
      )}

      {selectedTrace && (
        <div style={sectionStyle}>
          <CollapsibleSection
            sectionId="run-node-trace"
            title={`Node trace: ${selectedTrace.node_id} (${selectedTrace.status}${formatDuration(selectedTrace) ? ` · ${formatDuration(selectedTrace)}` : ""})`}
            defaultOpen
            reducedMotion={reducedMotion}
          >
            <div style={scrollableBlockStyle}>
              <div style={{ ...typeScale.caption, opacity: 0.6 }}>Input</div>
              <pre style={preStyle}>{JSON.stringify(selectedTrace.input, null, 2)}</pre>
              <div style={{ ...typeScale.caption, opacity: 0.6 }}>Output</div>
              <pre style={preStyle}>{JSON.stringify(selectedTrace.output, null, 2)}</pre>
              {selectedTrace.error && (
                <div style={{ ...typeScale.caption, color: accentSurface.destructive.text }}>{selectedTrace.error}</div>
              )}
            </div>
          </CollapsibleSection>
        </div>
      )}

      <div style={eventLogSectionStyle} aria-live="polite" aria-relevant="additions">
        <CollapsibleSection sectionId="run-event-log" title="Event log" defaultOpen reducedMotion={reducedMotion}>
          {events.length === 0 ? (
            <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
              No events yet. Run the graph to stream node lifecycle events here.
            </div>
          ) : (
            events.map((e) => (
              <div key={e.sequence} style={{ ...typeScale.caption, marginBottom: spacing[1] - 1, fontFamily: fontFamily.mono }}>
                <span style={{ opacity: 0.5 }}>[{e.sequence}]</span> {e.event_type}
                {e.node_id ? ` · ${e.node_id}` : ""}
              </div>
            ))
          )}
        </CollapsibleSection>
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

const containerStyle = (layout: "rail" | "drawer"): CSSProperties => ({
  width: "100%",
  height: "100%",
  minHeight: 0,
  borderLeft: layout === "drawer" ? undefined : `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.primary,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
});

const sectionStyle: CSSProperties = {
  padding: shell.panelPadding,
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
