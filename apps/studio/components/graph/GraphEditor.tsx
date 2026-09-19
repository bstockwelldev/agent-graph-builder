"use client";

import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, Play, Plus } from "lucide-react";
import {
  fingerprintGraph,
  fingerprintGraphSemantics,
  type ChatProvider,
  type Diagnostic,
  type EdgeKind,
  type GraphDefinition,
  type GraphEdge,
  type GraphNode,
  type GraphOrientation,
  type NodeTrace,
  type NodeType,
  type PlatformEvent,
  type RouteDecision,
  type RunSummary,
} from "@bstockwelldev/agent-graph-sdk";

import { client, streamRunEvents } from "@/lib/api-client";
import {
  applyCompileIssueToEdge,
  applyCompileIssueToNodeData,
  buildIssueMaps,
  diagnosticsForEdge,
  diagnosticsForNode,
  edgeStrokeForKind,
  fingerprintIssueMaps,
  validationSummary,
} from "@/lib/diagnostics";
import {
  cloneCanvasSnapshot,
  coachStep,
  dismissCoach,
  flowEdgeLabel,
  isCoachDismissed,
  isCoachVisible,
  isEditableKeyboardTarget,
} from "@/lib/graphAuthoring";
import { defaultConfig, labelFor } from "@/lib/nodeDefaults";
import { applyRunSelectionToLlmNodes } from "@/lib/modelCatalog";
import { buildExecutedPath, edgeStrokeForInspection, normalizeRouteDecisions, tracesFromEvents } from "@/lib/runInspection";
import {
  failedUnavailableRunSummary,
  isRunNotFoundError,
  isTerminalRunStatus,
  RUN_NOT_FOUND_HINT,
  watchRunCompletion,
} from "@/lib/watchRun";
import { useUndoStack } from "@/hooks/useUndoStack";
import { useWorkbench } from "@/components/workbench/WorkbenchProvider";
import { WorkbenchDrawer } from "@/components/workbench/WorkbenchDrawer";
import { EdgeInspector, NodeInspector } from "./NodeInspector";
import { NodePalette, NODE_TYPES as NODE_TYPES_FOR_CONTEXT_MENU } from "./NodePalette";
import { ConnectKindMenu } from "./ConnectKindMenu";
import { NodeContextMenu } from "./NodeContextMenu";
import { NODE_TYPE_TAXONOMY } from "@/content/taxonomy";
import { EmptyGraphCoach } from "./EmptyGraphCoach";
import { OrientationControl } from "./OrientationControl";
import { FlowCanvas } from "./FlowCanvas";
import { RunPanel, type RunSelection } from "./RunPanel";
import { GraphSwitcherCombobox } from "./GraphSwitcherCombobox";
import { GraphNodeView, type GraphNodeData } from "./nodes/GraphNodeView";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { shell } from "@/lib/graph-theme";

/** True when the viewport is wide enough for docked (non-drawer) panels. */
function isDesktopViewport(): boolean {
  return typeof window === "undefined" || window.innerWidth >= shell.breakpoint.compact;
}

const nodeTypes = {
  input: GraphNodeView,
  prompt: GraphNodeView,
  llm: GraphNodeView,
  tool: GraphNodeView,
  router: GraphNodeView,
  output: GraphNodeView,
  guardrail: GraphNodeView,
  rubric: GraphNodeView,
  branch: GraphNodeView,
  tool_loop: GraphNodeView,
  code_exec: GraphNodeView,
  human_gate: GraphNodeView,
};

let idCounter = 1;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

function syncIdCounter(graph: GraphDefinition) {
  let max = idCounter;
  for (const item of [...graph.nodes, ...graph.edges]) {
    const match = item.id.match(/_(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  idCounter = max;
}

function toFlowNode(n: GraphNode): Node<GraphNodeData> {
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: { nodeType: n.type, label: labelFor(n.type, n.config), config: n.config, status: "idle", compileIssue: null },
  };
}

function toFlowEdge(e: GraphEdge): Edge {
  const { stroke, strokeWidth } = edgeStrokeForKind(e.kind);
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: flowEdgeLabel(e.kind, e.condition),
    animated: e.kind === "conditional",
    style: { stroke, strokeWidth },
    data: { kind: e.kind, condition: e.condition ?? null },
  };
}

function createFlowEdge(connection: Connection, kind: EdgeKind, condition: string | null): Edge {
  const { stroke, strokeWidth } = edgeStrokeForKind(kind);
  return {
    id: nextId("e"),
    source: connection.source!,
    target: connection.target!,
    label: flowEdgeLabel(kind, condition),
    animated: kind === "conditional",
    style: { stroke, strokeWidth },
    data: { kind, condition },
  };
}

export function GraphEditor({ graphId }: { graphId: string }) {
  const router = useRouter();
  const [graphName, setGraphName] = useState("");
  const [graphOrientation, setGraphOrientation] = useState<GraphOrientation>("auto");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GraphNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [relayoutNonce, setRelayoutNonce] = useState(0);
  const [libraryGraphs, setLibraryGraphs] = useState<GraphDefinition[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const workbench = useWorkbench();
  // Default the Run panel open on desktop, matching the old playground's
  // persistently docked Run rail; computed once at mount, not tied to live
  // resize, so a window resize doesn't fight a user's manual toggle
  // (studio-consolidation Phase 7). Palette/library/run are now one
  // mutually-exclusive `activePanel` (Phase 8) rather than three
  // independent booleans — they previously rendered at the identical
  // top-24/left-4 position when more than one was open, an unnoticed
  // Phase 7 overlap bug this also fixes.
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [runHistory, setRunHistory] = useState<RunSummary[]>([]);
  const [runHistoryLoading, setRunHistoryLoading] = useState(false);
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [nodeTraces, setNodeTraces] = useState<Record<string, NodeTrace>>({});
  const [inspectionRunId, setInspectionRunId] = useState<string | null>(null);
  const [inspectionRouteDecisions, setInspectionRouteDecisions] = useState<RouteDecision[]>([]);
  const [inspectLoadError, setInspectLoadError] = useState(false);
  const [providerBlockMessage, setProviderBlockMessage] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<{
    connection: Connection;
    x: number;
    y: number;
    targetLabel: string;
  } | null>(null);
  const shiftConnectRef = useRef(false);
  const connectPointerRef = useRef({ x: 0, y: 0 });
  const lastAppliedIssueFingerprintRef = useRef<string>("");
  const closeStreamRef = useRef<(() => void) | null>(null);
  const lastInspectAttemptRef = useRef<string | null>(null);
  const diagnosticsSectionRef = useRef<HTMLDivElement>(null);
  const { pushSnapshot, undo, redo, clearHistory } = useUndoStack();
  const validationLabel = useMemo(() => validationSummary(diagnostics).label, [diagnostics]);

  const closeStream = useCallback(() => {
    closeStreamRef.current?.();
    closeStreamRef.current = null;
  }, []);

  const focusDiagnostics = useCallback(() => {
    diagnosticsSectionRef.current?.focus();
    diagnosticsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const handleDiagnosticClick = useCallback((diagnostic: Diagnostic) => {
    if (diagnostic.edge_id) {
      setSelectedEdgeId(diagnostic.edge_id);
      setSelectedNodeId(null);
      return;
    }
    if (diagnostic.node_id) {
      setSelectedNodeId(diagnostic.node_id);
      setSelectedEdgeId(null);
    }
  }, []);

  const refreshRunHistory = useCallback(async () => {
    setRunHistoryLoading(true);
    try {
      const runs = await client.listRuns(graphId);
      setRunHistory(runs);
    } finally {
      setRunHistoryLoading(false);
    }
  }, [graphId]);

  useEffect(() => {
    void refreshRunHistory();
  }, [refreshRunHistory]);

  useEffect(() => {
    if (isDesktopViewport() && workbench.activePanel === null) workbench.open("run");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once at mount only, guarded above
  }, []);

  const refreshLibraryGraphs = useCallback(async () => {
    setLibraryLoading(true);
    try {
      setLibraryGraphs(await client.listGraphs());
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const handleGraphSwitcherOpenChange = useCallback(
    (open: boolean) => {
      if (open) void refreshLibraryGraphs();
    },
    [refreshLibraryGraphs],
  );

  const handleLibrarySelect = useCallback(
    (selectedGraphId: string) => {
      if (selectedGraphId !== graphId) router.push(`/graphs/${selectedGraphId}`);
    },
    [graphId, router],
  );

  useEffect(() => closeStream, [closeStream]);

  useEffect(() => {
    setCoachDismissed(isCoachDismissed(graphId));
  }, [graphId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftConnectRef.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftConnectRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    client
      .getGraph(graphId)
      .then((graph) => {
        if (cancelled) return;
        syncIdCounter(graph);
        setGraphName(graph.name);
        setGraphOrientation(graph.orientation ?? "auto");
        setNodes(graph.nodes.map(toFlowNode));
        setEdges(graph.edges.map(toFlowEdge));
        setSavedFingerprint(fingerprintGraph(graph));
        clearHistory();
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setDiagnostics([]);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphId]);

  const buildGraphDefinition = useCallback(
    (nodeSource?: Node<GraphNodeData>[]): GraphDefinition => {
      const sourceNodes = nodeSource ?? nodes;
      const entryNode = sourceNodes.find((n) => n.data.nodeType === "input");
      return {
        id: graphId,
        name: graphName,
        entry_node_id: entryNode?.id ?? sourceNodes[0]?.id ?? "",
        orientation: graphOrientation,
        nodes: sourceNodes.map((n) => ({
          id: n.id,
          type: n.data.nodeType,
          position: { x: n.position.x, y: n.position.y },
          config: n.data.config,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          kind: (e.data?.kind as EdgeKind) ?? "sequence",
          condition: (e.data?.condition as string | null) ?? null,
        })),
      };
    },
    [nodes, edges, graphId, graphName, graphOrientation],
  );

  const semanticFingerprint = useMemo(() => {
    if (nodes.length === 0) return "";
    try {
      return fingerprintGraphSemantics(buildGraphDefinition());
    } catch {
      return "";
    }
  }, [buildGraphDefinition, nodes.length]);

  const dirty = useMemo(() => {
    try {
      return fingerprintGraph(buildGraphDefinition()) !== savedFingerprint;
    } catch {
      return false;
    }
  }, [buildGraphDefinition, savedFingerprint]);

  // Debounced live validation — mirrors apps/playground/src/App.tsx's flow.
  useEffect(() => {
    if (!semanticFingerprint) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      try {
        const graph = buildGraphDefinition();
        client
          .validateGraph(graph, { signal: controller.signal })
          .then((result) => setDiagnostics(result.diagnostics))
          .catch((err: unknown) => {
            if (err instanceof DOMException && err.name === "AbortError") return;
            console.error("Live validation failed:", err);
          });
      } catch {
        // Graph not ready yet.
      }
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [semanticFingerprint, buildGraphDefinition]);

  const applyDiagnosticsToCanvas = useCallback(
    (nextDiagnostics: Diagnostic[]) => {
      const fingerprint = `${graphId}:${fingerprintIssueMaps(nextDiagnostics)}`;
      if (fingerprint === lastAppliedIssueFingerprintRef.current) return;
      lastAppliedIssueFingerprintRef.current = fingerprint;
      const { nodeIssues, edgeIssues } = buildIssueMaps(nextDiagnostics);
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: applyCompileIssueToNodeData(node.data, nodeIssues.get(node.id)),
        })),
      );
      setEdges((eds) => eds.map((edge) => applyCompileIssueToEdge(edge, edgeIssues.get(edge.id))));
    },
    [graphId, setNodes, setEdges],
  );

  useEffect(() => {
    applyDiagnosticsToCanvas(diagnostics);
  }, [diagnostics, applyDiagnosticsToCanvas]);

  const getCanvasSnapshot = useCallback(
    () => cloneCanvasSnapshot(nodes, edges, graphName, graphOrientation),
    [nodes, edges, graphName, graphOrientation],
  );

  const applyCanvasSnapshot = useCallback(
    (snapshot: ReturnType<typeof getCanvasSnapshot>) => {
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      setGraphName(snapshot.graphName);
      setGraphOrientation(snapshot.graphOrientation);
    },
    [setNodes, setEdges],
  );

  const recordMutation = useCallback(() => {
    pushSnapshot(getCanvasSnapshot());
  }, [getCanvasSnapshot, pushSnapshot]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      const needsKindMenu =
        sourceNode?.data.nodeType === "router" ||
        sourceNode?.data.nodeType === "branch" ||
        shiftConnectRef.current;

      if (needsKindMenu) {
        setPendingConnection({
          connection,
          x: connectPointerRef.current.x,
          y: connectPointerRef.current.y,
          targetLabel: targetNode?.data.label ?? connection.target ?? "target",
        });
        return;
      }

      recordMutation();
      setEdges((current) => addEdge(createFlowEdge(connection, "sequence", null), current));
    },
    [nodes, recordMutation, setEdges],
  );

  const confirmPendingConnection = useCallback(
    (kind: EdgeKind, condition: string | null) => {
      if (!pendingConnection) return;
      recordMutation();
      setEdges((current) => addEdge(createFlowEdge(pendingConnection.connection, kind, condition), current));
      setPendingConnection(null);
    },
    [pendingConnection, recordMutation, setEdges],
  );

  const patchEdgeById = useCallback(
    (edgeId: string, patch: Partial<GraphEdge>) => {
      recordMutation();
      setEdges((current) =>
        current.map((edge) => {
          if (edge.id !== edgeId) return edge;
          const kind = (patch.kind ?? (edge.data?.kind as EdgeKind)) ?? "sequence";
          const condition = patch.condition !== undefined ? patch.condition : (edge.data?.condition as string | null);
          const { stroke, strokeWidth } = edgeStrokeForKind(kind);
          return {
            ...edge,
            data: { ...edge.data, kind, condition },
            label: flowEdgeLabel(kind, condition),
            style: { stroke, strokeWidth },
            animated: kind === "conditional",
          };
        }),
      );
    },
    [recordMutation, setEdges],
  );

  const deleteSelection = useCallback(() => {
    if (selectedNodeId) {
      recordMutation();
      setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
      setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
      setSelectedNodeId(null);
      return;
    }
    if (selectedEdgeId) {
      recordMutation();
      setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  }, [recordMutation, selectedEdgeId, selectedNodeId, setEdges, setNodes]);

  const addNode = useCallback(
    (type: NodeType, position?: { x: number; y: number }) => {
      recordMutation();
      const config = defaultConfig(type);
      const id = nextId(type);
      const node: Node<GraphNodeData> = {
        id,
        type,
        position: position ?? { x: 200 + Math.random() * 400, y: 100 + Math.random() * 400 },
        data: { nodeType: type, label: labelFor(type, config), config, status: "idle", compileIssue: null },
      };
      setNodes((current) => [...current, node]);
      if (workbench.activePanel === "palette") workbench.close();
    },
    [recordMutation, setNodes, workbench],
  );

  // Right-click context menu (studio-consolidation Phase 7 — new scope, no
  // equivalent existed before). Mirrors pendingConnection's {x, y} pattern.
  const [contextMenu, setContextMenu] = useState<
    | { kind: "node"; nodeId: string; x: number; y: number }
    | { kind: "edge"; edgeId: string; x: number; y: number }
    | { kind: "pane"; x: number; y: number; flowX: number; flowY: number }
    | null
  >(null);

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const source = nodes.find((node) => node.id === nodeId);
      if (!source) return;
      recordMutation();
      const id = nextId(source.data.nodeType);
      const duplicate: Node<GraphNodeData> = {
        ...source,
        id,
        selected: false,
        position: { x: source.position.x + 40, y: source.position.y + 40 },
        data: { ...source.data },
      };
      setNodes((current) => [...current, duplicate]);
    },
    [nodes, recordMutation, setNodes],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const current = getCanvasSnapshot();
        const snapshot = event.shiftKey ? redo(current) : undo(current);
        if (snapshot) applyCanvasSnapshot(snapshot);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedNodeId || selectedEdgeId) {
          event.preventDefault();
          deleteSelection();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyCanvasSnapshot, deleteSelection, getCanvasSnapshot, redo, selectedEdgeId, selectedNodeId, undo]);

  const handleSave = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      const graph = buildGraphDefinition();
      await client.saveGraph(graph);
      setSavedFingerprint(fingerprintGraph(graph));
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [buildGraphDefinition, dirty]);

  const paintInspectionPath = useCallback(
    (traces: Record<string, NodeTrace>, routeDecisions: RouteDecision[]) => {
      const graphEdges: GraphEdge[] = edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        kind: (edge.data?.kind as EdgeKind) ?? "sequence",
        condition: (edge.data?.condition as string | null) ?? null,
      }));
      const path = buildExecutedPath(traces, routeDecisions, graphEdges, nodes.map((node) => node.id));
      const { nodeIssues } = buildIssueMaps(diagnostics);

      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: {
            ...applyCompileIssueToNodeData(node.data, nodeIssues.get(node.id)),
            status: traces[node.id]?.status ?? "idle",
            inspectionDimmed: path.dimNodeIds.has(node.id),
          },
        })),
      );

      setEdges((eds) =>
        eds.map((edge) => {
          const kind = (edge.data?.kind as EdgeKind) ?? "sequence";
          const { stroke, strokeWidth, opacity } = edgeStrokeForInspection(edge, path, kind);
          return {
            ...edge,
            style: { stroke, strokeWidth, opacity },
            animated: kind === "conditional" && path.highlightEdgeIds.has(edge.id),
          };
        }),
      );
    },
    [diagnostics, edges, nodes, setEdges, setNodes],
  );

  const exitInspection = useCallback(() => {
    setInspectionRunId(null);
    setInspectionRouteDecisions([]);
    setNodeTraces({});
    setNodes((nds) => nds.map((node) => ({ ...node, data: { ...node.data, status: "idle", inspectionDimmed: false } })));
    applyDiagnosticsToCanvas(diagnostics);
  }, [applyDiagnosticsToCanvas, diagnostics, setNodes]);

  useEffect(() => {
    if (!inspectionRunId) return;
    paintInspectionPath(nodeTraces, inspectionRouteDecisions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionRunId, inspectionRouteDecisions, nodeTraces]);

  const applyRunInspection = useCallback((summary: RunSummary, traces: NodeTrace[]) => {
    closeStreamRef.current?.();
    closeStreamRef.current = null;
    setEvents(summary.events && summary.events.length > 0 ? summary.events : []);
    setRunSummary(summary);
    setInspectionRunId(summary.run_id);
    const routeDecisions = normalizeRouteDecisions(summary.route_decisions ?? []);
    setInspectionRouteDecisions(routeDecisions);
    setNodeTraces(Object.fromEntries(traces.map((trace) => [trace.node_id, trace])));
  }, []);

  const handleSelectHistoricalRun = useCallback(
    async (runId: string) => {
      lastInspectAttemptRef.current = runId;
      try {
        const [summary, traces] = await Promise.all([client.getRun(runId), client.getRunNodeTraces(runId)]);
        applyRunInspection(summary, traces);
        setInspectLoadError(false);
      } catch (err: unknown) {
        setInspectLoadError(true);
        if (isRunNotFoundError(err)) {
          setRunSummary((current) => {
            if (current?.run_id === runId) return current;
            return failedUnavailableRunSummary(
              current ?? { run_id: runId, graph_id: graphId, status: "queued", result: null },
              RUN_NOT_FOUND_HINT,
            );
          });
          return;
        }
        console.error("Failed to load run inspection:", err);
      }
    },
    [applyRunInspection, graphId],
  );

  const handleCompile = useCallback(
    async (selection: RunSelection) => {
      setCompiling(true);
      try {
        const synced = applyRunSelectionToLlmNodes(nodes, selection.provider, selection.model);
        if (synced !== nodes) setNodes(synced);
        const graph = buildGraphDefinition(synced);
        await client.saveGraph(graph);
        setSavedFingerprint(fingerprintGraph(graph));
        const result = await client.compileGraph(graph.id);
        setDiagnostics(result.diagnostics);
        if (!result.ok) focusDiagnostics();
      } finally {
        setCompiling(false);
      }
    },
    [buildGraphDefinition, focusDiagnostics, nodes, setNodes],
  );

  const handleRun = useCallback(
    async (question: string, provider: ChatProvider, model?: string, apiKey?: string) => {
      setProviderBlockMessage(null);
      setCompiling(true);
      try {
        const needsServerKey = provider === "groq" || provider === "google" || provider === "azure";
        if (needsServerKey && !apiKey?.trim()) {
          const readiness = await client.providerReady(provider);
          if (!readiness.ready) {
            setProviderBlockMessage(readiness.message);
            return;
          }
        }

        const synced = applyRunSelectionToLlmNodes(nodes, provider, model);
        if (synced !== nodes) setNodes(synced);

        const graph = buildGraphDefinition(synced);
        await client.saveGraph(graph);
        setSavedFingerprint(fingerprintGraph(graph));
        const compileResult = await client.compileGraph(graph.id);
        setDiagnostics(compileResult.diagnostics);
        if (!compileResult.ok) {
          focusDiagnostics();
          return;
        }

        setEvents([]);
        setNodeTraces({});
        setInspectionRouteDecisions([]);
        closeStreamRef.current?.();

        const summary = await client.startRun(graph.id, { question }, provider, model, apiKey);
        setRunSummary(summary);
        setInspectionRunId(summary.run_id);

        const applyTerminalSummary = async (latest: RunSummary) => {
          setRunSummary(latest);
          setInspectionRouteDecisions(normalizeRouteDecisions(latest.route_decisions ?? []));
          try {
            const traces = await client.getRunNodeTraces(latest.run_id);
            setNodeTraces(Object.fromEntries(traces.map((trace) => [trace.node_id, trace])));
          } catch (err: unknown) {
            const fallback = tracesFromEvents(latest.events ?? []);
            if (fallback.length > 0) {
              setNodeTraces(Object.fromEntries(fallback.map((trace) => [trace.node_id, trace])));
            } else {
              console.error("Failed to load run traces:", err);
            }
          }
          await refreshRunHistory();
        };

        if (isTerminalRunStatus(summary.status)) {
          if (summary.events && summary.events.length > 0) setEvents(summary.events);
          await applyTerminalSummary(summary);
          return;
        }

        const nodeTypeById = new Map(nodes.map((n) => [n.id, n.data.nodeType]));

        closeStreamRef.current = watchRunCompletion({
          initial: summary,
          streamRunEvents,
          getRun: client.getRun,
          onEvent: (event) => {
            setEvents((evts) => [...evts, event]);

            if (event.event_type === "edge.selected" && event.node_id) {
              const selectedEdgeId = String(event.payload.selectedEdgeId ?? "");
              const selectedTargetNodeId = String(event.payload.selectedTargetNodeId ?? "");
              setInspectionRouteDecisions((decisions) => [
                ...decisions.filter((decision) => decision.nodeId !== event.node_id),
                { nodeId: event.node_id!, selectedEdgeId, selectedTargetNodeId },
              ]);
            }

            if (event.node_id) {
              if (event.event_type === "node.started") {
                setNodeTraces((traces) => ({
                  ...traces,
                  [event.node_id!]: {
                    node_id: event.node_id!,
                    node_type: nodeTypeById.get(event.node_id!) ?? "input",
                    status: "running",
                    input: null,
                    output: null,
                    started_at: event.occurred_at,
                  },
                }));
              } else if (event.event_type === "node.completed") {
                setNodeTraces((traces) => ({
                  ...traces,
                  [event.node_id!]: {
                    ...traces[event.node_id!],
                    node_id: event.node_id!,
                    node_type: nodeTypeById.get(event.node_id!) ?? "input",
                    status: "succeeded",
                    input: event.payload.input,
                    output: event.payload.output,
                    completed_at: event.occurred_at,
                  },
                }));
              } else if (event.event_type === "node.failed") {
                setNodeTraces((traces) => ({
                  ...traces,
                  [event.node_id!]: {
                    ...traces[event.node_id!],
                    node_id: event.node_id!,
                    node_type: nodeTypeById.get(event.node_id!) ?? "input",
                    status: "failed",
                    completed_at: event.occurred_at,
                    error: String(event.payload.error),
                  },
                }));
              }
            }

            if (event.event_type === "run.completed" || event.event_type === "run.failed") {
              closeStreamRef.current?.();
              closeStreamRef.current = null;
              void applyTerminalSummary({
                ...summary,
                status: event.event_type === "run.completed" ? "succeeded" : "failed",
                result: event.payload.result ?? summary.result,
                error: event.payload.error != null ? String(event.payload.error) : summary.error,
              });
            }
          },
          onTerminal: (latest) => {
            closeStreamRef.current = null;
            void applyTerminalSummary(latest);
          },
        });
      } finally {
        setCompiling(false);
      }
    },
    [buildGraphDefinition, focusDiagnostics, nodes, refreshRunHistory, setNodes],
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);
  const routerOutgoingEdges: GraphEdge[] =
    selectedNode?.data.nodeType === "router" || selectedNode?.data.nodeType === "branch"
      ? edges
          .filter((edge) => edge.source === selectedNode.id)
          .map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            kind: (edge.data?.kind as EdgeKind) ?? "sequence",
            condition: (edge.data?.condition as string | null) ?? null,
          }))
      : [];
  const selectedTrace = selectedNodeId ? nodeTraces[selectedNodeId] ?? null : null;
  const showEmptyCoach = isCoachVisible(graphId, coachDismissed, nodes, edges);
  const authoringCoachStep = coachStep(nodes, edges);

  // Shared between the desktop reserved-space column and the compact
  // floating overlay below — computed once so the two render paths don't
  // duplicate the NodeInspector/EdgeInspector branch.
  const inspectorContent = selectedNode ? (
    <NodeInspector
      graphId={graphId}
      node={{
        id: selectedNode.id,
        type: selectedNode.data.nodeType,
        position: selectedNode.position,
        config: selectedNode.data.config,
      }}
      issues={diagnosticsForNode(diagnostics, selectedNode.id)}
      outgoingEdges={routerOutgoingEdges}
      onConfigChange={(config) => {
        recordMutation();
        setNodes((nds) =>
          nds.map((n) =>
            n.id === selectedNode.id
              ? { ...n, data: { ...n.data, config, label: labelFor(n.data.nodeType, config) } }
              : n,
          ),
        );
      }}
      onEdgeChange={patchEdgeById}
      onDelete={deleteSelection}
    />
  ) : selectedEdge ? (
    <EdgeInspector
      edge={{
        id: selectedEdge.id,
        source: selectedEdge.source,
        target: selectedEdge.target,
        kind: (selectedEdge.data?.kind as EdgeKind) ?? "sequence",
        condition: (selectedEdge.data?.condition as string | null) ?? null,
      }}
      issues={diagnosticsForEdge(diagnostics, selectedEdge.id)}
      onChange={(patch) => patchEdgeById(selectedEdge.id, patch)}
      onDelete={deleteSelection}
    />
  ) : null;
  const showInspector = workbench.activePanel !== "run" && Boolean(selectedNode || selectedEdge);

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {/* Node palette — reserved-space docked column (fixing a real reported
          bug): a floating panel has no relation to node positions, so it
          could — and did — render on top of live canvas nodes near its
          screen position, blocking clicks on them. Placed first in DOM
          order so it occupies the left side of this flex row; FlowCanvas's
          existing ResizeObserver-driven `paneSize` effect
          (useCanvasOrientation + runFitView) re-fits the view to whatever
          width remains once the canvas column resizes, no extra code
          needed here. The graph switcher used to be a sibling docked panel
          here too (GraphLibrary) — replaced by the inline
          GraphSwitcherCombobox in the HUD below, since picking a different
          graph doesn't need a whole reserved column, just a popover. */}
      <WorkbenchDrawer panelId="palette" side="left" mode="docked-reserve" dockedClassName="w-72 border-r overflow-y-auto">
        <NodePalette onAdd={addNode} authoringEnabled />
      </WorkbenchDrawer>

      {/* Canvas column — everything that used to float directly on the
          canvas root now floats within this narrower column instead, so it
          shrinks along with the canvas whenever a side panel reserves
          space, rather than continuing to span the original full width. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Floating top HUD */}
      <div className="glass-panel ghost-border absolute left-4 right-4 top-4 z-20 flex flex-wrap items-center gap-3 rounded-2xl border p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/graphs")}
        >
          &larr; Graphs
        </Button>
        {!workbench.isCompact && (
          <GraphSwitcherCombobox
            graphs={libraryGraphs}
            activeGraphId={graphId}
            activeGraphName={graphName}
            loading={libraryLoading}
            onSelect={handleLibrarySelect}
            onOpenChange={handleGraphSwitcherOpenChange}
          />
        )}
        <Input
          value={graphName}
          onChange={(e) => setGraphName(e.target.value)}
          aria-label="Graph name"
          className="max-w-xs font-semibold"
        />
        <Button variant="synth" size="sm" disabled={!dirty || saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {dirty && <Badge variant="outline">Unsaved</Badge>}
        <Badge
          variant="outline"
          className={cn(validationLabel === "Ready" ? "text-emerald-400" : "text-amber-400")}
        >
          Validation: {validationLabel}
        </Badge>
        {/* Orientation/Add node/Run/Help hidden on compact widths — the
            latter three duplicate the bottom mobile action bar below, and
            hiding them here is what stops the HUD from wrapping to 3-4 rows
            and covering canvas nodes on narrow viewports (the same overlap
            bug already fixed for the docked side panels, but on mobile it
            was this HUD, not a side panel, causing it). */}
        {!workbench.isCompact && (
        <div className="ml-auto flex items-center gap-2">
          <OrientationControl
            value={graphOrientation}
            onChange={(value) => {
              recordMutation();
              setGraphOrientation(value);
            }}
            onRelayout={() => {
              recordMutation();
              setRelayoutNonce((v) => v + 1);
            }}
          />
          <Button variant="outline" size="sm" onClick={() => workbench.toggle("palette")}>
            {workbench.activePanel === "palette" ? "Close palette" : "Add node"}
          </Button>
          <Button
            variant={workbench.activePanel === "run" ? "synth" : "outline"}
            size="sm"
            onClick={() => workbench.toggle("run")}
          >
            {workbench.activePanel === "run" ? "Close run" : "Run"}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Shortcuts and gestures"
            title="Shortcuts and gestures (?)"
            onClick={() => workbench.toggle("help")}
          >
            <HelpCircle className="size-4" />
          </Button>
        </div>
        )}
      </div>

      {saveError && (
        <div className="glass-panel ring-destructive/30 absolute left-4 top-20 z-20 max-w-sm rounded-lg p-3 ring-1">
          <p className="text-destructive text-xs">{saveError}</p>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <FlowCanvas
          graphId={graphId}
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={(event) => {
            if (event instanceof MouseEvent) {
              connectPointerRef.current = { x: event.clientX, y: event.clientY };
            } else if (event instanceof TouchEvent && event.touches[0]) {
              connectPointerRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            }
          }}
          authoringEnabled
          nodeTypes={nodeTypes}
          reducedMotion={false}
          graphOrientation={graphOrientation}
          relayoutNonce={relayoutNonce}
          liveAnnouncement=""
          onLiveAnnouncement={() => {}}
          onClearLiveAnnouncement={() => {}}
          loadFailureVisible={Boolean(loadError) && nodes.length === 0}
          onRetryLoad={() => window.location.reload()}
          graphLoading={loading}
          noGraphSelected={false}
          selectedEdgeId={selectedEdgeId}
          overlay={
            <EmptyGraphCoach
              visible={showEmptyCoach}
              step={authoringCoachStep}
              onDismiss={() => {
                dismissCoach(graphId);
                setCoachDismissed(true);
              }}
            />
          }
          onNodeClick={(nodeId) => {
            setSelectedNodeId(nodeId);
            setSelectedEdgeId(null);
            if (workbench.activePanel === "palette") workbench.close();
          }}
          onEdgeClick={(edgeId) => {
            setSelectedEdgeId(edgeId);
            setSelectedNodeId(null);
            if (workbench.activePanel === "palette") workbench.close();
          }}
          onPaneClick={() => {
            setPendingConnection(null);
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
          }}
          onNodeContextMenu={(nodeId, x, y) => {
            setSelectedNodeId(nodeId);
            setSelectedEdgeId(null);
            setContextMenu({ kind: "node", nodeId, x, y });
          }}
          onEdgeContextMenu={(edgeId, x, y) => {
            setSelectedEdgeId(edgeId);
            setSelectedNodeId(null);
            setContextMenu({ kind: "edge", edgeId, x, y });
          }}
          onPaneContextMenu={(x, y, flowX, flowY) => {
            setContextMenu({ kind: "pane", x, y, flowX, flowY });
          }}
        />
      </div>

      {pendingConnection && (
        <ConnectKindMenu
          x={pendingConnection.x}
          y={pendingConnection.y}
          targetLabel={pendingConnection.targetLabel}
          onConfirm={confirmPendingConnection}
          onCancel={() => setPendingConnection(null)}
        />
      )}

      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          title={
            contextMenu.kind === "node"
              ? "Node"
              : contextMenu.kind === "edge"
                ? "Edge"
                : "Add node"
          }
          actions={
            contextMenu.kind === "node"
              ? [
                  { label: "Duplicate node", onClick: () => duplicateNode(contextMenu.nodeId) },
                  { label: "Delete node", onClick: deleteSelection, tone: "destructive" },
                ]
              : contextMenu.kind === "edge"
                ? [{ label: "Delete edge", onClick: deleteSelection, tone: "destructive" }]
                : NODE_TYPES_FOR_CONTEXT_MENU.map((type) => ({
                    label: NODE_TYPE_TAXONOMY[type].title,
                    onClick: () => addNode(type, { x: contextMenu.flowX, y: contextMenu.flowY }),
                  }))
          }
        />
      )}

      {/* Bottom mobile action bar — the top HUD's buttons are reachable at
          compact widths too (it wraps), but a thumb-reachable bottom bar is
          the more usable mobile pattern for the four most-used actions.
          Compact-only: at desktop widths these same actions already have
          dedicated HUD buttons plus hotkeys/palette entries. */}
      {workbench.isCompact && (
        <div className="glass-panel ghost-border absolute inset-x-4 bottom-4 z-20 flex items-center justify-around rounded-2xl border p-2">
          <GraphSwitcherCombobox
            graphs={libraryGraphs}
            activeGraphId={graphId}
            loading={libraryLoading}
            iconOnly
            openDirection="up"
            onSelect={handleLibrarySelect}
            onOpenChange={handleGraphSwitcherOpenChange}
          />
          <Button
            variant={workbench.activePanel === "palette" ? "synth" : "ghost"}
            size="icon-sm"
            aria-label="Add node"
            onClick={() => workbench.toggle("palette")}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant={workbench.activePanel === "run" ? "synth" : "ghost"}
            size="icon-sm"
            aria-label="Run"
            onClick={() => workbench.toggle("run")}
          >
            <Play className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Shortcuts and gestures" onClick={() => workbench.toggle("help")}>
            <HelpCircle className="size-4" />
          </Button>
        </div>
      )}
      </div>

      {/* Right reserved column — the run panel and the node/edge inspector
          share this slot (already mutually exclusive via `showInspector`'s
          `workbench.activePanel !== "run"` check), so at most one ever
          occupies this column's width at a time. */}
      <WorkbenchDrawer panelId="run" side="right" mode="docked-reserve" dockedClassName="w-96 border-l overflow-y-auto">
        <RunPanel
          layout="rail"
          graphId={graphId}
          diagnostics={diagnostics}
          diagnosticsSectionRef={diagnosticsSectionRef}
          providerBlockMessage={providerBlockMessage}
          inspectionRunId={inspectionRunId}
          onExitInspection={exitInspection}
          onCompile={handleCompile}
          onRun={handleRun}
          onDiagnosticClick={handleDiagnosticClick}
          runSummary={runSummary}
          runHistory={runHistory}
          runHistoryLoading={runHistoryLoading}
          compiling={compiling}
          onSelectRun={(runId) => void handleSelectHistoricalRun(runId)}
          events={events}
          selectedTrace={selectedTrace}
          selectedNodeId={selectedNodeId}
          inspectLoadError={inspectLoadError}
          onRetryInspect={() => {
            const runId = lastInspectAttemptRef.current ?? inspectionRunId;
            if (runId) void handleSelectHistoricalRun(runId);
          }}
        />
      </WorkbenchDrawer>
      {showInspector && !workbench.isCompact && (
        <div className="glass-panel ghost-border h-full min-h-0 w-80 shrink-0 overflow-y-auto border-l">
          {inspectorContent}
        </div>
      )}
      {showInspector && workbench.isCompact && (
        <div className="glass-panel ghost-border fixed right-4 top-24 z-20 max-h-[75vh] w-80 overflow-y-auto rounded-2xl border">
          {inspectorContent}
        </div>
      )}
    </div>
  );
}
