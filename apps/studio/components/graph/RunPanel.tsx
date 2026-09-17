import type { CSSProperties, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { client } from "@/lib/api-client";
import { validationSummary } from "@/lib/diagnostics";
import { showModelCatalog } from "@/lib/modelCatalog";
import {
  INSPECT_LOAD_FAIL,
  OBSERVE_OPEN_STORAGE_KEY,
  RUN_RESULT_EMPTY,
  TRACE_MISSING,
  TRACE_SELECT_NODE,
  eventLogEmptyMessage,
  formatRunResult,
  resolveEventLogEvents,
} from "@/lib/observePanel";
import type { ChatProvider, Diagnostic, NodeTrace, PlatformEvent, RunSummary } from "@bstockwelldev/agent-graph-sdk";
import { PROVIDER_TAXONOMY } from "@/content/taxonomy";
import { useExclusiveCollapse } from "@/hooks/usePersistedCollapse";
import { accentSurface, color, fontFamily, localType, radius, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { TaxonomyTooltip } from "./Tooltip";
import { Button } from "./ui/Button";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { SectionHeader } from "./ui/SectionHeader";
import { Skeleton, SkeletonBlock } from "./ui/Skeleton";
import { PasswordInput, Select, TextArea } from "./ui/fields";

const API_KEY_PROVIDERS: ChatProvider[] = ["groq", "google", "azure", "openai_compat"];

export type RunSelection = {
  provider: ChatProvider;
  model?: string;
};

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

function traceTitle(selectedTrace: NodeTrace | null): string {
  if (!selectedTrace) return "Node trace";
  const duration = formatDuration(selectedTrace);
  return `Node trace: ${selectedTrace.node_id} (${selectedTrace.status}${duration ? ` · ${duration}` : ""})`;
}

function RunResultDisplay({ result }: { result: unknown }) {
  const formatted = formatRunResult(result);
  if (formatted.kind === "empty") {
    return (
      <div role="status" style={{ ...typeScale.caption, opacity: 0.6, marginTop: spacing[2] - 2, lineHeight: "18px" }}>
        {RUN_RESULT_EMPTY}
      </div>
    );
  }
  if (formatted.kind === "json") {
    return (
      <pre data-testid="run-result-json" style={{ ...preStyle, ...localType.ui, marginTop: spacing[2] - 2 }}>
        {formatted.text}
      </pre>
    );
  }
  return (
    <div
      data-testid="run-result-text"
      style={{
        ...resultBlockStyle,
        ...localType.ui,
        marginTop: spacing[2] - 2,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {formatted.text}
    </div>
  );
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
  selectedNodeId = null,
  inspectLoadError = false,
  onRetryInspect,
  compiling = false,
  layout = "rail",
  reducedMotion = false,
}: {
  graphId: string | null;
  diagnostics: Diagnostic[];
  diagnosticsSectionRef?: RefObject<HTMLDivElement | null>;
  providerBlockMessage?: string | null;
  inspectionRunId?: string | null;
  onExitInspection?: () => void;
  onCompile: (selection: RunSelection) => Promise<void> | void;
  onRun: (question: string, provider: ChatProvider, model?: string, apiKey?: string) => Promise<void> | void;
  onDiagnosticClick: (diagnostic: Diagnostic) => void;
  runSummary: RunSummary | null;
  runHistory: RunSummary[];
  runHistoryLoading?: boolean;
  onSelectRun: (runId: string) => void;
  events: PlatformEvent[];
  selectedTrace: NodeTrace | null;
  selectedNodeId?: string | null;
  inspectLoadError?: boolean;
  onRetryInspect?: () => void;
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
  const { openId, openSection, toggleSection } = useExclusiveCollapse(OBSERVE_OPEN_STORAGE_KEY, "observe-status");
  const running = runSummary?.status === "queued" || runSummary?.status === "running";
  const summary = validationSummary(diagnostics);
  const inspecting = Boolean(inspectionRunId && runSummary);
  const showModelSelect = showModelCatalog(provider);
  const showApiKeyField = API_KEY_PROVIDERS.includes(provider);
  const displayedEvents = resolveEventLogEvents(events, runSummary?.events);
  const isRail = layout === "rail";
  const lastFocusedRunIdRef = useRef<string | undefined>(undefined);
  const lastFocusedTraceIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const runId = runSummary?.run_id;
    if (lastFocusedRunIdRef.current === undefined) {
      lastFocusedRunIdRef.current = runId;
      return;
    }
    if (runId && runId !== lastFocusedRunIdRef.current) {
      openSection("observe-status");
    }
    lastFocusedRunIdRef.current = runId;
  }, [openSection, runSummary?.run_id]);

  useEffect(() => {
    const nodeId = selectedTrace?.node_id;
    if (lastFocusedTraceIdRef.current === undefined) {
      lastFocusedTraceIdRef.current = nodeId;
      return;
    }
    if (nodeId && nodeId !== lastFocusedTraceIdRef.current) {
      openSection("observe-trace");
    }
    lastFocusedTraceIdRef.current = nodeId;
  }, [openSection, selectedTrace?.node_id]);

  useEffect(() => {
    setApiKey("");

    if (!showApiKeyField) {
      setApiKeyLabel("API key");
      setApiKeyEnvVar("");
      setApiKeyConfigured(false);
      return;
    }

    let cancelled = false;
    client
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
    client
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
      <div data-testid="execute-group" style={executeGroupStyle}>
        <CollapsibleSection sectionId="run-controls" title="Execute" reducedMotion={reducedMotion}>
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
            <p style={{ ...typeScale.caption, opacity: 0.7, lineHeight: "16px", margin: `0 0 ${spacing[1]}px` }}>
              This run overrides all LLM nodes when you Compile or Run. Each LLM still stores a node default.
            </p>
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
            <Button variant="secondary" disabled={compiling || running} onClick={() => void onCompile({ provider, model: showModelSelect ? selectedModel || undefined : undefined })} style={{ minHeight: shell.touchTarget.min }}>
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

        <div ref={diagnosticsSectionRef} style={{ marginTop: spacing[2] }} tabIndex={-1} aria-live="polite" aria-label={`Graph validation: ${summary.label}`}>
          <CollapsibleSection
            sectionId="run-diagnostics"
            title="Diagnostics"
            defaultOpen={diagnostics.length > 0}
            reducedMotion={reducedMotion}
          >
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
      </div>

      <div data-testid="observe-group" style={observeGroupStyle(isRail)}>
        <SectionHeader>Observe</SectionHeader>
        {inspectLoadError && (
          <div role="alert" style={inspectFailStyle}>
            <div>{INSPECT_LOAD_FAIL}</div>
            {onRetryInspect && (
              <Button variant="secondary" onClick={onRetryInspect} style={{ marginTop: spacing[2], minHeight: shell.touchTarget.min }}>
                Retry
              </Button>
            )}
          </div>
        )}
        <div data-testid="observe-scroller" style={observeScrollerStyle(isRail)}>
          <CollapsibleSection
            sectionId="observe-status"
            title="Run status"
            open={openId === "observe-status"}
            onOpenChange={() => toggleSection("observe-status")}
            reducedMotion={reducedMotion}
          >
            {!runSummary ? (
              <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
                No run to inspect yet. Compile and run to see status here.
              </div>
            ) : (
              <>
                {inspecting && (
                  <div style={{ ...typeScale.caption, lineHeight: "16px", marginBottom: spacing[2] }}>
                    Inspecting run · <b>{runSummary.status}</b>
                    {runSummary.started_at ? ` · ${new Date(runSummary.started_at).toLocaleString()}` : ""}
                    {runSummary.input?.question != null && (
                      <div style={{ opacity: 0.75, marginTop: spacing[1] }}>Question: {String(runSummary.input.question)}</div>
                    )}
                    {runSummary.provider && (
                      <div style={{ opacity: 0.75, marginTop: spacing[1] }}>Provider: {runSummary.provider}</div>
                    )}
                    {onExitInspection && (
                      <Button variant="secondary" onClick={onExitInspection} style={{ width: "100%", marginTop: spacing[2] }}>
                        Exit inspection
                      </Button>
                    )}
                  </div>
                )}
                <div style={typeScale.caption}>
                  {runSummary.run_id} — <b>{runSummary.status}</b>
                </div>
                {runSummary.status === "succeeded" && <RunResultDisplay result={runSummary.result} />}
                {runSummary.status === "failed" && runSummary.error && (
                  <div
                    role="alert"
                    style={{
                      ...typeScale.caption,
                      color: accentSurface.destructive.text,
                      marginTop: spacing[2] - 2,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {runSummary.error}
                  </div>
                )}
              </>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            sectionId="observe-trace"
            title={traceTitle(selectedTrace)}
            open={openId === "observe-trace"}
            onOpenChange={() => toggleSection("observe-trace")}
            reducedMotion={reducedMotion}
          >
            {!selectedNodeId ? (
              <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
                {TRACE_SELECT_NODE}
              </div>
            ) : !selectedTrace ? (
              <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
                {TRACE_MISSING}
              </div>
            ) : (
              <div>
                <div style={{ ...typeScale.caption, opacity: 0.6 }}>Input</div>
                <pre style={preStyle}>{JSON.stringify(selectedTrace.input, null, 2)}</pre>
                <div style={{ ...typeScale.caption, opacity: 0.6 }}>Output</div>
                <pre style={preStyle}>{JSON.stringify(selectedTrace.output, null, 2)}</pre>
                {selectedTrace.error && (
                  <div style={{ ...typeScale.caption, color: accentSurface.destructive.text }}>{selectedTrace.error}</div>
                )}
              </div>
            )}
          </CollapsibleSection>

          <div aria-live="polite" aria-relevant="additions">
            <CollapsibleSection
              sectionId="observe-events"
              title="Event log"
              open={openId === "observe-events"}
              onOpenChange={() => toggleSection("observe-events")}
              reducedMotion={reducedMotion}
            >
              {displayedEvents.length === 0 ? (
                <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
                  {eventLogEmptyMessage(inspecting)}
                </div>
              ) : (
                displayedEvents.map((e) => (
                  <div key={e.sequence} style={{ ...typeScale.caption, marginBottom: spacing[1] - 1, fontFamily: fontFamily.mono }}>
                    <span style={{ opacity: 0.5 }}>[{e.sequence}]</span> {e.event_type}
                    {e.node_id ? ` · ${e.node_id}` : ""}
                  </div>
                ))
              )}
            </CollapsibleSection>
          </div>

          <CollapsibleSection
            sectionId="observe-history"
            title="Run history"
            open={openId === "observe-history"}
            onOpenChange={() => toggleSection("observe-history")}
            reducedMotion={reducedMotion}
          >
            {runHistoryLoading ? (
              <SkeletonBlock lines={2} gap={spacing[2]} />
            ) : runHistory.length === 0 ? (
              <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
                No runs yet for this graph. Compile and run to see history here.
              </div>
            ) : (
              runHistory.map((run) => {
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
              })
            )}
          </CollapsibleSection>
        </div>
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
  height: layout === "rail" ? "100%" : "auto",
  minHeight: 0,
  borderLeft: layout === "drawer" ? undefined : `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.primary,
  display: "flex",
  flexDirection: "column",
  overflow: layout === "rail" ? "hidden" : "visible",
});

const executeGroupStyle: CSSProperties = {
  padding: shell.panelPadding,
  borderBottom: `1px solid ${surface.border}`,
  flexShrink: 0,
};

const observeGroupStyle = (isRail: boolean): CSSProperties => ({
  padding: shell.panelPadding,
  flex: isRail ? 1 : undefined,
  minHeight: isRail ? 0 : undefined,
  display: "flex",
  flexDirection: "column",
  borderBottom: "none",
});

const observeScrollerStyle = (isRail: boolean): CSSProperties => ({
  flex: isRail ? 1 : undefined,
  minHeight: isRail ? 0 : undefined,
  overflowY: isRail ? "auto" : "visible",
});

const resultBlockStyle: CSSProperties = {
  overflowX: "auto",
};

const inspectFailStyle: CSSProperties = {
  ...typeScale.caption,
  color: accentSurface.destructive.text,
  marginBottom: spacing[2],
  lineHeight: "18px",
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
  minHeight: shell.touchTarget.min,
  marginBottom: spacing[2],
  padding: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  color: text.primary,
  cursor: "pointer",
  textAlign: "left",
};
