import type { CSSProperties, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { client } from "@/lib/api-client";
import { logConsoleEntry } from "@/lib/consoleLog";
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
import type {
  ChatProvider,
  Diagnostic,
  NodeTrace,
  PlatformEvent,
  RunGraphSnapshot,
  RunSummary,
  SimulateResult,
} from "@bstockwelldev/agent-graph-sdk";
import { PROVIDER_TAXONOMY } from "@/content/taxonomy";
import { useExclusiveCollapse } from "@/hooks/usePersistedCollapse";
import { accentSurface, color, fontFamily, localType, radius, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { NodeContextMenu, type NodeContextMenuAction } from "./NodeContextMenu";
import { RunWaterfall } from "./RunWaterfall";
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

// Phase 10 Slice A — inline replacement for the standalone
// `/runs/[graphId]` page's SnapshotDialog: same fields (source, fingerprint,
// release id, node/edge counts, embedded resource count, captured-at), just
// rendered in the HUD instead of a route the user has to leave the canvas
// to reach.
function RunSnapshotDisplay({ snapshot, error }: { snapshot: RunGraphSnapshot | null; error: string | null }) {
  if (error) {
    return (
      <div role="alert" style={{ ...typeScale.caption, color: accentSurface.destructive.text, marginTop: spacing[1] }}>
        {error}
      </div>
    );
  }
  if (!snapshot) return null;
  return (
    <div
      style={{
        ...typeScale.caption,
        marginTop: spacing[1],
        padding: spacing[2],
        borderRadius: radius.lg,
        border: `1px solid ${surface.border}`,
        background: surface.raised,
        lineHeight: "18px",
      }}
    >
      <div style={{ fontWeight: 600 }}>{snapshot.source === "release" ? "Release" : "Draft snapshot"}</div>
      <div style={{ opacity: 0.75, fontFamily: fontFamily.mono, wordBreak: "break-all" }}>
        fingerprint: {snapshot.graph_fingerprint}
      </div>
      {snapshot.release_id && (
        <div style={{ opacity: 0.75, fontFamily: fontFamily.mono, wordBreak: "break-all" }}>
          release: {snapshot.release_id}
        </div>
      )}
      {snapshot.graph ? (
        <div style={{ marginTop: spacing[1] - 2 }}>
          <div>{snapshot.graph.name}</div>
          <div style={{ opacity: 0.75 }}>
            {snapshot.graph.nodes.length} nodes · {snapshot.graph.edges.length} edges
          </div>
        </div>
      ) : (
        <div style={{ opacity: 0.75, marginTop: spacing[1] - 2 }}>
          Release-sourced — the full graph and its resolved resource bindings are stored on the release itself,
          not duplicated here.
        </div>
      )}
      {snapshot.resource_snapshots && (
        <div style={{ opacity: 0.75 }}>
          Resources embedded: {Object.keys(snapshot.resource_snapshots).length}
        </div>
      )}
      <div style={{ opacity: 0.75, marginTop: spacing[1] - 2 }}>
        Captured: {new Date(snapshot.created_at).toLocaleString()}
      </div>
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
  onRunFromNode,
  onValidate,
  onDiagnosticClick,
  onPolicyExceptionCreated,
  runSummary,
  runHistory,
  runHistoryLoading = false,
  onSelectRun,
  events,
  selectedTrace,
  selectedNodeId = null,
  nodeTraces = {},
  onFocusNode,
  inspectLoadError = false,
  onRetryInspect,
  compiling = false,
  layout = "rail",
  reducedMotion = false,
  sectionRequest = null,
  runFromNodeRequest = null,
  onRunFromNodeRequestHandled,
}: {
  graphId: string | null;
  diagnostics: Diagnostic[];
  diagnosticsSectionRef?: RefObject<HTMLDivElement | null>;
  providerBlockMessage?: string | null;
  inspectionRunId?: string | null;
  onExitInspection?: () => void;
  onCompile: (selection: RunSelection) => Promise<void> | void;
  onRun: (question: string, provider: ChatProvider, model?: string, apiKey?: string) => Promise<void> | void;
  /** Phase 10 Slice C, "Run from selected node" — mocks every ancestor of
   * `nodeId` with a null placeholder so the run skips straight to it. */
  onRunFromNode?: (
    nodeId: string,
    question: string,
    provider: ChatProvider,
    model?: string,
    apiKey?: string,
  ) => Promise<void> | void;
  /** Phase 10 Slice C, "A real, labeled Validate action" — re-runs
   * diagnostics against the current canvas state without registering a
   * runnable artifact the way Compile does. */
  onValidate?: () => Promise<void> | void;
  onDiagnosticClick: (diagnostic: Diagnostic) => void;
  /** P2, "Cross-cutting policy overlays" — called after a policy exception
   * is created from the Waive button below, so the caller can re-validate
   * and pick up the now-non-blocking diagnostic. */
  onPolicyExceptionCreated?: () => void;
  runSummary: RunSummary | null;
  runHistory: RunSummary[];
  runHistoryLoading?: boolean;
  onSelectRun: (runId: string) => void;
  events: PlatformEvent[];
  selectedTrace: NodeTrace | null;
  selectedNodeId?: string | null;
  /** Historical run waterfall (studio-ux-gap-remediation-plan.md §2): every
   * trace for the currently-inspected/live run, keyed by node id. */
  nodeTraces?: Record<string, NodeTrace>;
  /** Bidirectional canvas link for the waterfall — pans/selects the node a
   * waterfall bar represents, reusing the same focus mechanism diagnostics
   * clicks use. */
  onFocusNode?: (nodeId: string) => void;
  inspectLoadError?: boolean;
  onRetryInspect?: () => void;
  compiling?: boolean;
  layout?: "rail" | "drawer";
  reducedMotion?: boolean;
  /** Graph header Run▾ menu / Validate chip (studio-graph-workbench-redesign-plan.md,
   * Slice 2): open and reveal a section. Keyed by `nonce`. */
  sectionRequest?: { sectionId: string; nonce: number } | null;
  /** Node toolbar "Run from here" (Slice 4): run from this node with the
   * panel's current inputs, once per `nonce`. */
  runFromNodeRequest?: { nodeId: string; nonce: number } | null;
  onRunFromNodeRequestHandled?: () => void;
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

  // P1 rollout plan, Slice B ("Fixture-based simulation and subgraph
  // stubbing") — fills the studio-ux-revision-plan.md Section 9 "Run with
  // fixture" slot. Self-contained (own client call + state), matching how
  // ReleasesPanel.tsx manages its own release calls rather than routing
  // through GraphEditor.tsx's onCompile/onRun props — simulate never
  // touches live run state (runSummary/runHistory), so there's nothing to
  // lift.
  const [fixtureInputText, setFixtureInputText] = useState('{"question": "How does a database index work?"}');
  const [fixtureNodeOutputsText, setFixtureNodeOutputsText] = useState("{}");
  const [simulating, setSimulating] = useState(false);
  const [simulateError, setSimulateError] = useState<string | null>(null);
  const [simulateResult, setSimulateResult] = useState<SimulateResult | null>(null);

  // P1 rollout plan, Slice C ("Historical replay") — fills the
  // studio-ux-revision-plan.md "Replay run" slot. Shares SimulateResult's
  // shape with the fixture section above (same run+traces response), but
  // keeps its own state/result display so replaying a past run never
  // overwrites an in-progress fixture simulation, or vice versa.
  const [replayingRunId, setReplayingRunId] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayResult, setReplayResult] = useState<SimulateResult | null>(null);

  // Phase 10 Slice A ("Studio shell UX remediation" — see
  // docs/planning/features/studio-shell-ux-gap-analysis.md): closes the
  // one real capability gap the standalone `/runs/[graphId]` page had over
  // this panel's own run history — viewing a run's pinned RunGraphSnapshot
  // (design doc, "Run history: labels the release or draft snapshot used;
  // opening it presents the exact snapshot in read-only inspection mode").
  const [snapshotRunId, setSnapshotRunId] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RunGraphSnapshot | null>(null);

  // P2, "Cross-cutting policy overlays" — waives a blocking `category:
  // "policy"` diagnostic with a fixed 30-day exception. Self-contained,
  // same pattern as simulate/replay above.
  const [waivingKey, setWaivingKey] = useState<string | null>(null);
  const [waiveError, setWaiveError] = useState<string | null>(null);

  const handleWaive = useCallback(
    async (diagnostic: Diagnostic, key: string) => {
      if (!graphId) return;
      setWaivingKey(key);
      setWaiveError(null);
      try {
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await client.createPolicyException(
          graphId,
          diagnostic.code,
          expiresAt,
          diagnostic.node_id ?? undefined,
          "Waived from Studio",
        );
        onPolicyExceptionCreated?.();
      } catch (err) {
        setWaiveError(err instanceof Error ? err.message : "Failed to waive diagnostic.");
      } finally {
        setWaivingKey(null);
      }
    },
    [graphId, onPolicyExceptionCreated],
  );

  const { openId, openSection, toggleSection } = useExclusiveCollapse(OBSERVE_OPEN_STORAGE_KEY, "observe-status");

  // Slice 2: observe-* sections are one exclusive (controlled) group --
  // open via openSection; run-* sections are independently persisted, so
  // they're force-opened via CollapsibleSection's revealNonce instead.
  // (This also fixes the pre-existing "Run with fixture…" menu item, which
  // called openSection on an uncontrolled section and so did nothing when
  // that section had been collapsed.)
  const [revealRequest, setRevealRequest] = useState<{ sectionId: string; nonce: number } | null>(null);
  const revealSection = useCallback(
    (sectionId: string) => {
      if (sectionId.startsWith("observe-")) openSection(sectionId);
      setRevealRequest({ sectionId, nonce: Date.now() });
    },
    [openSection],
  );
  const revealNonceFor = (sectionId: string) =>
    revealRequest?.sectionId === sectionId ? revealRequest.nonce : undefined;
  useEffect(() => {
    if (sectionRequest) revealSection(sectionRequest.sectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per request nonce
  }, [sectionRequest?.nonce]);

  // Phase 10 Slice C ("A real, labeled Validate action"): self-contained
  // loading state around the caller-supplied onValidate, same pattern as
  // Compile/Run's own disabled-while-busy handling above.
  const [validating, setValidating] = useState(false);
  const handleValidate = useCallback(async () => {
    setValidating(true);
    try {
      await onValidate?.();
    } finally {
      setValidating(false);
    }
  }, [onValidate]);

  const running = runSummary?.status === "queued" || runSummary?.status === "running";
  const summary = validationSummary(diagnostics);
  const inspecting = Boolean(inspectionRunId && runSummary);
  const showModelSelect = showModelCatalog(provider);
  const showApiKeyField = API_KEY_PROVIDERS.includes(provider);

  // Phase 10 Slice C ("Consolidate Run into a split-button model" +
  // "Debug run"): a trigger-anchored dropdown reusing NodeContextMenu's
  // existing "plain action list at an {x,y} point" component (Phase 7)
  // instead of the unused shadcn DropdownMenu in components/ui — that
  // primitive is Tailwind-styled and would mix styling systems inside
  // this token-styled (lib/graph-theme.ts) panel, the same reason
  // ui/Tabs.tsx avoided shadcn's Tabs in Slice B.
  const [runMenuAnchor, setRunMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const runMenuActions: NodeContextMenuAction[] = [
    ...(selectedNodeId && onRunFromNode
      ? [
          {
            label: "Run from selected node",
            title: "Runs downstream of this node only — upstream nodes are stubbed with empty values, not replayed.",
            onClick: () =>
              void onRunFromNode(
                selectedNodeId,
                question,
                provider,
                showModelSelect ? selectedModel || undefined : undefined,
                showApiKeyField ? apiKey.trim() || undefined : undefined,
              ),
          },
        ]
      : []),
    { label: "Run with fixture…", onClick: () => revealSection("run-simulate") },
    {
      label: "Debug run",
      onClick: () => {
        revealSection("observe-events");
        void onRun(
          question,
          provider,
          showModelSelect ? selectedModel || undefined : undefined,
          showApiKeyField ? apiKey.trim() || undefined : undefined,
        );
      },
    },
  ];

  // Node toolbar "Run from here" (Slice 4) -- consumed once per nonce, then
  // cleared by the caller so a later remount of this panel can't replay it.
  useEffect(() => {
    if (!runFromNodeRequest || !onRunFromNode) return;
    revealSection("observe-status");
    void onRunFromNode(
      runFromNodeRequest.nodeId,
      question,
      provider,
      showModelSelect ? selectedModel || undefined : undefined,
      showApiKeyField ? apiKey.trim() || undefined : undefined,
    );
    onRunFromNodeRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per request nonce, with the inputs as they are at that moment
  }, [runFromNodeRequest?.nonce]);

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
        logConsoleEntry({
          severity: "error",
          source: "Provider",
          message: `Failed to load provider credentials: ${err instanceof Error ? err.message : String(err)}`,
          graphId: graphId ?? undefined,
        });
        setApiKeyConfigured(false);
      });

    return () => {
      cancelled = true;
    };
  }, [provider, showApiKeyField, graphId]);

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
        logConsoleEntry({
          severity: "error",
          source: "Provider",
          message: `Failed to load provider models: ${err instanceof Error ? err.message : String(err)}`,
          graphId: graphId ?? undefined,
        });
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

  const handleSimulate = useCallback(async () => {
    if (!graphId) return;
    setSimulating(true);
    setSimulateError(null);
    try {
      const input = JSON.parse(fixtureInputText || "{}") as Record<string, unknown>;
      const node_outputs = JSON.parse(fixtureNodeOutputsText || "{}") as Record<string, unknown>;
      const result = await client.simulateGraph(graphId, { input, node_outputs });
      setSimulateResult(result);
    } catch (err) {
      setSimulateError(err instanceof Error ? err.message : String(err));
    } finally {
      setSimulating(false);
    }
  }, [fixtureInputText, fixtureNodeOutputsText, graphId]);

  const handleReplay = useCallback(async (runId: string) => {
    setReplayingRunId(runId);
    setReplayError(null);
    try {
      const result = await client.replayRun(runId);
      setReplayResult(result);
    } catch (err) {
      setReplayError(err instanceof Error ? err.message : String(err));
    } finally {
      setReplayingRunId(null);
    }
  }, []);

  const handleViewSnapshot = useCallback(async (runId: string) => {
    if (snapshotRunId === runId) {
      setSnapshotRunId(null);
      return;
    }
    setSnapshotRunId(runId);
    setSnapshotLoading(true);
    setSnapshotError(null);
    setSnapshot(null);
    try {
      const loaded = await client.getRunGraphSnapshot(runId);
      setSnapshot(loaded);
    } catch (err) {
      setSnapshotError(err instanceof Error ? err.message : String(err));
    } finally {
      setSnapshotLoading(false);
    }
  }, [snapshotRunId]);

  return (
    <div style={containerStyle(layout)}>
      <div data-testid="execute-group" style={executeGroupStyle}>
        <CollapsibleSection sectionId="run-controls" title="Execute" reducedMotion={reducedMotion} revealNonce={revealNonceFor("run-controls")}>
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
            {onValidate && (
              <Button variant="secondary" disabled={validating} onClick={() => void handleValidate()} style={{ minHeight: shell.touchTarget.min }}>
                {validating ? "Validating…" : "Validate"}
              </Button>
            )}
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
            <Button
              variant="primary"
              disabled={running || compiling}
              aria-label="More run options"
              style={{ minHeight: shell.touchTarget.min, padding: `0 ${spacing[1]}px` }}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setRunMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
              }}
            >
              <ChevronDown className="size-4" />
            </Button>
            {runMenuAnchor && (
              <NodeContextMenu
                x={runMenuAnchor.x}
                y={runMenuAnchor.y}
                title="Run"
                actions={runMenuActions}
                onClose={() => setRunMenuAnchor(null)}
              />
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection sectionId="run-simulate" title="Run with fixture" reducedMotion={reducedMotion} revealNonce={revealNonceFor("run-simulate")}>
          <div style={{ ...typeScale.caption, opacity: 0.7, lineHeight: "16px", marginBottom: spacing[2] }}>
            Simulates against the saved graph with no live tool or model calls — always uses the offline stub
            provider, plus any per-node outputs you stub below.
          </div>
          <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>Input (JSON)</div>
          <TextArea
            rows={2}
            style={{ minHeight: 48, resize: "vertical", fontFamily: fontFamily.mono }}
            value={fixtureInputText}
            onChange={(e) => setFixtureInputText(e.target.value)}
            disabled={simulating}
          />
          <div style={{ ...typeScale.caption, opacity: 0.6, marginTop: spacing[2], marginBottom: spacing[1] }}>
            Node output overrides (JSON: node id → mocked value)
          </div>
          <TextArea
            rows={2}
            style={{ minHeight: 48, resize: "vertical", fontFamily: fontFamily.mono }}
            value={fixtureNodeOutputsText}
            onChange={(e) => setFixtureNodeOutputsText(e.target.value)}
            placeholder='{"tool_lookup": "a recorded answer"}'
            disabled={simulating}
          />
          <div style={{ marginTop: spacing[2] }}>
            <Button variant="secondary" disabled={!graphId || simulating} onClick={() => void handleSimulate()} style={{ minHeight: shell.touchTarget.min }}>
              {simulating ? "Simulating…" : "Simulate"}
            </Button>
          </div>
          {simulateError && (
            <div style={{ ...typeScale.caption, color: accentSurface.destructive.text, marginTop: spacing[2], lineHeight: "16px" }}>
              {simulateError}
            </div>
          )}
          {simulateResult && (
            <div style={{ marginTop: spacing[2] }}>
              <div style={typeScale.caption}>
                {simulateResult.run.run_id} — <b>{simulateResult.run.status}</b>
              </div>
              {simulateResult.traces.map((trace) => (
                <div
                  key={trace.node_id}
                  style={{ ...typeScale.caption, opacity: 0.75, marginTop: spacing[1], fontFamily: fontFamily.mono }}
                >
                  {trace.node_id}: {JSON.stringify(trace.output)}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        <div ref={diagnosticsSectionRef} style={{ marginTop: spacing[2] }} tabIndex={-1} aria-live="polite" aria-label={`Graph validation: ${summary.label}`}>
          <CollapsibleSection
            sectionId="run-diagnostics"
            revealNonce={revealNonceFor("run-diagnostics")}
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
                const key = diagnosticKey(diagnostic, index);
                const content = (
                  <>
                    <span style={{ fontWeight: 600 }}>{diagnostic.severity === "error" ? "Error" : "Warning"}</span>
                    {": "}
                    {diagnostic.message}
                  </>
                );
                // P2, "Cross-cutting policy overlays" — only a blocking
                // policy diagnostic is waivable; a warning is already
                // non-blocking, and structural/contract diagnostics have
                // no exception mechanism.
                const waivable = diagnostic.category === "policy" && diagnostic.blocking && Boolean(graphId);
                const diagnosticNode = !clickable ? (
                  <div
                    style={{
                      ...typeScale.caption,
                      color: diagnostic.severity === "error" ? accentSurface.destructive.text : color.warning[500],
                      marginBottom: waivable ? 0 : spacing[1],
                      lineHeight: "16px",
                    }}
                  >
                    {content}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDiagnosticClick(diagnostic)}
                    style={{ ...diagnosticButtonStyle(diagnostic.severity), marginBottom: waivable ? 0 : spacing[1] }}
                  >
                    {content}
                  </button>
                );
                if (!waivable) {
                  return <div key={key}>{diagnosticNode}</div>;
                }
                return (
                  <div key={key} style={{ marginBottom: spacing[1] }}>
                    {diagnosticNode}
                    <Button
                      variant="secondary"
                      disabled={waivingKey === key}
                      onClick={() => void handleWaive(diagnostic, key)}
                      style={{ marginTop: spacing[1] - 2, minHeight: shell.touchTarget.min }}
                    >
                      {waivingKey === key ? "Waiving…" : "Waive (30 days)"}
                    </Button>
                  </div>
                );
              })
            )}
            {waiveError && (
              <div role="alert" style={{ ...typeScale.caption, color: accentSurface.destructive.text, marginTop: spacing[1] }}>
                {waiveError}
              </div>
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
                {(runSummary.status === "queued" || runSummary.status === "running") && (
                  <div style={{ marginTop: spacing[2] - 2 }} aria-busy="true" aria-label="Generating result">
                    <SkeletonBlock lines={3} gap={spacing[1]} />
                  </div>
                )}
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
            sectionId="observe-waterfall"
            title="Waterfall"
            open={openId === "observe-waterfall"}
            onOpenChange={() => toggleSection("observe-waterfall")}
            reducedMotion={reducedMotion}
          >
            {!runSummary ? (
              <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
                No run to inspect yet. Compile and run to see timing here.
              </div>
            ) : (
              <RunWaterfall
                nodeTraces={nodeTraces}
                runStartedAt={runSummary.started_at}
                runCompletedAt={runSummary.completed_at}
                selectedNodeId={selectedNodeId}
                onFocusNode={onFocusNode}
              />
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
              revealNonce={revealNonceFor("observe-events")}
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
              revealNonce={revealNonceFor("observe-history")}
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
                  <div key={run.run_id} style={{ marginBottom: spacing[2] }}>
                    <button
                      type="button"
                      onClick={() => onSelectRun(run.run_id)}
                      style={{
                        ...historyButtonStyle,
                        marginBottom: 0,
                        borderColor: active ? color.primary[600] : surface.borderStrong,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: spacing[2] }}>
                        <span style={{ fontWeight: 600 }}>{run.status}</span>
                        <span style={{ display: "flex", gap: spacing[1], opacity: 0.6 }}>
                          {/* P0 graph foundation, Slice D: labels whether this
                              run came from a published release (immune to
                              later draft edits) or the draft as it stood at
                              run time — design doc, "Run history: labels the
                              release or draft snapshot used." */}
                          {run.source === "release" && (
                            <span title={run.graph_release_id ?? undefined}>release</span>
                          )}
                          {run.provider && <span>{run.provider}</span>}
                        </span>
                      </div>
                      <div style={{ ...typeScale.caption, opacity: 0.75, textAlign: "left", marginTop: spacing[1] }}>
                        {formatRunLabel(run)}
                      </div>
                    </button>
                    <div style={{ display: "flex", gap: spacing[1], marginTop: spacing[1] }}>
                      {run.status === "succeeded" && (
                        <Button
                          variant="secondary"
                          disabled={replayingRunId !== null}
                          onClick={() => void handleReplay(run.run_id)}
                          style={{ minHeight: shell.touchTarget.min }}
                        >
                          {replayingRunId === run.run_id ? "Replaying…" : "Replay"}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        disabled={snapshotLoading && snapshotRunId === run.run_id}
                        onClick={() => void handleViewSnapshot(run.run_id)}
                        style={{ minHeight: shell.touchTarget.min }}
                      >
                        {snapshotRunId === run.run_id
                          ? snapshotLoading
                            ? "Loading…"
                            : "Hide snapshot"
                          : "View snapshot"}
                      </Button>
                    </div>
                    {snapshotRunId === run.run_id && (
                      <RunSnapshotDisplay snapshot={snapshot} error={snapshotError} />
                    )}
                  </div>
                );
              })
            )}
            {replayError && (
              <div style={{ ...typeScale.caption, color: accentSurface.destructive.text, marginTop: spacing[2], lineHeight: "16px" }}>
                {replayError}
              </div>
            )}
            {replayResult && (
              <div style={{ marginTop: spacing[2] }}>
                <div style={typeScale.caption}>
                  Replay of node outputs, read-only — <b>{replayResult.run.status}</b>
                </div>
                {replayResult.traces.map((trace) => (
                  <div
                    key={trace.node_id}
                    style={{ ...typeScale.caption, opacity: 0.75, marginTop: spacing[1], fontFamily: fontFamily.mono }}
                  >
                    {trace.node_id}: {JSON.stringify(trace.output)}
                  </div>
                ))}
              </div>
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
