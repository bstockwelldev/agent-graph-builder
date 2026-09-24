import type { CSSProperties, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bug,
  CheckCircle2,
  ChevronDown,
  Clock,
  FlaskConical,
  GitBranch,
  Hammer,
  History,
  KeyRound,
  List,
  Loader2,
  MoreHorizontal,
  Play,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  SkipForward,
  TextCursorInput,
  X,
  XCircle,
} from "lucide-react";
import { client } from "@/lib/api-client";
import { logConsoleEntry } from "@/lib/consoleLog";
import { validationSummary } from "@/lib/diagnostics";
import { showModelCatalog } from "@/lib/modelCatalog";
import { expiryFromNow, WAIVE_DURATIONS_DAYS } from "@/lib/policies";
import {
  INSPECT_LOAD_FAIL,
  RUN_RESULT_EMPTY,
  TRACE_MISSING,
  TRACE_SELECT_NODE,
  eventLogEmptyMessage,
  formatRunResult,
  resolveEventLogEvents,
} from "@/lib/observePanel";
import { formatRunInputs, recentInputValues } from "@/lib/runInputs";
import type {
  ChatProvider,
  CounterfactualResult,
  Diagnostic,
  GraphDefinition,
  NodeTrace,
  PlatformEvent,
  RunGraphSnapshot,
  ReplayRequest,
  RunSummary,
  SimulateResult,
} from "@bstockwelldev/agent-graph-sdk";
import { accentSurface, border, color, fontFamily, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { CounterfactualForm, CounterfactualResultView } from "./CounterfactualForm";
import { NodeContextMenu, menuAnchorFor, type NodeContextMenuAction } from "./NodeContextMenu";
import { ProviderDot, ProviderModelPicker, providerLabel } from "./ProviderModelPicker";
import { RunWaterfall } from "./RunWaterfall";
import { Button } from "./ui/Button";
import { Field } from "./ui/Field";
import { Group } from "./ui/Group";
import { IconButton } from "./ui/IconButton";
import { IconTabs, type IconTab } from "./ui/IconTabs";
import { PanelFrame, PanelHeader } from "./ui/PanelFrame";
import { SkeletonBlock } from "./ui/Skeleton";
import { TemplateEditor } from "./ui/TemplateEditor";
import { PasswordInput, TextArea } from "./ui/fields";
import { errorDetail } from "@/lib/apiErrors";

const API_KEY_PROVIDERS: ChatProvider[] = ["groq", "google", "azure", "openai_compat"];
const DEFAULT_QUESTION = "How does a database index work?";

export type RunSelection = {
  provider: ChatProvider;
  model?: string;
};

/** The run's input values, one per input-node variable (Wave 2.5). */
export type RunInput = Record<string, string>;

type ObserveTab = "status" | "waterfall" | "trace" | "events" | "history" | "issues";

/**
 * Legacy section ids (the header's Run▾ menu, the Validate chip, `/runs`
 * redirects, `?section=`) → where they live in the v2 console. The Observe
 * accordions became tabs; "run-simulate" is the fixture group; and
 * "run-controls" focuses the first input field.
 */
export function observeTabForSection(sectionId: string): ObserveTab | null {
  switch (sectionId) {
    case "observe-status":
      return "status";
    case "observe-waterfall":
      return "waterfall";
    case "observe-trace":
      return "trace";
    case "observe-events":
      return "events";
    case "observe-history":
      return "history";
    case "run-diagnostics":
      return "issues";
    default:
      return null;
  }
}

function msBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

function formatMs(ms: number | null): string | null {
  if (ms === null) return null;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatRunLabel(run: RunSummary): string {
  const snippet = formatRunInputs(run.input, 48) || run.run_id;
  const when = run.started_at ? new Date(run.started_at).toLocaleString() : "";
  return when ? `${snippet} · ${when}` : snippet;
}

function diagnosticKey(diagnostic: Diagnostic, index: number): string {
  return `${diagnostic.code}-${diagnostic.node_id ?? ""}-${diagnostic.edge_id ?? ""}-${index}`;
}

function shortModel(model: string): string {
  const tail = model.split("/").pop() ?? model;
  return tail.length > 18 ? `${tail.slice(0, 17)}…` : tail;
}

const STATUS_TONE: Record<string, string> = {
  succeeded: color.success[500],
  failed: color.error[500],
  running: color.primary[500],
  queued: text.secondary,
};

function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? text.secondary;
  const Icon = status === "succeeded" ? CheckCircle2 : status === "failed" ? XCircle : status === "running" ? Loader2 : Clock;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${tone}55`,
        background: `${tone}1a`,
        color: tone,
        fontSize: 11,
        fontWeight: 650,
        lineHeight: "16px",
        textTransform: "capitalize",
      }}
    >
      <Icon size={12} aria-hidden="true" className={status === "running" ? "animate-spin" : undefined} />
      {status}
    </span>
  );
}

function Muted({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 12, lineHeight: "18px", color: text.secondary, ...style }}>{children}</div>;
}

function EmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: spacing[2], padding: `${spacing[6]}px ${spacing[3]}px`, textAlign: "center", fontSize: 12, lineHeight: "18px", color: text.secondary }}>
      <span aria-hidden="true" style={{ display: "inline-flex", padding: 10, borderRadius: 999, background: surface.card, border: `1px solid ${border.subtle}` }}>
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}

function RunResultDisplay({ result }: { result: unknown }) {
  const formatted = formatRunResult(result);
  if (formatted.kind === "empty") {
    return <Muted style={{ marginTop: spacing[2] }}>{RUN_RESULT_EMPTY}</Muted>;
  }
  if (formatted.kind === "json") {
    return (
      <pre data-testid="run-result-json" style={{ ...preStyle, marginTop: spacing[2] }}>
        {formatted.text}
      </pre>
    );
  }
  return (
    <div
      data-testid="run-result-text"
      style={{ marginTop: spacing[2], fontSize: 13, lineHeight: "20px", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowX: "auto" }}
    >
      {formatted.text}
    </div>
  );
}

// Phase 10 Slice A — inline replacement for the retired `/runs/[graphId]`
// SnapshotDialog: source, fingerprint, release id, node/edge counts,
// embedded resource count, captured-at.
function RunSnapshotDisplay({ snapshot, error }: { snapshot: RunGraphSnapshot | null; error: string | null }) {
  if (error) {
    return (
      <div role="alert" style={{ ...typeScale.caption, color: accentSurface.destructive.text, marginTop: spacing[1] }}>
        {error}
      </div>
    );
  }
  if (!snapshot) return null;
  const mono: CSSProperties = { fontFamily: fontFamily.mono, wordBreak: "break-all" };
  return (
    <div style={{ marginTop: spacing[2], padding: spacing[2], borderRadius: radius.lg, border: `1px solid ${border.subtle}`, background: surface.inset, fontSize: 12, lineHeight: "18px" }}>
      <div style={{ fontWeight: 600 }}>{snapshot.source === "release" ? "Release" : "Draft snapshot"}</div>
      <Muted style={mono}>fingerprint: {snapshot.graph_fingerprint}</Muted>
      {snapshot.release_id && <Muted style={mono}>release: {snapshot.release_id}</Muted>}
      {snapshot.graph ? (
        <div style={{ marginTop: 4 }}>
          <div>{snapshot.graph.name}</div>
          <Muted>
            {snapshot.graph.nodes.length} nodes · {snapshot.graph.edges.length} edges
          </Muted>
        </div>
      ) : (
        <Muted style={{ marginTop: 4 }}>
          Release-sourced — the full graph and its resolved resource bindings are stored on the release itself, not
          duplicated here.
        </Muted>
      )}
      {snapshot.resource_snapshots && <Muted>Resources embedded: {Object.keys(snapshot.resource_snapshots).length}</Muted>}
      <Muted style={{ marginTop: 4 }}>Captured: {new Date(snapshot.created_at).toLocaleString()}</Muted>
    </div>
  );
}

/**
 * Run console (studio-graph-workbench-redesign-plan.md, Wave 2.5 "Inspector
 * & Run console v2"). One labeled input per input-node variable, the model
 * behind a provider chip, a sticky action bar with one primary Run, and the
 * Observe accordions reworked into icon tabs with counts.
 */
export function RunPanel({
  graphId,
  inputVariables = ["question"],
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
  getGraph,
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
  sectionRequest = null,
  runFromNodeRequest = null,
  onRunFromNodeRequestHandled,
  onCaptureDataset,
}: {
  graphId: string | null;
  /** The graph's input variables (lib/runInputs.ts `runInputVariables`):
   * the console renders one field per variable. */
  inputVariables?: readonly string[];
  diagnostics: Diagnostic[];
  diagnosticsSectionRef?: RefObject<HTMLDivElement | null>;
  providerBlockMessage?: string | null;
  inspectionRunId?: string | null;
  onExitInspection?: () => void;
  onCompile: (selection: RunSelection) => Promise<void> | void;
  onRun: (input: RunInput, provider: ChatProvider, model?: string, apiKey?: string) => Promise<void> | void;
  /** Phase 10 Slice C, "Run from selected node" — mocks every ancestor of
   * `nodeId` with a null placeholder so the run skips straight to it. */
  onRunFromNode?: (
    nodeId: string,
    input: RunInput,
    provider: ChatProvider,
    model?: string,
    apiKey?: string,
  ) => Promise<void> | void;
  /** Re-runs diagnostics against the current canvas without registering a
   * runnable artifact the way Compile does. */
  onValidate?: () => Promise<void> | void;
  onDiagnosticClick: (diagnostic: Diagnostic) => void;
  /** Called after a policy exception is created from the Waive button. */
  onPolicyExceptionCreated?: () => void;
  /** The canvas graph, for choosing what a counterfactual replay changes (STO-609). */
  getGraph?: () => GraphDefinition;
  runSummary: RunSummary | null;
  runHistory: RunSummary[];
  runHistoryLoading?: boolean;
  onSelectRun: (runId: string) => void;
  events: PlatformEvent[];
  selectedTrace: NodeTrace | null;
  selectedNodeId?: string | null;
  /** Every trace for the currently-inspected/live run, keyed by node id. */
  nodeTraces?: Record<string, NodeTrace>;
  /** Pans/selects a node on the canvas (waterfall bars, event rows). */
  onFocusNode?: (nodeId: string) => void;
  inspectLoadError?: boolean;
  onRetryInspect?: () => void;
  compiling?: boolean;
  /** Kept for call-site compatibility; the console always fills its slot. */
  layout?: "rail" | "drawer";
  reducedMotion?: boolean;
  /** Header Run▾ menu / Validate chip: reveal a section. Keyed by `nonce`. */
  sectionRequest?: { sectionId: string; nonce: number } | null;
  /** Node toolbar "Run from here": run from this node with the console's
   * current inputs, once per `nonce`. */
  runFromNodeRequest?: { nodeId: string; nonce: number } | null;
  onRunFromNodeRequestHandled?: () => void;
  /** Capture the selected history runs as a Routing Lab dataset. The caller
   * renders the (shadcn) dialog; this token-styled panel must not. */
  onCaptureDataset?: (runs: RunSummary[]) => void;
}) {
  // ---- inputs -------------------------------------------------------------
  const variablesKey = inputVariables.join("\u0000");
  const [inputs, setInputs] = useState<RunInput>(() =>
    Object.fromEntries(inputVariables.map((name) => [name, name === "question" ? DEFAULT_QUESTION : ""])),
  );
  // New variables get a field; values for removed ones are kept (so
  // renaming a variable back doesn't lose what was typed) but not sent.
  useEffect(() => {
    setInputs((current) => {
      const missing = inputVariables.filter((name) => !(name in current));
      if (missing.length === 0) return current;
      return { ...current, ...Object.fromEntries(missing.map((name) => [name, ""])) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the variable list's contents
  }, [variablesKey]);
  const runInput = useMemo<RunInput>(
    () => Object.fromEntries(inputVariables.map((name) => [name, inputs[name] ?? ""])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the variable list's contents
    [inputs, variablesKey],
  );
  const inputsRef = useRef<HTMLDivElement>(null);
  const [recentMenu, setRecentMenu] = useState<{ variable: string; x: number; y: number } | null>(null);

  // ---- provider / model -----------------------------------------------------
  const [provider, setProvider] = useState<ChatProvider>("stub");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [apiKeyLabel, setApiKeyLabel] = useState("API key");
  const [apiKeyEnvVar, setApiKeyEnvVar] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const sendsModel = showModelCatalog(provider) || provider === "openai_compat";
  const showApiKeyField = API_KEY_PROVIDERS.includes(provider);
  const modelArg = sendsModel ? selectedModel || undefined : undefined;
  const apiKeyArg = showApiKeyField ? apiKey.trim() || undefined : undefined;

  useEffect(() => {
    if (providerBlockMessage) setModelSettingsOpen(true);
  }, [providerBlockMessage]);

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
          message: `Failed to load provider credentials: ${errorDetail(err)}`,
          graphId: graphId ?? undefined,
        });
        setApiKeyConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, showApiKeyField, graphId]);

  // ---- observe tabs -------------------------------------------------------
  const [activeTab, setActiveTab] = useState<ObserveTab>("status");
  const observeRef = useRef<HTMLDivElement | null>(null);

  // ---- fixture simulation (P1 Slice B) ------------------------------------
  // Self-contained: simulate never touches live run state, so nothing to lift.
  const [fixtureOpen, setFixtureOpen] = useState(false);
  const fixtureRef = useRef<HTMLDivElement>(null);
  const [fixtureInputText, setFixtureInputText] = useState("");
  const [fixtureInputEdited, setFixtureInputEdited] = useState(false);
  const [fixtureNodeOutputsText, setFixtureNodeOutputsText] = useState("{}");
  const [simulating, setSimulating] = useState(false);
  const [simulateError, setSimulateError] = useState<string | null>(null);
  const [simulateResult, setSimulateResult] = useState<SimulateResult | null>(null);

  const openFixture = useCallback(() => {
    setFixtureOpen(true);
    // Defaults to the console's current inputs until the user edits the JSON.
    if (!fixtureInputEdited) setFixtureInputText(JSON.stringify(runInput, null, 2));
    window.requestAnimationFrame(() => fixtureRef.current?.scrollIntoView({ block: "nearest" }));
  }, [fixtureInputEdited, runInput]);

  // ---- historical replay (P1 Slice C) + snapshots (Phase 10 Slice A) -------
  const [replayingRunId, setReplayingRunId] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayResult, setReplayResult] = useState<CounterfactualResult | null>(null);
  // STO-609: the run whose "Replay with changes…" form is open.
  const [counterfactualRunId, setCounterfactualRunId] = useState<string | null>(null);
  const [snapshotRunId, setSnapshotRunId] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RunGraphSnapshot | null>(null);
  const [selectedRunIds, setSelectedRunIds] = useState<ReadonlySet<string>>(new Set());
  const toggleRunSelected = (runId: string) =>
    setSelectedRunIds((current) => {
      const next = new Set(current);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });

  // ---- policy waivers (P2) --------------------------------------------------
  const [waivingKey, setWaivingKey] = useState<string | null>(null);
  const [waiveError, setWaiveError] = useState<string | null>(null);
  const handleWaive = useCallback(
    async (diagnostic: Diagnostic, key: string, days: number) => {
      if (!graphId) return;
      setWaivingKey(key);
      setWaiveError(null);
      try {
        await client.createPolicyException(graphId, diagnostic.code, expiryFromNow(days), diagnostic.node_id ?? undefined, "Waived from Studio");
        onPolicyExceptionCreated?.();
      } catch (err) {
        setWaiveError(err instanceof Error ? err.message : "Failed to waive diagnostic.");
      } finally {
        setWaivingKey(null);
      }
    },
    [graphId, onPolicyExceptionCreated],
  );

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
  const busy = running || compiling;
  const summary = validationSummary(diagnostics);
  const inspecting = Boolean(inspectionRunId && runSummary);
  // GraphEditor also "inspects" the run it just started (so the canvas shows
  // its traces); only call it out when it's an earlier run from history.
  const inspectingEarlierRun = inspecting && !running && runHistory[0]?.run_id !== inspectionRunId;
  const displayedEvents = resolveEventLogEvents(events, runSummary?.events);

  const run = useCallback(() => {
    if (busy) return;
    void onRun(runInput, provider, modelArg, apiKeyArg);
  }, [apiKeyArg, busy, modelArg, onRun, provider, runInput]);

  const revealSection = useCallback(
    (sectionId: string) => {
      const tab = observeTabForSection(sectionId);
      if (tab) {
        setActiveTab(tab);
        window.requestAnimationFrame(() => observeRef.current?.scrollIntoView({ block: "nearest" }));
      } else if (sectionId === "run-simulate") {
        openFixture();
      } else if (sectionId === "run-controls") {
        window.requestAnimationFrame(() => inputsRef.current?.querySelector("textarea")?.focus());
      }
    },
    [openFixture],
  );
  useEffect(() => {
    if (sectionRequest) revealSection(sectionRequest.sectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per request nonce
  }, [sectionRequest?.nonce]);

  // Node toolbar "Run from here" -- consumed once per nonce, then cleared by
  // the caller so a later remount of this panel can't replay it.
  useEffect(() => {
    if (!runFromNodeRequest || !onRunFromNode) return;
    setActiveTab("status");
    void onRunFromNode(runFromNodeRequest.nodeId, runInput, provider, modelArg, apiKeyArg);
    onRunFromNodeRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per request nonce, with the inputs as they are at that moment
  }, [runFromNodeRequest?.nonce]);

  // A new run shows its status; picking a traced node shows its trace.
  const lastRunIdRef = useRef<string | undefined>(runSummary?.run_id);
  useEffect(() => {
    const runId = runSummary?.run_id;
    if (runId && runId !== lastRunIdRef.current) setActiveTab("status");
    lastRunIdRef.current = runId;
  }, [runSummary?.run_id]);
  const lastTraceIdRef = useRef<string | undefined>(selectedTrace?.node_id);
  useEffect(() => {
    const nodeId = selectedTrace?.node_id;
    if (nodeId && nodeId !== lastTraceIdRef.current) setActiveTab("trace");
    lastTraceIdRef.current = nodeId;
  }, [selectedTrace?.node_id]);

  const handleSimulate = useCallback(async () => {
    if (!graphId) return;
    setSimulating(true);
    setSimulateError(null);
    try {
      const input = JSON.parse(fixtureInputText || "{}") as Record<string, unknown>;
      const node_outputs = JSON.parse(fixtureNodeOutputsText || "{}") as Record<string, unknown>;
      setSimulateResult(await client.simulateGraph(graphId, { input, node_outputs }));
    } catch (err) {
      setSimulateError(errorDetail(err));
    } finally {
      setSimulating(false);
    }
  }, [fixtureInputText, fixtureNodeOutputsText, graphId]);

  const handleReplay = useCallback(async (runId: string, request?: ReplayRequest) => {
    setReplayingRunId(runId);
    setReplayError(null);
    try {
      setReplayResult(await client.replayRun(runId, request));
      setCounterfactualRunId(null);
    } catch (err) {
      setReplayError(errorDetail(err));
    } finally {
      setReplayingRunId(null);
    }
  }, []);

  const handleViewSnapshot = useCallback(
    async (runId: string) => {
      if (snapshotRunId === runId) {
        setSnapshotRunId(null);
        return;
      }
      setSnapshotRunId(runId);
      setSnapshotLoading(true);
      setSnapshotError(null);
      setSnapshot(null);
      try {
        setSnapshot(await client.getRunGraphSnapshot(runId));
      } catch (err) {
        setSnapshotError(errorDetail(err));
      } finally {
        setSnapshotLoading(false);
      }
    },
    [snapshotRunId],
  );

  // ---- overflow menu ------------------------------------------------------
  const moreRef = useRef<HTMLButtonElement>(null);
  const [moreAnchor, setMoreAnchor] = useState<{ x: number; y: number } | null>(null);
  const moreActions: NodeContextMenuAction[] = [
    {
      label: compiling ? "Compiling…" : "Compile",
      icon: <Hammer size={14} />,
      disabled: busy,
      onClick: () => void onCompile({ provider, model: modelArg }),
    },
    {
      label: "Debug run",
      icon: <Bug size={14} />,
      title: "Runs and opens the live event log.",
      disabled: busy,
      onClick: () => {
        setActiveTab("events");
        run();
      },
    },
    ...(selectedNodeId && onRunFromNode
      ? [
          {
            label: "Run from selected node",
            icon: <SkipForward size={14} />,
            title: "Runs downstream of this node only — upstream nodes are stubbed with empty values, not replayed.",
            disabled: busy,
            onClick: () => void onRunFromNode(selectedNodeId, runInput, provider, modelArg, apiKeyArg),
          },
        ]
      : []),
    { label: "Run with fixture…", icon: <FlaskConical size={14} />, separatorBefore: true, onClick: openFixture },
  ];

  // ---- header -------------------------------------------------------------
  const chipLabel = sendsModel && selectedModel ? shortModel(selectedModel) : providerLabel(provider);
  const header = (
    <PanelHeader
      icon={
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: radius.lg, background: `${color.primary[500]}1f`, color: color.primary[500], flexShrink: 0 }}>
          <Play size={16} />
        </span>
      }
      title="Run"
      subtitle={
        <button
          type="button"
          onClick={() => setActiveTab("issues")}
          className="agb-focus-ring"
          title="Show validation issues"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 0, border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: summary.errors ? color.error[500] : summary.warnings ? color.warning[500] : color.success[500] }}
        >
          {summary.errors ? <XCircle size={12} aria-hidden="true" /> : summary.warnings ? <AlertTriangle size={12} aria-hidden="true" /> : <ShieldCheck size={12} aria-hidden="true" />}
          {summary.label}
        </button>
      }
      actions={
        <button
          type="button"
          aria-expanded={modelSettingsOpen}
          aria-controls="run-model-settings"
          aria-label={`Model: ${providerLabel(provider)}${sendsModel && selectedModel ? ` · ${selectedModel}` : ""}. Change model settings`}
          title="Model settings for this run"
          onClick={() => setModelSettingsOpen((open) => !open)}
          className="agb-focus-ring agb-hoverable"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, maxWidth: 170, padding: "0 8px 0 10px", borderRadius: 999, border: `1px solid ${modelSettingsOpen ? border.focus : border.default}`, background: surface.inset, color: text.primary, fontSize: 12, fontWeight: 550, cursor: "pointer" }}
        >
          <ProviderDot provider={provider} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chipLabel}</span>
          <ChevronDown size={13} aria-hidden="true" style={{ flexShrink: 0, color: text.secondary, transform: modelSettingsOpen ? "rotate(180deg)" : undefined }} />
        </button>
      }
    />
  );

  // ---- footer (primary action bar) ------------------------------------------
  const footer = (
    <div style={{ display: "flex", alignItems: "center", gap: spacing[2] }}>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="agb-focus-ring"
        aria-keyshortcuts="Meta+Enter Control+Enter"
        style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 40, padding: "0 14px", borderRadius: radius.lg, border: `1px solid ${color.primary[600]}`, background: color.primary[700], color: text.primary, fontSize: 14, fontWeight: 650, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1 }}
      >
        {running || compiling ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        {running ? "Running…" : compiling ? "Preparing…" : "Run"}
        {!busy && (
          <kbd aria-hidden="true" style={{ marginLeft: 2, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.14)", fontFamily: "inherit", fontSize: 11, fontWeight: 600 }}>
            ⌘↵
          </kbd>
        )}
      </button>
      {onValidate && (
        <button
          type="button"
          onClick={() => void handleValidate()}
          disabled={validating}
          className="agb-focus-ring agb-hoverable"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 40, padding: "0 12px", borderRadius: radius.lg, border: `1px solid ${border.default}`, background: surface.card, color: text.primary, fontSize: 13, fontWeight: 550, cursor: "pointer" }}
        >
          {validating ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
          {validating ? "Validating…" : "Validate"}
        </button>
      )}
      <IconButton
        ref={moreRef}
        label="More run options"
        icon={<MoreHorizontal size={17} />}
        aria-haspopup="menu"
        tooltipPlacement="top"
        style={{ width: 40, height: 40, border: `1px solid ${border.default}`, background: surface.card }}
        onClick={() => moreRef.current && setMoreAnchor(menuAnchorFor(moreRef.current, "right", 240))}
      />
      {moreAnchor && (
        <NodeContextMenu
          x={moreAnchor.x}
          y={moreAnchor.y}
          width={240}
          title="Run"
          actions={moreActions}
          onClose={() => setMoreAnchor(null)}
        />
      )}
    </div>
  );

  // ---- observe tabs -------------------------------------------------------
  const tabs: IconTab[] = [
    { id: "status", label: "Status", icon: <Activity size={14} /> },
    { id: "waterfall", label: "Waterfall", icon: <BarChart3 size={14} />, iconOnly: true },
    { id: "trace", label: "Trace", icon: <ScanSearch size={14} />, iconOnly: true },
    { id: "events", label: "Events", icon: <List size={14} />, count: displayedEvents.length },
    { id: "history", label: "History", icon: <History size={14} />, count: runHistory.length, iconOnly: true },
    {
      id: "issues",
      label: "Issues",
      icon: <AlertTriangle size={14} />,
      count: diagnostics.length,
      countTone: summary.errors ? "error" : summary.warnings ? "warning" : "neutral",
    },
  ];

  return (
    <PanelFrame aria-label="Run console" header={header} footer={footer}>
      {modelSettingsOpen && (
        <div id="run-model-settings">
          <Group
            title="Model"
            icon={<ProviderDot provider={provider} />}
            action={<IconButton label="Close model settings" icon={<X size={14} />} onClick={() => setModelSettingsOpen(false)} style={{ width: 26, height: 26 }} />}
          >
            <Muted style={{ marginBottom: spacing[2] }}>Overrides every LLM node for this run. Each LLM node keeps its own default.</Muted>
            <ProviderModelPicker
              graphId={graphId}
              provider={provider}
              model={selectedModel}
              onProviderChange={(next) => {
                setProvider(next);
                setSelectedModel("");
              }}
              onModelChange={setSelectedModel}
              disabled={busy}
            />
            {showApiKeyField && (
              <Field
                label={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <KeyRound size={12} aria-hidden="true" />
                    {apiKeyLabel}
                  </span>
                }
                hint={apiKeyEnvVar ? `Server variable: ${apiKeyEnvVar}` : undefined}
                meta={apiKeyConfigured ? <span style={{ color: color.success[500] }}>Configured on server</span> : undefined}
              >
                {(id) => (
                  <PasswordInput
                    id={id}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={apiKeyConfigured ? "Leave blank to use the server's key" : `Enter ${apiKeyEnvVar || "API key"}`}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                  />
                )}
              </Field>
            )}
          </Group>
        </div>
      )}
      {providerBlockMessage && (
        <div role="alert" style={alertStyle}>
          <XCircle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          {providerBlockMessage}
        </div>
      )}

      {inspectingEarlierRun && runSummary && (
        <div style={{ ...alertStyle, color: text.primary, background: `${color.primary[500]}14`, borderColor: `${color.primary[500]}40`, alignItems: "center" }}>
          <History size={14} aria-hidden="true" style={{ flexShrink: 0, color: color.primary[500] }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            Inspecting an earlier run
            {runSummary.started_at && <Muted>{new Date(runSummary.started_at).toLocaleString()}</Muted>}
          </span>
          {onExitInspection && (
            <Button variant="secondary" onClick={onExitInspection} style={{ fontSize: 12, padding: "4px 10px" }}>
              Exit inspection
            </Button>
          )}
        </div>
      )}

      <div ref={inputsRef}>
        <Group title={inputVariables.length > 1 ? `Inputs · ${inputVariables.length}` : "Input"} icon={<TextCursorInput size={13} />}>
          {inputVariables.map((variable, index) => {
            const recent = recentInputValues(runHistory, variable);
            return (
              <Field
                key={variable}
                label={<code style={{ fontFamily: fontFamily.mono, fontSize: 12 }}>{variable}</code>}
                meta={
                  recent.length > 0 ? (
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-label={`Recent values for ${variable}`}
                      className="agb-focus-ring agb-hoverable"
                      onClick={(event) => setRecentMenu({ variable, ...menuAnchorFor(event.currentTarget, "right", 280) })}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: radius.md, border: "none", background: "transparent", color: text.secondary, fontSize: 11, cursor: "pointer" }}
                    >
                      <RotateCcw size={11} aria-hidden="true" />
                      Recent
                    </button>
                  ) : undefined
                }
              >
                {(id) => (
                  <div style={{ marginBottom: index === inputVariables.length - 1 ? -spacing[3] : 0 }}>
                    <TemplateEditor
                      id={id}
                      plain
                      rows={inputVariables.length > 1 ? 2 : 3}
                      value={inputs[variable] ?? ""}
                      onChange={(value) => setInputs((current) => ({ ...current, [variable]: value }))}
                      placeholder={variable === "question" ? "Ask the graph something…" : `Value for {${variable}}`}
                      onSubmit={run}
                      title={`Input: ${variable}`}
                    />
                  </div>
                )}
              </Field>
            );
          })}
        </Group>
      </div>
      {recentMenu && (
        <NodeContextMenu
          x={recentMenu.x}
          y={recentMenu.y}
          width={280}
          title={`Recent · ${recentMenu.variable}`}
          onClose={() => setRecentMenu(null)}
          actions={recentInputValues(runHistory, recentMenu.variable).map((value) => ({
            label: value.length > 42 ? `${value.slice(0, 41)}…` : value,
            title: value,
            onClick: () => setInputs((current) => ({ ...current, [recentMenu.variable]: value })),
          }))}
        />
      )}

      {fixtureOpen && (
        <div ref={fixtureRef}>
          <Group
            title="Run with fixture"
            icon={<FlaskConical size={13} />}
            action={<IconButton label="Close fixture simulation" icon={<X size={14} />} onClick={() => setFixtureOpen(false)} style={{ width: 26, height: 26 }} />}
          >
            <Muted style={{ marginBottom: spacing[2] }}>
              Simulates the saved graph with no live tool or model calls — always the offline stub provider, plus any
              per-node outputs you stub below.
            </Muted>
            <Field label="Input (JSON)">
              {(id) => (
                <TextArea
                  id={id}
                  rows={3}
                  style={{ fontFamily: fontFamily.mono, fontSize: 12 }}
                  value={fixtureInputText}
                  onChange={(e) => {
                    setFixtureInputText(e.target.value);
                    setFixtureInputEdited(true);
                  }}
                  disabled={simulating}
                />
              )}
            </Field>
            <Field label="Node output overrides (JSON: node id → mocked value)">
              {(id) => (
                <TextArea
                  id={id}
                  rows={2}
                  style={{ fontFamily: fontFamily.mono, fontSize: 12 }}
                  value={fixtureNodeOutputsText}
                  onChange={(e) => setFixtureNodeOutputsText(e.target.value)}
                  placeholder='{"tool_lookup": "a recorded answer"}'
                  disabled={simulating}
                />
              )}
            </Field>
            <Button variant="secondary" disabled={!graphId || simulating} onClick={() => void handleSimulate()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <FlaskConical size={14} aria-hidden="true" />
              {simulating ? "Simulating…" : "Simulate"}
            </Button>
            {simulateError && <div role="alert" style={{ ...alertStyle, marginTop: spacing[2], marginBottom: 0 }}>{simulateError}</div>}
            {simulateResult && (
              <div style={{ marginTop: spacing[2] }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <StatusPill status={simulateResult.run.status} />
                  <code style={{ fontFamily: fontFamily.mono, color: text.secondary }}>{simulateResult.run.run_id}</code>
                </div>
                {simulateResult.traces.map((trace) => (
                  <Muted key={trace.node_id} style={{ marginTop: 4, fontFamily: fontFamily.mono }}>
                    {trace.node_id}: {JSON.stringify(trace.output)}
                  </Muted>
                ))}
              </div>
            )}
          </Group>
        </div>
      )}

      {/* The diagnostics focus target (GraphEditor's focusDiagnostics): it
          wraps the whole Observe region, and focusing it directly opens the
          Issues tab. */}
      <div
        ref={(el) => {
          observeRef.current = el;
          if (diagnosticsSectionRef) diagnosticsSectionRef.current = el;
        }}
        tabIndex={-1}
        aria-label={`Graph validation: ${summary.label}`}
        onFocus={(event) => {
          if (event.target === event.currentTarget) setActiveTab("issues");
        }}
        style={{ outline: "none", scrollMarginTop: spacing[2] }}
      >
        <div style={{ margin: `0 -${spacing[3]}px ${spacing[3]}px`, padding: `0 ${spacing[1]}px` }}>
          <IconTabs aria-label="Observe" idPrefix="observe" tabs={tabs} activeId={activeTab} onChange={(id) => setActiveTab(id as ObserveTab)} />
        </div>
        {inspectLoadError && (
          <div role="alert" style={alertStyle}>
            <span style={{ flex: 1 }}>{INSPECT_LOAD_FAIL}</span>
            {onRetryInspect && (
              <Button variant="secondary" onClick={onRetryInspect} style={{ fontSize: 12, padding: "4px 10px" }}>
                Retry
              </Button>
            )}
          </div>
        )}
        <div role="tabpanel" id={`observe-panel-${activeTab}`} aria-labelledby={`observe-tab-${activeTab}`} aria-live={activeTab === "events" ? "polite" : undefined}>
          {activeTab === "status" &&
            (!runSummary ? (
              <EmptyState icon={<Play size={18} color={color.primary[500]} />}>
                No run yet. Fill in the {inputVariables.length > 1 ? "inputs" : "input"} and press <b style={{ color: text.primary }}>Run</b> (⌘↵).
              </EmptyState>
            ) : (
              <Group>
                <div style={{ display: "flex", alignItems: "center", gap: spacing[2], flexWrap: "wrap" }}>
                  <StatusPill status={runSummary.status} />
                  {formatMs(msBetween(runSummary.started_at, runSummary.completed_at)) && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: text.secondary }}>
                      <Clock size={12} aria-hidden="true" />
                      {formatMs(msBetween(runSummary.started_at, runSummary.completed_at))}
                    </span>
                  )}
                  {runSummary.provider && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: text.secondary }}>
                      <ProviderDot provider={runSummary.provider} size={7} />
                      {providerLabel(runSummary.provider)}
                    </span>
                  )}
                  <code title={runSummary.run_id} style={{ marginLeft: "auto", fontFamily: fontFamily.mono, fontSize: 11, color: text.secondary, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {runSummary.run_id}
                  </code>
                </div>
                {runSummary.input && Object.keys(runSummary.input).length > 0 && (
                  <dl style={{ margin: `${spacing[2]}px 0 0`, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px", fontSize: 12, lineHeight: "18px" }}>
                    {Object.entries(runSummary.input).map(([key, value]) => (
                      <div key={key} style={{ display: "contents" }}>
                        <dt style={{ fontFamily: fontFamily.mono, color: text.secondary }}>{key}</dt>
                        <dd style={{ margin: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={String(value)}>
                          {typeof value === "string" ? value : JSON.stringify(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div style={{ borderTop: `1px solid ${border.subtle}`, marginTop: spacing[2], paddingTop: 2 }}>
                  {running && (
                    <div style={{ marginTop: spacing[2] }} aria-busy="true" aria-label="Generating result">
                      <SkeletonBlock lines={3} gap={spacing[1]} />
                    </div>
                  )}
                  {runSummary.status === "succeeded" && <RunResultDisplay result={runSummary.result} />}
                  {runSummary.status === "failed" && runSummary.error && (
                    <div role="alert" style={{ ...alertStyle, marginTop: spacing[2], marginBottom: 0, whiteSpace: "pre-wrap" }}>
                      {runSummary.error}
                    </div>
                  )}
                </div>
              </Group>
            ))}

          {activeTab === "waterfall" &&
            (!runSummary ? (
              <EmptyState icon={<BarChart3 size={18} />}>No run to inspect yet. Run the graph to see node timing here.</EmptyState>
            ) : (
              <RunWaterfall
                nodeTraces={nodeTraces}
                runStartedAt={runSummary.started_at}
                runCompletedAt={runSummary.completed_at}
                selectedNodeId={selectedNodeId}
                onFocusNode={onFocusNode}
              />
            ))}

          {activeTab === "trace" &&
            (!selectedNodeId ? (
              <EmptyState icon={<ScanSearch size={18} />}>{TRACE_SELECT_NODE}</EmptyState>
            ) : !selectedTrace ? (
              <EmptyState icon={<ScanSearch size={18} />}>{TRACE_MISSING}</EmptyState>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: spacing[2], marginBottom: spacing[2] }}>
                  <code style={{ fontFamily: fontFamily.mono, fontSize: 12, fontWeight: 600 }}>{selectedTrace.node_id}</code>
                  <StatusPill status={selectedTrace.status} />
                  {formatMs(msBetween(selectedTrace.started_at, selectedTrace.completed_at)) && (
                    <Muted>{formatMs(msBetween(selectedTrace.started_at, selectedTrace.completed_at))}</Muted>
                  )}
                </div>
                <Group title="Input">
                  <pre style={{ ...preStyle, margin: 0 }}>{JSON.stringify(selectedTrace.input, null, 2)}</pre>
                </Group>
                <Group title="Output">
                  <pre style={{ ...preStyle, margin: 0 }}>{JSON.stringify(selectedTrace.output, null, 2)}</pre>
                </Group>
                {selectedTrace.error && <div role="alert" style={alertStyle}>{selectedTrace.error}</div>}
              </>
            ))}

          {activeTab === "events" &&
            (displayedEvents.length === 0 ? (
              <EmptyState icon={<List size={18} />}>{eventLogEmptyMessage(inspecting)}</EmptyState>
            ) : (
              <Group flush>
                <div style={{ padding: spacing[1] }}>
                  {displayedEvents.map((e) =>
                    // Node events focus their node on the canvas.
                    e.node_id && onFocusNode ? (
                      <button
                        key={e.sequence}
                        type="button"
                        className="agb-focus-ring agb-hoverable"
                        onClick={() => onFocusNode(e.node_id!)}
                        title={`Focus ${e.node_id} on the canvas`}
                        style={eventRowStyle}
                      >
                        <span style={{ color: text.secondary, minWidth: 24 }}>{e.sequence}</span>
                        <span>{e.event_type}</span>
                        <span style={{ marginLeft: "auto", color: color.primary[500] }}>{e.node_id}</span>
                      </button>
                    ) : (
                      <div key={e.sequence} style={{ ...eventRowStyle, cursor: "default" }}>
                        <span style={{ color: text.secondary, minWidth: 24 }}>{e.sequence}</span>
                        <span>{e.event_type}</span>
                        {e.node_id && <span style={{ marginLeft: "auto", color: text.secondary }}>{e.node_id}</span>}
                      </div>
                    ),
                  )}
                </div>
              </Group>
            ))}

          {activeTab === "history" && (
            <>
              {runHistoryLoading ? (
                <SkeletonBlock lines={2} gap={spacing[2]} />
              ) : runHistory.length === 0 ? (
                <EmptyState icon={<History size={18} />}>No runs yet for this graph. Run it to build a history here.</EmptyState>
              ) : (
                <>
                  {onCaptureDataset && (
                    <div style={{ display: "flex", alignItems: "center", gap: spacing[2], marginBottom: spacing[2] }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: text.secondary, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          aria-label="Select all runs"
                          checked={selectedRunIds.size > 0 && selectedRunIds.size === runHistory.length}
                          onChange={() =>
                            setSelectedRunIds((current) =>
                              current.size === runHistory.length ? new Set() : new Set(runHistory.map((item) => item.run_id)),
                            )
                          }
                        />
                        All
                      </label>
                      <Button
                        variant="secondary"
                        disabled={selectedRunIds.size === 0}
                        onClick={() => onCaptureDataset(runHistory.filter((item) => selectedRunIds.has(item.run_id)))}
                        style={{ marginLeft: "auto", fontSize: 12, padding: "4px 10px" }}
                      >
                        {selectedRunIds.size > 0 ? `Save ${selectedRunIds.size} as dataset` : "Select runs to save as dataset"}
                      </Button>
                    </div>
                  )}
                  {runHistory.map((item) => {
                    const active = inspectionRunId ? item.run_id === inspectionRunId : runSummary?.run_id === item.run_id;
                    return (
                      <div key={item.run_id} style={{ display: "flex", gap: spacing[2], alignItems: "flex-start", marginBottom: spacing[2] }}>
                        {onCaptureDataset && (
                          <input
                            type="checkbox"
                            aria-label={`Select run ${item.run_id}`}
                            checked={selectedRunIds.has(item.run_id)}
                            onChange={() => toggleRunSelected(item.run_id)}
                            style={{ marginTop: 14 }}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0, borderRadius: radius.lg, border: `1px solid ${active ? color.primary[600] : border.subtle}`, background: surface.card }}>
                          <button type="button" className="agb-focus-ring agb-hoverable" onClick={() => onSelectRun(item.run_id)} style={historyButtonStyle}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <StatusPill status={item.status} />
                              {item.source === "release" && (
                                <span title={item.graph_release_id ?? undefined} style={{ fontSize: 11, color: text.secondary }}>
                                  release
                                </span>
                              )}
                              {item.provider && (
                                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: text.secondary }}>
                                  <ProviderDot provider={item.provider} size={6} />
                                  {providerLabel(item.provider)}
                                </span>
                              )}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 12, lineHeight: "16px", color: text.secondary, textAlign: "left" }}>{formatRunLabel(item)}</div>
                          </button>
                          <div style={{ display: "flex", gap: 2, padding: `0 ${spacing[1]}px ${spacing[1]}px` }}>
                            {item.status === "succeeded" && (
                              <SmallAction icon={<RotateCcw size={12} />} disabled={replayingRunId !== null} onClick={() => void handleReplay(item.run_id)}>
                                {replayingRunId === item.run_id && counterfactualRunId !== item.run_id ? "Replaying…" : "Replay"}
                              </SmallAction>
                            )}
                            {item.status === "succeeded" && getGraph && (
                              <SmallAction
                                icon={<GitBranch size={12} />}
                                disabled={replayingRunId !== null}
                                onClick={() => setCounterfactualRunId((current) => (current === item.run_id ? null : item.run_id))}
                              >
                                Replay with changes…
                              </SmallAction>
                            )}
                            <SmallAction icon={<ScanSearch size={12} />} disabled={snapshotLoading && snapshotRunId === item.run_id} onClick={() => void handleViewSnapshot(item.run_id)}>
                              {snapshotRunId === item.run_id ? (snapshotLoading ? "Loading…" : "Hide snapshot") : "View snapshot"}
                            </SmallAction>
                          </div>
                          {counterfactualRunId === item.run_id && getGraph && (
                            <div style={{ padding: `0 ${spacing[2]}px ${spacing[2]}px` }}>
                              <CounterfactualForm
                                graph={getGraph()}
                                busy={replayingRunId === item.run_id}
                                onSubmit={(request) => void handleReplay(item.run_id, request)}
                                onCancel={() => setCounterfactualRunId(null)}
                              />
                            </div>
                          )}
                          {snapshotRunId === item.run_id && (
                            <div style={{ padding: `0 ${spacing[2]}px ${spacing[2]}px` }}>
                              <RunSnapshotDisplay snapshot={snapshot} error={snapshotError} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              {replayError && <div role="alert" style={alertStyle}>{replayError}</div>}
              {replayResult?.counterfactual && (
                <Group title="Counterfactual replay" icon={<GitBranch size={13} />}>
                  <StatusPill status={replayResult.run.status} />
                  <CounterfactualResultView result={replayResult} />
                </Group>
              )}
              {replayResult && !replayResult.counterfactual && (
                <Group title="Replay (read-only)" icon={<RotateCcw size={13} />}>
                  <StatusPill status={replayResult.run.status} />
                  {replayResult.traces.map((trace) => (
                    <Muted key={trace.node_id} style={{ marginTop: 4, fontFamily: fontFamily.mono }}>
                      {trace.node_id}: {JSON.stringify(trace.output)}
                    </Muted>
                  ))}
                </Group>
              )}
            </>
          )}

          {activeTab === "issues" && (
            <div aria-live="polite">
              {diagnostics.length === 0 ? (
                <EmptyState icon={<ShieldCheck size={18} color={color.success[500]} />}>
                  <span style={{ color: color.success[500] }}>No issues — graph is ready to compile.</span>
                </EmptyState>
              ) : (
                diagnostics.map((diagnostic, index) => {
                  const key = diagnosticKey(diagnostic, index);
                  const clickable = Boolean(diagnostic.node_id || diagnostic.edge_id);
                  const isError = diagnostic.severity === "error";
                  const Icon = isError ? XCircle : AlertTriangle;
                  const body = (
                    <>
                      <Icon size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 600 }}>{isError ? "Error" : "Warning"}</span>: {diagnostic.message}
                        {diagnostic.remediation && <span style={{ display: "block", color: text.secondary, marginTop: 2 }}>{diagnostic.remediation}</span>}
                        {(diagnostic.node_id || diagnostic.edge_id) && (
                          <code style={{ display: "block", marginTop: 2, fontFamily: fontFamily.mono, fontSize: 11, color: text.secondary }}>
                            {diagnostic.node_id ?? diagnostic.edge_id}
                          </code>
                        )}
                      </span>
                    </>
                  );
                  // A policy diagnostic that blocks runs or publishing is waivable
                  // (a block_publish rule is only a warning on the draft).
                  const waivable = diagnostic.category === "policy" && (diagnostic.blocking || Boolean(diagnostic.blocks_publish)) && Boolean(graphId);
                  return (
                    <div key={key} style={{ marginBottom: spacing[2] }}>
                      {clickable ? (
                        <button type="button" className="agb-focus-ring agb-hoverable" onClick={() => onDiagnosticClick(diagnostic)} style={diagnosticStyle(diagnostic.severity, true)}>
                          {body}
                        </button>
                      ) : (
                        <div style={diagnosticStyle(diagnostic.severity, false)}>{body}</div>
                      )}
                      {waivable && (
                        <div role="group" aria-label={`Waive ${diagnostic.code}`} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, opacity: 0.75 }}>{waivingKey === key ? "Waiving…" : "Waive for"}</span>
                          {WAIVE_DURATIONS_DAYS.map((days) => (
                            <Button
                              key={days}
                              variant="secondary"
                              disabled={waivingKey === key}
                              aria-label={`Waive for ${days} days`}
                              onClick={() => void handleWaive(diagnostic, key, days)}
                              style={{ fontSize: 12, padding: "4px 10px" }}
                            >
                              {days}d
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {waiveError && <div role="alert" style={alertStyle}>{waiveError}</div>}
            </div>
          )}
        </div>
      </div>
    </PanelFrame>
  );
}

function SmallAction({ icon, children, onClick, disabled }: { icon: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="agb-focus-ring agb-hoverable"
      style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 28, padding: "0 8px", borderRadius: radius.md, border: "none", background: "transparent", color: text.secondary, fontSize: 12, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 }}
    >
      <span aria-hidden="true" style={{ display: "inline-flex" }}>{icon}</span>
      {children}
    </button>
  );
}

function diagnosticStyle(severity: Diagnostic["severity"], clickable: boolean): CSSProperties {
  const isError = severity === "error";
  return {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    width: "100%",
    padding: `${spacing[2]}px ${spacing[2] + 2}px`,
    borderRadius: radius.lg,
    border: `1px solid ${isError ? accentSurface.destructive.border : `${color.warning[500]}55`}`,
    background: isError ? accentSurface.destructive.bg : `${color.warning[500]}12`,
    color: isError ? accentSurface.destructive.text : color.warning[500],
    cursor: clickable ? "pointer" : "default",
    textAlign: "left",
    fontSize: 12,
    lineHeight: "17px",
  };
}

const alertStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  marginBottom: spacing[3],
  padding: `${spacing[2]}px ${spacing[2] + 2}px`,
  borderRadius: radius.lg,
  border: `1px solid ${accentSurface.destructive.border}`,
  background: accentSurface.destructive.bg,
  color: accentSurface.destructive.text,
  fontSize: 12,
  lineHeight: "17px",
};

const eventRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "baseline",
  width: "100%",
  textAlign: "left",
  padding: "4px 8px",
  border: "none",
  borderRadius: radius.md,
  background: "transparent",
  color: text.primary,
  cursor: "pointer",
  fontFamily: fontFamily.mono,
  fontSize: 11.5,
  lineHeight: "16px",
};

const preStyle: CSSProperties = {
  fontFamily: fontFamily.mono,
  fontSize: 12,
  lineHeight: "18px",
  background: surface.inset,
  border: `1px solid ${border.subtle}`,
  padding: spacing[2],
  borderRadius: radius.lg,
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  margin: `${spacing[1]}px 0 ${spacing[2]}px`,
};

const historyButtonStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: `${spacing[2]}px ${spacing[2] + 2}px ${spacing[1]}px`,
  border: "none",
  borderRadius: `${radius.lg}px ${radius.lg}px 0 0`,
  background: "transparent",
  color: text.primary,
  cursor: "pointer",
  textAlign: "left",
};
