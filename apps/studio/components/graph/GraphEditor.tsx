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
import {
  fingerprintGraph,
  fingerprintGraphSemantics,
  type Diagnostic,
  type EdgeKind,
  type GraphDefinition,
  type GraphEdge,
  type GraphNode,
  type GraphOrientation,
  type NodeType,
} from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
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
import { useUndoStack } from "@/hooks/useUndoStack";
import { EdgeInspector, NodeInspector } from "./NodeInspector";
import { NodePalette } from "./NodePalette";
import { ConnectKindMenu } from "./ConnectKindMenu";
import { EmptyGraphCoach } from "./EmptyGraphCoach";
import { OrientationControl } from "./OrientationControl";
import { FlowCanvas } from "./FlowCanvas";
import { GraphNodeView, type GraphNodeData } from "./nodes/GraphNodeView";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<{
    connection: Connection;
    x: number;
    y: number;
    targetLabel: string;
  } | null>(null);
  const shiftConnectRef = useRef(false);
  const connectPointerRef = useRef({ x: 0, y: 0 });
  const lastAppliedIssueFingerprintRef = useRef<string>("");
  const { pushSnapshot, undo, redo, clearHistory } = useUndoStack();
  const validationLabel = useMemo(() => validationSummary(diagnostics).label, [diagnostics]);

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
    (type: NodeType) => {
      recordMutation();
      const config = defaultConfig(type);
      const id = nextId(type);
      const node: Node<GraphNodeData> = {
        id,
        type,
        position: { x: 200 + Math.random() * 400, y: 100 + Math.random() * 400 },
        data: { nodeType: type, label: labelFor(type, config), config, status: "idle", compileIssue: null },
      };
      setNodes((current) => [...current, node]);
      setPaletteOpen(false);
    },
    [recordMutation, setNodes],
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
  const showEmptyCoach = isCoachVisible(graphId, coachDismissed, nodes, edges);
  const authoringCoachStep = coachStep(nodes, edges);

  return (
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
          <Button variant="outline" size="sm" onClick={() => setPaletteOpen((open) => !open)}>
            {paletteOpen ? "Close palette" : "Add node"}
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="glass-panel ring-destructive/30 absolute left-4 top-20 z-20 max-w-sm rounded-lg p-3 ring-1">
          <p className="text-destructive text-xs">{saveError}</p>
        </div>
      )}

      {/* Floating node palette */}
      {paletteOpen && (
        <div className="glass-panel ghost-border absolute left-4 top-24 z-20 max-h-[70vh] w-72 overflow-y-auto rounded-2xl border">
          <NodePalette onAdd={addNode} authoringEnabled />
        </div>
      )}

      {/* Floating inspector */}
      {(selectedNode || selectedEdge) && (
        <div className="glass-panel ghost-border absolute right-4 top-24 z-20 max-h-[75vh] w-80 overflow-y-auto rounded-2xl border">
          {selectedNode ? (
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
          ) : null}
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
            setPaletteOpen(false);
          }}
          onEdgeClick={(edgeId) => {
            setSelectedEdgeId(edgeId);
            setSelectedNodeId(null);
            setPaletteOpen(false);
          }}
          onPaneClick={() => {
            setPendingConnection(null);
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
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
    </div>
  );
}
