import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { EDGE_KIND_TAXONOMY, NODE_TYPE_TAXONOMY, ROUTER_RULES_TAXONOMY } from "@/content/taxonomy";
import { inputPortsFor, outputPortsFor } from "@/content/node-ports";
import type {
  ChatProvider,
  EdgeKind,
  GraphEdge,
  GraphNode,
  Diagnostic,
  NodeTrace,
  NodeType,
  PolicyException,
} from "@bstockwelldev/agent-graph-sdk";
import {
  accentSurface,
  color,
  fontFamily,
  localType,
  nodeType as nodeTypeAccents,
  radius,
  shell,
  spacing,
  surface,
  text,
  typeScale,
} from "@/lib/graph-theme";
import { client } from "@/lib/api-client";
import { GenuiSurfaceView } from "@/components/genui/genui-renderer";
import { tryParseGenuiSurface } from "@/lib/genui";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { TaxonomyTooltip } from "./Tooltip";
import { Button } from "./ui/Button";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { Select, TextArea, TextInput } from "./ui/fields";
import { formatEdgeRawConfig, parseEdgeRawConfig } from "@/lib/jsonEditor";
import { JsonEditor } from "./ui/JsonEditor";
import { Tabs } from "./ui/Tabs";

function IssueList({ issues }: { issues: Diagnostic[] }) {
  if (issues.length === 0) return null;
  return (
    <div style={{ marginBottom: spacing[3] }}>
      {issues.map((issue, index) => (
        <div
          key={`${issue.code}-${index}`}
          style={{
            ...typeScale.caption,
            color: issue.severity === "error" ? accentSurface.destructive.text : color.warning[500],
            marginBottom: spacing[1],
            lineHeight: "16px",
          }}
        >
          {issue.message}
        </div>
      ))}
    </div>
  );
}

export function patchFlowEdgeData(edge: GraphEdge, patch: Partial<GraphEdge>): GraphEdge {
  const kind = (patch.kind ?? edge.kind) as EdgeKind;
  const condition = patch.condition !== undefined ? patch.condition : edge.condition ?? null;
  return { ...edge, kind, condition };
}

const NODE_INSPECTOR_TABS = [
  { id: "configure", label: "Configure" },
  { id: "io", label: "I/O" },
  { id: "policy", label: "Policy" },
  { id: "run", label: "Run" },
  // Raw JSON config editor (studio-config-editor-and-console-plan.md §6).
  { id: "raw", label: "Raw" },
];

/**
 * Phase 10 Slice B (docs/planning/features/studio-shell-ux-gap-analysis.md,
 * "Selection dock rebuild"): Configure/I-O/Policy/Run tabs on the node
 * inspector, per `studio-ux-revision-plan.md` Section 6. `GraphEditor.tsx`
 * remounts this component on node-selection change (`key={node.id}`), so
 * `activeTab` resets to "configure" whenever a different node is selected
 * rather than needing its own reset effect.
 */
export function NodeInspector({
  node,
  graphId = null,
  issues = [],
  outgoingEdges = [],
  incomingEdges = [],
  selectedTrace = null,
  onConfigChange,
  onEdgeChange,
  onDelete,
  onDuplicate,
  onOpenRunPanel,
  onPolicyExceptionCreated,
  fullWidth = false,
  focusTab = null,
  userLabel = "",
  derivedLabel = "",
  onLabelChange,
}: {
  node: GraphNode;
  graphId?: string | null;
  issues?: Diagnostic[];
  outgoingEdges?: GraphEdge[];
  /** Edges targeting this node, for the I/O tab's input-port cross-reference. */
  incomingEdges?: GraphEdge[];
  /** This node's most recent execution, for the Run tab. */
  selectedTrace?: NodeTrace | null;
  onConfigChange: (config: Record<string, unknown>) => void;
  onEdgeChange?: (edgeId: string, patch: Partial<GraphEdge>) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onOpenRunPanel?: () => void;
  /** Called after a policy exception is created/deleted from the Policy tab,
   * so the caller can re-validate and pick up the diagnostic change. */
  onPolicyExceptionCreated?: () => void;
  fullWidth?: boolean;
  /** Diagnostics-as-navigation (studio-ux-gap-remediation-plan.md §1):
   * force-open a specific tab (e.g. "io" for a contract diagnostic). Guarded
   * by `nodeId` so a stale request from a previously-selected node can never
   * apply to this one — this component remounts on node change (`key=
   * {node.id}` at the call site), but `focusTab` itself doesn't change
   * identity just because the mount did. */
  focusTab?: { tab: string; nonce: number; nodeId: string } | null;
  /** Node naming (studio-graph-workbench-redesign-plan.md, Slice 4): the
   * user's name for this node (persisted as `extensions.label`), and the
   * config-derived title shown when it's blank. */
  userLabel?: string;
  derivedLabel?: string;
  onLabelChange?: (label: string) => void;
}) {
  const [activeTab, setActiveTab] = useState("configure");
  const set = (key: string, value: unknown) => onConfigChange({ ...node.config, [key]: value });
  const accent = nodeTypeAccents[node.type]?.accent ?? color.primary[600];

  useEffect(() => {
    if (focusTab && focusTab.nodeId === node.id) setActiveTab(focusTab.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on nonce/nodeId change only, not on every node.id re-render
  }, [focusTab?.nonce, focusTab?.nodeId, node.id]);

  return (
    <div style={panelStyle(fullWidth)}>
      <div style={{ borderTop: `3px solid ${accent}`, margin: `-${shell.panelPadding}px -${shell.panelPadding}px ${spacing[3]}px` }} />
      <div style={{ ...typeScale.small, fontWeight: 600, marginBottom: spacing[1] - 2 }}>
        {NODE_TYPE_TAXONOMY[node.type].title}
      </div>
      <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[2] }}>{node.id}</div>
      {onLabelChange && (
        <Field label="Name">
          <TextInput
            value={userLabel}
            placeholder={derivedLabel}
            aria-label="Node name"
            onChange={(e) => onLabelChange(e.target.value)}
          />
        </Field>
      )}
      <IssueList issues={issues} />

      <Tabs tabs={NODE_INSPECTOR_TABS} activeId={activeTab} onChange={setActiveTab} />

      {activeTab === "configure" && (
        <ConfigureTab
          node={node}
          graphId={graphId}
          issues={issues}
          outgoingEdges={outgoingEdges}
          onEdgeChange={onEdgeChange}
          set={set}
        />
      )}
      {activeTab === "io" && <IoTab node={node} issues={issues} incomingEdges={incomingEdges} outgoingEdges={outgoingEdges} />}
      {activeTab === "policy" && (
        <PolicyTab
          graphId={graphId}
          nodeId={node.id}
          issues={issues}
          onPolicyExceptionCreated={onPolicyExceptionCreated}
        />
      )}
      {activeTab === "run" && <RunTab selectedTrace={selectedTrace} onOpenRunPanel={onOpenRunPanel} />}
      {activeTab === "raw" && <JsonEditor value={node.config} onApply={onConfigChange} />}

      <div style={{ display: "flex", gap: spacing[2], marginTop: spacing[3] }}>
        {onDuplicate && (
          <Button variant="secondary" style={{ minHeight: 44 }} onClick={onDuplicate}>
            Duplicate
          </Button>
        )}
        <Button variant="destructive" style={{ minHeight: 44 }} onClick={onDelete}>
          Delete node
        </Button>
      </div>
    </div>
  );
}

function ConfigureTab({
  node,
  graphId,
  issues,
  outgoingEdges,
  onEdgeChange,
  set,
}: {
  node: GraphNode;
  graphId: string | null;
  issues: Diagnostic[];
  outgoingEdges: GraphEdge[];
  onEdgeChange?: (edgeId: string, patch: Partial<GraphEdge>) => void;
  set: (key: string, value: unknown) => void;
}) {
  return (
    <div>
      <IntentBlurb nodeType={node.type} />

      {node.type === "input" && (
        <Field label="Variable name">
          <TextInput
            value={(node.config.variableName as string) ?? ""}
            onChange={(e) => set("variableName", e.target.value)}
          />
        </Field>
      )}

      {node.type === "prompt" && (
        <Field label="Template (use {question}, {upstream}, and any run variable)">
          <TextArea
            style={{ height: 120, fontFamily: fontFamily.mono }}
            value={(node.config.template as string) ?? ""}
            onChange={(e) => set("template", e.target.value)}
          />
        </Field>
      )}

      {node.type === "llm" && (
        <>
          <ProviderModelPicker
            graphId={graphId}
            provider={(node.config.provider as ChatProvider) ?? "ollama"}
            model={(node.config.model as string) ?? "qwen2.5:3b"}
            onProviderChange={(provider) => set("provider", provider)}
            onModelChange={(model) => set("model", model)}
          />
          <Field label="System prompt">
            <TextArea
              style={{ height: 80 }}
              value={(node.config.systemPrompt as string) ?? ""}
              onChange={(e) => set("systemPrompt", e.target.value)}
            />
          </Field>
        </>
      )}

      {node.type === "tool" && (
        <>
          <Field label="Tool">
            <Select
              value={(node.config.toolName as string) ?? "lookup_topic"}
              onChange={(e) => set("toolName", e.target.value)}
            >
              <option value="lookup_topic">lookup_topic</option>
            </Select>
          </Field>
          <Field label="Input variable">
            <TextInput
              value={(node.config.inputVariable as string) ?? "question"}
              onChange={(e) => set("inputVariable", e.target.value)}
            />
          </Field>
        </>
      )}

      {node.type === "router" && (
        <div style={{ marginBottom: spacing[3] }}>
          <TaxonomyTooltip
            title={ROUTER_RULES_TAXONOMY.title}
            summary={ROUTER_RULES_TAXONOMY.summary}
            details={ROUTER_RULES_TAXONOMY.details}
          >
            <div style={{ ...localType.label, opacity: 0.6, marginBottom: spacing[2] }}>Outgoing edges</div>
          </TaxonomyTooltip>
          {outgoingEdges.length === 0 ? (
            <div style={{ ...typeScale.caption, opacity: 0.75, lineHeight: "18px" }}>
              Connect edges from this router on the canvas to define branches.
            </div>
          ) : (
            outgoingEdges.map((edge) => {
              const edgeIssues = issues.filter((issue) => issue.edge_id === edge.id);
              return (
                <RouterEdgeRow
                  key={edge.id}
                  edge={edge}
                  issues={edgeIssues}
                  onChange={(patch) => onEdgeChange?.(edge.id, patch)}
                />
              );
            })
          )}
        </div>
      )}

      {node.type === "output" && (
        <div style={{ ...typeScale.caption, opacity: 0.75 }}>
          No configuration -- returns whatever reaches it as the run result.
        </div>
      )}

      {/* Absorbed from micro-ui-agent-builder's FlowStep vocabulary
          (studio-consolidation Phase 1/2). Field names match
          backend/app/node_configs.py's typed models exactly, not MUI's
          flowStepSchema — the two diverged during the port (see the Phase
          4d "as-built" notes: no `content` on guardrail/rubric, no
          `toolChoice` on tool_loop). */}

      {node.type === "guardrail" && (
        <Checkbox
          label="Allow URLs in content"
          checked={Boolean(node.config.allowUrls)}
          onChange={(checked) => set("allowUrls", checked)}
        />
      )}

      {node.type === "rubric" && (
        <Checkbox
          label="Fail the node on rubric findings"
          checked={Boolean(node.config.rubricFailOnFindings)}
          onChange={(checked) => set("rubricFailOnFindings", checked)}
        />
      )}

      {node.type === "branch" && (
        <Field label="Content (substring gate on the upstream value)">
          <TextArea
            style={{ height: 80 }}
            value={(node.config.content as string) ?? ""}
            onChange={(e) => set("content", e.target.value)}
          />
        </Field>
      )}

      {node.type === "tool_loop" && (
        <>
          <ProviderModelPicker
            graphId={graphId}
            provider={(node.config.provider as ChatProvider) ?? "ollama"}
            model={(node.config.model as string) ?? "qwen2.5:3b"}
            onProviderChange={(provider) => set("provider", provider)}
            onModelChange={(model) => set("model", model)}
          />
          <Field label="System prompt">
            <TextArea
              style={{ height: 80 }}
              value={(node.config.systemPrompt as string) ?? ""}
              onChange={(e) => set("systemPrompt", e.target.value)}
            />
          </Field>
          <Field label="Max tool iterations (1-64)">
            <TextInput
              type="number"
              min={1}
              max={64}
              value={String(node.config.maxToolIterations ?? 4)}
              onChange={(e) => set("maxToolIterations", Number(e.target.value))}
            />
          </Field>
        </>
      )}

      {node.type === "code_exec" && (
        <>
          <Field label="Contract / content">
            <TextArea
              style={{ height: 100, fontFamily: fontFamily.mono }}
              value={(node.config.content as string) ?? ""}
              onChange={(e) => set("content", e.target.value)}
            />
          </Field>
          <Field label="Language">
            <Select
              value={(node.config.codeExecLanguage as string) ?? "python"}
              onChange={(e) => set("codeExecLanguage", e.target.value)}
            >
              <option value="python">python</option>
              <option value="javascript">javascript</option>
              <option value="bash">bash</option>
            </Select>
          </Field>
          <Field label="Tool name (optional sandbox executor)">
            <TextInput
              value={(node.config.toolName as string) ?? ""}
              onChange={(e) => set("toolName", e.target.value)}
            />
          </Field>
        </>
      )}

      {node.type === "human_gate" && (
        <>
          <Field label="Content (shown at the approval checkpoint)">
            <TextArea
              style={{ height: 100 }}
              value={(node.config.content as string) ?? ""}
              onChange={(e) => set("content", e.target.value)}
            />
          </Field>
          <Field label="GenUI checkpoint surface (JSON, optional)">
            <TextArea
              style={{ height: 100, fontFamily: fontFamily.mono }}
              value={(node.config.genuiCheckpointSurfaceJson as string) ?? ""}
              onChange={(e) => set("genuiCheckpointSurfaceJson", e.target.value)}
            />
          </Field>
          <GenuiCheckpointPreview raw={(node.config.genuiCheckpointSurfaceJson as string) ?? ""} />
        </>
      )}
    </div>
  );
}

function portKindLabel(kind: string): string {
  return kind.replace(/-/g, " ");
}

function IoTab({
  node,
  issues,
  incomingEdges,
  outgoingEdges,
}: {
  node: GraphNode;
  issues: Diagnostic[];
  incomingEdges: GraphEdge[];
  outgoingEdges: GraphEdge[];
}) {
  const inputPorts = inputPortsFor(node);
  const outputPorts = outputPortsFor(node);
  // Mirrors backend/app/ports.py's default_input_port/default_output_port:
  // an edge with no explicit target_port/source_port binds to the first-
  // listed port, not a literal "input"/"output" id (router/branch's default
  // output port is "passthrough", not "output").
  const defaultInputPortId = inputPorts[0]?.id;
  const defaultOutputPortId = outputPorts[0]?.id;

  return (
    <div>
      <div style={{ ...localType.label, opacity: 0.6, marginBottom: spacing[2] }}>Input ports</div>
      {inputPorts.length === 0 ? (
        <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[3] }}>None.</div>
      ) : (
        inputPorts.map((port) => (
          <PortRow
            key={port.id}
            port={port}
            connectedEdges={incomingEdges.filter((edge) => (edge.target_port ?? defaultInputPortId) === port.id)}
            edgeLabel={(edge) => `from ${edge.source}`}
            issues={issues.filter((issue) => issue.port_id === port.id)}
          />
        ))
      )}
      <div style={{ ...localType.label, opacity: 0.6, marginTop: spacing[3], marginBottom: spacing[2] }}>
        Output ports
      </div>
      {outputPorts.length === 0 ? (
        <div style={{ ...typeScale.caption, opacity: 0.6 }}>None.</div>
      ) : (
        outputPorts.map((port) => (
          <PortRow
            key={port.id}
            port={port}
            connectedEdges={outgoingEdges.filter((edge) => (edge.source_port ?? defaultOutputPortId) === port.id)}
            edgeLabel={(edge) => `to ${edge.target}`}
            issues={issues.filter((issue) => issue.port_id === port.id)}
          />
        ))
      )}
    </div>
  );
}

function PortRow({
  port,
  connectedEdges,
  edgeLabel,
  issues,
}: {
  port: { id: string; name: string; contract: { kind: string } };
  connectedEdges: GraphEdge[];
  edgeLabel: (edge: GraphEdge) => string;
  issues: Diagnostic[];
}) {
  return (
    <div
      style={{
        marginBottom: spacing[2],
        padding: spacing[2],
        borderRadius: radius.lg,
        border: `1px solid ${surface.borderStrong}`,
        background: surface.raised,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: spacing[2] }}>
        <span style={{ ...typeScale.small, fontWeight: 600 }}>{port.name}</span>
        <span style={{ ...typeScale.caption, opacity: 0.6 }}>{portKindLabel(port.contract.kind)}</span>
      </div>
      <div style={{ ...typeScale.caption, opacity: 0.6, marginTop: spacing[1] - 2 }}>
        {connectedEdges.length === 0
          ? "Not connected on canvas."
          : connectedEdges.map(edgeLabel).join(", ")}
      </div>
      <IssueList issues={issues} />
    </div>
  );
}

function PolicyTab({
  graphId,
  nodeId,
  issues,
  onPolicyExceptionCreated,
}: {
  graphId: string | null;
  nodeId: string;
  issues: Diagnostic[];
  onPolicyExceptionCreated?: () => void;
}) {
  const [exceptions, setExceptions] = useState<PolicyException[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!graphId) return;
    let cancelled = false;
    setLoading(true);
    client
      .listPolicyExceptions(graphId)
      .then((all) => {
        if (!cancelled) setExceptions(all.filter((exception) => exception.node_id === nodeId));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load policy exceptions.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [graphId, nodeId]);

  async function handleWaive(diagnostic: Diagnostic, key: string) {
    if (!graphId) return;
    setBusyKey(key);
    setError(null);
    try {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const created = await client.createPolicyException(
        graphId,
        diagnostic.code,
        expiresAt,
        nodeId,
        "Waived from Studio",
      );
      setExceptions((current) => [...current, created]);
      onPolicyExceptionCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to waive diagnostic.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRevoke(exceptionId: string) {
    if (!graphId) return;
    setBusyKey(exceptionId);
    setError(null);
    try {
      await client.deletePolicyException(graphId, exceptionId);
      setExceptions((current) => current.filter((exception) => exception.id !== exceptionId));
      onPolicyExceptionCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke exception.");
    } finally {
      setBusyKey(null);
    }
  }

  const policyIssues = issues.filter((issue) => issue.category === "policy");

  if (!graphId) {
    return (
      <div style={{ ...typeScale.caption, opacity: 0.6 }}>Save the graph to manage policy exceptions.</div>
    );
  }

  return (
    <div>
      <div style={{ ...localType.label, opacity: 0.6, marginBottom: spacing[2] }}>Policy diagnostics</div>
      {policyIssues.length === 0 ? (
        <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[3] }}>
          No policy diagnostics on this node.
        </div>
      ) : (
        policyIssues.map((issue, index) => {
          const key = `${issue.code}-${index}`;
          const waivable = issue.blocking;
          return (
            <div key={key} style={{ marginBottom: spacing[2] }}>
              <div
                style={{
                  ...typeScale.caption,
                  color: issue.severity === "error" ? accentSurface.destructive.text : color.warning[500],
                }}
              >
                {issue.message}
              </div>
              {waivable && (
                <Button
                  variant="secondary"
                  disabled={busyKey === key}
                  onClick={() => void handleWaive(issue, key)}
                  style={{ marginTop: spacing[1] - 2, minHeight: shell.touchTarget.min }}
                >
                  {busyKey === key ? "Waiving…" : "Waive (30 days)"}
                </Button>
              )}
            </div>
          );
        })
      )}

      <div style={{ ...localType.label, opacity: 0.6, marginTop: spacing[3], marginBottom: spacing[2] }}>
        Active exceptions
      </div>
      {loading ? (
        <div style={{ ...typeScale.caption, opacity: 0.6 }}>Loading…</div>
      ) : exceptions.length === 0 ? (
        <div style={{ ...typeScale.caption, opacity: 0.6 }}>No exceptions on this node.</div>
      ) : (
        exceptions.map((exception) => (
          <div
            key={exception.id}
            style={{
              marginBottom: spacing[2],
              padding: spacing[2],
              borderRadius: radius.lg,
              border: `1px solid ${surface.borderStrong}`,
              background: surface.raised,
            }}
          >
            <div style={{ ...typeScale.small, fontWeight: 600 }}>{exception.policy_code}</div>
            <div style={{ ...typeScale.caption, opacity: 0.6, marginTop: spacing[1] - 2 }}>
              Expires {new Date(exception.expires_at).toLocaleDateString()}
            </div>
            <Button
              variant="secondary"
              disabled={busyKey === exception.id}
              onClick={() => void handleRevoke(exception.id)}
              style={{ marginTop: spacing[1], minHeight: shell.touchTarget.min }}
            >
              {busyKey === exception.id ? "Revoking…" : "Revoke"}
            </Button>
          </div>
        ))
      )}
      {error && (
        <div role="alert" style={{ ...typeScale.caption, color: accentSurface.destructive.text, marginTop: spacing[1] }}>
          {error}
        </div>
      )}
    </div>
  );
}

function formatTraceDuration(trace: NodeTrace): string | null {
  if (!trace.completed_at) return null;
  const ms = new Date(trace.completed_at).getTime() - new Date(trace.started_at).getTime();
  if (ms < 0) return null;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function RunTab({
  selectedTrace,
  onOpenRunPanel,
}: {
  selectedTrace: NodeTrace | null;
  onOpenRunPanel?: () => void;
}) {
  if (!selectedTrace) {
    return (
      <div>
        <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[2], lineHeight: "18px" }}>
          No trace yet for this node — run the graph to see its most recent execution here.
        </div>
        {onOpenRunPanel && (
          <Button variant="secondary" onClick={onOpenRunPanel}>
            Open Run panel
          </Button>
        )}
      </div>
    );
  }

  const duration = formatTraceDuration(selectedTrace);
  return (
    <div>
      <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[2] }}>
        {selectedTrace.status}
        {duration ? ` · ${duration}` : ""}
      </div>
      <div style={{ ...typeScale.caption, opacity: 0.6 }}>Input</div>
      <pre style={preStyle}>{JSON.stringify(selectedTrace.input, null, 2)}</pre>
      <div style={{ ...typeScale.caption, opacity: 0.6 }}>Output</div>
      <pre style={preStyle}>{JSON.stringify(selectedTrace.output, null, 2)}</pre>
      {selectedTrace.error && (
        <div style={{ ...typeScale.caption, color: accentSurface.destructive.text }}>{selectedTrace.error}</div>
      )}
      {onOpenRunPanel && (
        <Button variant="secondary" style={{ marginTop: spacing[2] }} onClick={onOpenRunPanel}>
          Open Run panel
        </Button>
      )}
    </div>
  );
}

const preStyle: CSSProperties = {
  ...typeScale.caption,
  fontFamily: fontFamily.mono,
  background: surface.raised,
  border: `1px solid ${surface.borderStrong}`,
  borderRadius: radius.lg,
  padding: spacing[2],
  marginBottom: spacing[2],
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 240,
  overflowY: "auto",
};

export function EdgeInspector({
  edge,
  issues = [],
  onChange,
  onDelete,
  fullWidth = false,
  reducedMotion = false,
}: {
  edge: GraphEdge;
  issues?: Diagnostic[];
  onChange: (patch: Partial<GraphEdge>) => void;
  onDelete: () => void;
  fullWidth?: boolean;
  reducedMotion?: boolean;
}) {
  const kindTaxonomy = EDGE_KIND_TAXONOMY[edge.kind];

  return (
    <div style={panelStyle(fullWidth)}>
      <CollapsibleSection sectionId="inspector-edge" title="Configure edge" reducedMotion={reducedMotion}>
      <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[3] - 2 }}>
        {edge.source} → {edge.target}
      </div>
      <IssueList issues={issues} />

      <Field
        label={
          <TaxonomyTooltip title={kindTaxonomy.title} summary={kindTaxonomy.summary} details={kindTaxonomy.details}>
            <span>Kind</span>
          </TaxonomyTooltip>
        }
      >
        <Select value={edge.kind} onChange={(e) => onChange({ kind: e.target.value as GraphEdge["kind"] })}>
          <option value="sequence">{EDGE_KIND_TAXONOMY.sequence.title}</option>
          <option value="conditional">{EDGE_KIND_TAXONOMY.conditional.title}</option>
          <option value="default">{EDGE_KIND_TAXONOMY.default.title}</option>
        </Select>
      </Field>

      {edge.kind === "conditional" && (
        <Field label="Condition (substring of previous LLM output, not the Prompt template)">
          <TextInput value={edge.condition ?? ""} onChange={(e) => onChange({ condition: e.target.value })} />
        </Field>
      )}

      <Button variant="destructive" style={{ marginTop: spacing[2], minHeight: 44 }} onClick={onDelete}>
        Delete edge
      </Button>
      </CollapsibleSection>

      {/* Raw JSON config editor (studio-config-editor-and-console-plan.md
          §6): scoped to kind/condition only, the same fields "Configure
          edge" above edits — patchFlowEdgeData only ever applies those two
          from a patch, so exposing more here would let an edit look
          accepted while silently doing nothing. */}
      <CollapsibleSection sectionId="inspector-edge-raw" title="Raw" reducedMotion={reducedMotion}>
        <JsonEditor
          value={{ kind: edge.kind, condition: edge.condition ?? null }}
          onApply={(next) => onChange(next)}
          parse={parseEdgeRawConfig}
          format={formatEdgeRawConfig}
        />
      </CollapsibleSection>
    </div>
  );
}

function RouterEdgeRow({
  edge,
  issues,
  onChange,
}: {
  edge: GraphEdge;
  issues: Diagnostic[];
  onChange: (patch: Partial<GraphEdge>) => void;
}) {
  const kindTaxonomy = EDGE_KIND_TAXONOMY[edge.kind];

  return (
    <div
      style={{
        marginBottom: spacing[2],
        padding: spacing[2],
        borderRadius: radius.lg,
        border: `1px solid ${surface.borderStrong}`,
        background: surface.raised,
      }}
    >
      <div style={{ ...typeScale.caption, opacity: 0.75, marginBottom: spacing[1] }}>
        → {edge.target}
      </div>
      <IssueList issues={issues} />
      <Field
        label={
          <TaxonomyTooltip title={kindTaxonomy.title} summary={kindTaxonomy.summary} details={kindTaxonomy.details}>
            <span>Kind</span>
          </TaxonomyTooltip>
        }
      >
        <Select value={edge.kind} onChange={(event) => onChange({ kind: event.target.value as GraphEdge["kind"] })}>
          <option value="sequence">{EDGE_KIND_TAXONOMY.sequence.title}</option>
          <option value="conditional">{EDGE_KIND_TAXONOMY.conditional.title}</option>
          <option value="default">{EDGE_KIND_TAXONOMY.default.title}</option>
        </Select>
      </Field>
      {edge.kind === "conditional" && (
        <Field label="Condition">
          <TextInput value={edge.condition ?? ""} onChange={(event) => onChange({ condition: event.target.value })} />
        </Field>
      )}
    </div>
  );
}

function IntentBlurb({ nodeType }: { nodeType: NodeType }) {
  const taxonomy = NODE_TYPE_TAXONOMY[nodeType];
  return (
    <p style={{ ...typeScale.caption, opacity: 0.8, lineHeight: "18px", margin: `0 0 ${spacing[3]}px` }}>
      {taxonomy.details}
    </p>
  );
}

function GenuiCheckpointPreview({ raw }: { raw: string }) {
  const surfaceValue = tryParseGenuiSurface(raw);
  if (!surfaceValue) return null;
  return (
    <div style={{ marginBottom: spacing[3] }}>
      <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>Live preview</div>
      <GenuiSurfaceView surface={surfaceValue} />
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: spacing[2], marginBottom: spacing[3] }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16 }}
      />
      <span style={{ ...typeScale.caption, opacity: 0.85 }}>{label}</span>
    </div>
  );
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginBottom: spacing[3] }}>
      <label style={{ display: "block", ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>{label}</label>
      {children}
    </div>
  );
}

function panelStyle(fullWidth: boolean): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    padding: shell.panelPadding,
    background: surface.panel,
    color: text.primary,
    overflowY: "auto",
  };
}
