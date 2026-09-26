import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Braces,
  ChevronDown,
  Copy,
  CornerDownRight,
  ExternalLink,
  History,
  Radar,
  MoreHorizontal,
  Play,
  Settings2,
  Shield,
  Shuffle,
  Trash2,
  XCircle,
} from "lucide-react";
import { EDGE_KIND_TAXONOMY, NODE_TYPE_TAXONOMY, ROUTER_RULES_TAXONOMY } from "@/content/taxonomy";
import {
  declareFromInferred,
  declaredPorts,
  inputKindLabel,
  inputPortsFor,
  outputPortsFor,
  PORT_KINDS,
  updatePortContract,
  withDeclaredPorts,
  type NodePorts,
  type PortDirection,
} from "@/content/node-ports";
import type {
  BindableResourceKind,
  ChatProvider,
  EdgeTransform,
  GraphDefinition,
  GraphEdge,
  GraphPort,
  GraphLayer,
  GraphNode,
  Diagnostic,
  NodeTrace,
  NodeType,
  PolicyException,
  ToolDefinition,
  PortKind,
} from "@bstockwelldev/agent-graph-sdk";
import {
  border,
  color,
  fontFamily,
  nodeType as nodeTypeAccents,
  radius,
  spacing,
  status as statusColor,
  surface,
  text,
} from "@/lib/graph-theme";
import { client } from "@/lib/api-client";
import { partitionDiagnosticsByField } from "@/lib/diagnostics";
import { GenuiSurfaceView } from "@/components/genui/genui-renderer";
import { tryParseGenuiSurface } from "@/lib/genui";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { ResourceBindingField } from "./ResourceBindingField";
import { TaxonomyTooltip } from "./Tooltip";
import { Button } from "./ui/Button";
import { Combobox, type ComboboxOption } from "./ui/Combobox";
import { Field, FieldIssues } from "./ui/Field";
import { Group } from "./ui/Group";
import { IconButton } from "./ui/IconButton";
import { IconTabs, type IconTab } from "./ui/IconTabs";
import { NumberStepper } from "./ui/NumberStepper";
import { PanelFrame, PanelHeader } from "./ui/PanelFrame";
import { SegmentedControl } from "./ui/SegmentedControl";
import { TemplateEditor } from "./ui/TemplateEditor";
import { Toggle } from "./ui/Toggle";
import { TextArea, TextInput } from "./ui/fields";
import { formatEdgeRawConfig, parseEdgeRawConfig } from "@/lib/jsonEditor";
import { RawConfigEditor } from "./ui/RawConfigEditor";
import { TransformFields, type TransformType } from "./TransformFields";
import { TransformTryIt } from "./TransformTryIt";
import { NodeHistoryTab } from "./NodeHistoryTab";
import { NodeImpactTab } from "./NodeImpactTab";
import { NodeContextMenu, menuAnchorFor } from "./NodeContextMenu";
import { NODE_TYPE_ICONS } from "./nodeTypeIcons";
import { SubgraphConfig } from "./SubgraphConfig";
import { childRunHref } from "@/lib/subgraphs";

/** Config fields each node type's Configure form renders -- the fields
 * inline diagnostics can attach to (Wave 2.5). Anything else stays in the
 * form's top banner. */
const RENDERED_FIELDS: Record<NodeType, readonly string[]> = {
  input: ["variableName"],
  prompt: ["promptId", "template"],
  llm: ["llmProfileId", "provider", "model", "systemPromptId", "systemPrompt"],
  tool: ["toolName", "inputVariable"],
  router: ["routes"],
  output: [],
  guardrail: ["allowUrls"],
  rubric: ["rubricFailOnFindings"],
  branch: ["content", "routes"],
  tool_loop: ["llmProfileId", "provider", "model", "systemPromptId", "systemPrompt", "maxToolIterations"],
  code_exec: ["content", "codeExecLanguage", "toolName"],
  human_gate: ["content", "genuiCheckpointSurfaceJson"],
  subgraph: ["graphId", "version", "inputMapping"],
  transform: ["transformId", "type", "pointer", "field", "template", "targetType"],
};

/** A transform node's camelCase config as the shared TransformFields value. */
function nodeTransformValue(config: Record<string, unknown>): EdgeTransform | null {
  if (typeof config.type !== "string") return null;
  return {
    type: config.type as TransformType,
    pointer: (config.pointer as string | undefined) ?? null,
    field: (config.field as string | undefined) ?? null,
    template: (config.template as string | undefined) ?? null,
    target_type: (config.targetType as EdgeTransform["target_type"]) ?? null,
  };
}

const NODE_TRANSFORM_KEYS = new Set(["type", "pointer", "field", "template", "targetType"]);

/** Writes `transform` back into a transform node's config (dropping the other types' fields). */
function withNodeTransform(config: Record<string, unknown>, transform: EdgeTransform | null): Record<string, unknown> {
  const rest = Object.fromEntries(Object.entries(config).filter(([key]) => !NODE_TRANSFORM_KEYS.has(key)));
  if (!transform?.type) return rest;
  const next: Record<string, unknown> = { ...rest, type: transform.type };
  if (transform.pointer != null) next.pointer = transform.pointer;
  if (transform.field != null) next.field = transform.field;
  if (transform.template != null) next.template = transform.template;
  if (transform.target_type != null) next.targetType = transform.target_type;
  return next;
}

/** Contract diagnostics a transform on this edge resolves (backend contracts.py). */
const TRANSFORM_ISSUE_CODES = new Set(["CONTRACT_KIND_INFERRED_MISMATCH", "EDGE_CONTRACT_KIND_INCOMPATIBLE", "EDGE_TRANSFORM_INVALID"]);

const EDGE_KIND_OPTIONS = (["sequence", "conditional", "default"] as const).map((value) => ({
  value,
  label: value === "sequence" ? "Always" : value === "conditional" ? "If match" : "Fallback",
  title: EDGE_KIND_TAXONOMY[value].summary,
}));

const STATUS_WORD: Record<string, string> = {
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  paused: "Paused",
};

/**
 * Node details panel -- "Inspector v2" (studio-graph-workbench-redesign-plan.md,
 * Wave 2.5 / STO-606). Identity lives in the header (type chip, inline-
 * editable name, id · last-run status · issue count, and actions), sections
 * are icon tabs with counts, configuration is grouped into cards with
 * purpose-built inputs (combobox, template editor, toggle, stepper,
 * segmented control), and diagnostics render under the field they concern.
 *
 * `GraphEditor.tsx` remounts this component on node-selection change
 * (`key={node.id}`), so `activeTab` resets per node without its own effect.
 */
export function NodeInspector({
  node,
  graphId = null,
  issues = [],
  outgoingEdges = [],
  incomingEdges = [],
  selectedTrace = null,
  onConfigChange,
  onPortsChange,
  incomingKinds = [],
  onEdgeChange,
  onDelete,
  onDuplicate,
  onRunFromHere,
  onOpenRunPanel,
  onPolicyExceptionCreated,
  focusTab = null,
  userLabel = "",
  derivedLabel = "",
  onLabelChange,
  historyRefreshKey = null,
  onInspectRun,
  onTabChange,
  templateVariables = [],
  onOpenResource,
  getDraftGraph,
  onSelectNode,
  onOpenReleases,
  onImpactHighlight,
  layers = [],
  currentLayer = null,
  onLayerChange,
  onManageLayers,
}: {
  node: GraphNode;
  graphId?: string | null;
  issues?: Diagnostic[];
  outgoingEdges?: GraphEdge[];
  /** Edges targeting this node, for the I/O tab's input-port cross-reference. */
  incomingEdges?: GraphEdge[];
  /** This node's most recent execution, for the Run tab and header status. */
  selectedTrace?: NodeTrace | null;
  onConfigChange: (config: Record<string, unknown>) => void;
  /** I/O tab: declare (type) or reset this node's ports. Omitted = read-only. */
  onPortsChange?: (ports: NodePorts | undefined) => void;
  /** What arrives on this node's input: each incoming edge's source output kind. */
  incomingKinds?: readonly PortKind[];
  onEdgeChange?: (edgeId: string, patch: Partial<GraphEdge>) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onRunFromHere?: () => void;
  onOpenRunPanel?: () => void;
  /** Called after a policy exception is created/deleted from the Policy tab,
   * so the caller can re-validate and pick up the diagnostic change. */
  onPolicyExceptionCreated?: () => void;
  /** Kept for call-site compatibility; the frame is always full-width now. */
  fullWidth?: boolean;
  /** Diagnostics-as-navigation (studio-ux-gap-remediation-plan.md §1):
   * force-open a specific tab. Guarded by `nodeId` so a stale request from a
   * previously-selected node can never apply to this one. */
  focusTab?: { tab: string; nonce: number; nodeId: string } | null;
  /** Node naming: the user's name (persisted as `extensions.label`) and the
   * config-derived title shown as the placeholder when it's blank. */
  userLabel?: string;
  derivedLabel?: string;
  onLabelChange?: (label: string) => void;
  /** History tab (Wave 2): refetch when this changes (e.g. a run finished). */
  historyRefreshKey?: string | null;
  /** History tab row click: inspect that run on the canvas. */
  onInspectRun?: (runId: string) => void;
  /** Reports tab changes so GraphEditor can mirror them into the URL. */
  onTabChange?: (tab: string) => void;
  /** Variables `{…}` can reference in this node's templates (run inputs +
   * upstream), for highlighting and autocomplete. */
  templateVariables?: readonly string[];
  /** Wave 4a: open a bound registry resource for editing (the studio's
   * resource panel) without leaving the canvas. */
  onOpenResource?: (kind: BindableResourceKind, resourceId: string) => void;
  /** Wave 7a (STO-610) Impact tab: the live canvas graph, navigation, and
   * the canvas highlight for this node's downstream set. */
  getDraftGraph?: () => GraphDefinition;
  onSelectNode?: (nodeId: string) => void;
  onOpenReleases?: () => void;
  onImpactHighlight?: (nodeIds: string[] | null) => void;
  /** Wave 7d (STO-622): the graph's architecture layers and this node's. */
  layers?: GraphLayer[];
  currentLayer?: string | null;
  onLayerChange?: (layer: string | null) => void;
  onManageLayers?: () => void;
}) {
  const [activeTab, setActiveTabState] = useState("configure");
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    onTabChange?.(tab);
  };
  const set = (key: string, value: unknown) => onConfigChange({ ...node.config, [key]: value });
  const tokens = nodeTypeAccents[node.type];
  const Icon = NODE_TYPE_ICONS[node.type];
  const taxonomy = NODE_TYPE_TAXONOMY[node.type];
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusTab && focusTab.nodeId === node.id) setActiveTab(focusTab.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on nonce/nodeId change only
  }, [focusTab?.nonce, focusTab?.nodeId, node.id]);

  const portIssues = issues.filter((issue) => issue.port_id);
  const policyIssues = issues.filter((issue) => issue.category === "policy");
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  const traceStatus = selectedTrace?.status;

  const tabs: IconTab[] = [
    { id: "configure", label: "Config", icon: <Settings2 size={14} /> },
    { id: "io", label: "I/O", icon: <ArrowLeftRight size={14} />, count: portIssues.length, countTone: "warning" },
    { id: "policy", label: "Policy", icon: <Shield size={14} />, count: policyIssues.length, countTone: "error" },
    { id: "run", label: "Run", icon: <Play size={14} /> },
    { id: "history", label: "History", icon: <History size={14} />, iconOnly: true },
    { id: "impact", label: "Impact", icon: <Radar size={14} />, iconOnly: true },
    { id: "raw", label: "Raw JSON", icon: <Braces size={14} />, iconOnly: true },
  ];

  const header = (
    <PanelHeader
      icon={
        <span
          title={taxonomy.title}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            flexShrink: 0,
            borderRadius: radius.lg,
            border: `1px solid ${tokens.border}`,
            background: tokens.bg,
            color: tokens.accent,
          }}
        >
          <Icon size={18} aria-hidden="true" />
        </span>
      }
      title={
        onLabelChange ? (
          <input
            value={userLabel}
            placeholder={derivedLabel}
            aria-label="Node name"
            onChange={(event) => onLabelChange(event.target.value)}
            className="agb-inline-input agb-focus-ring"
            style={{
              width: "100%",
              boxSizing: "border-box",
              margin: "-3px 0 -3px -6px",
              padding: "2px 6px",
              borderRadius: radius.md,
              border: "1px solid transparent",
              color: text.primary,
              fontSize: 15,
              fontWeight: 650,
              lineHeight: "22px",
            }}
          />
        ) : (
          derivedLabel
        )
      }
      subtitle={
        <>
          <span style={{ color: tokens.label, fontWeight: 600 }}>{taxonomy.title.replace(/ node$/i, "")}</span>
          <span aria-hidden="true">·</span>
          <code style={{ fontFamily: fontFamily.mono, fontSize: 11 }}>{node.id}</code>
          {traceStatus && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: statusColor[traceStatus] }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: statusColor[traceStatus] }} />
              {STATUS_WORD[traceStatus] ?? traceStatus}
            </span>
          )}
          {issues.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("configure")}
              className="agb-focus-ring"
              style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: 0, border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: errorCount ? color.error[500] : color.warning[500] }}
            >
              {errorCount ? <XCircle size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}
              {errorCount ? `${errorCount} error${errorCount === 1 ? "" : "s"}` : `${warningCount} warning${warningCount === 1 ? "" : "s"}`}
            </button>
          )}
        </>
      }
      actions={
        <>
          {onRunFromHere && node.type !== "input" && (
            <IconButton label="Run from here" icon={<Play size={15} />} onClick={onRunFromHere} tooltipPlacement="bottom" />
          )}
          {onDuplicate && <IconButton label="Duplicate" icon={<Copy size={15} />} onClick={onDuplicate} tooltipPlacement="bottom" />}
          <IconButton
            ref={moreRef}
            label="More node actions"
            icon={<MoreHorizontal size={16} />}
            aria-haspopup="menu"
            onClick={() => moreRef.current && setMenuAnchor(menuAnchorFor(moreRef.current, "right", 200))}
            tooltipPlacement="bottom"
          />
          {menuAnchor && (
            <NodeContextMenu
              x={menuAnchor.x}
              y={menuAnchor.y}
              width={200}
              title="Node"
              onClose={() => setMenuAnchor(null)}
              actions={[
                ...(onOpenRunPanel ? [{ label: "Open Run panel", icon: <Play size={14} />, onClick: onOpenRunPanel }] : []),
                { label: "Delete node", icon: <Trash2 size={14} />, tone: "destructive" as const, onClick: onDelete, separatorBefore: Boolean(onOpenRunPanel) },
              ]}
            />
          )}
        </>
      }
    />
  );

  return (
    <PanelFrame
      aria-label="Node details"
      header={header}
      tabs={<IconTabs aria-label="Node sections" tabs={tabs} activeId={activeTab} onChange={setActiveTab} />}
    >
      {activeTab === "configure" && onLayerChange && (
        <LayerField layers={layers} value={currentLayer} onChange={onLayerChange} onManageLayers={onManageLayers} />
      )}
      {activeTab === "configure" && (
        <ConfigureTab
          node={node}
          graphId={graphId}
          issues={issues}
          outgoingEdges={outgoingEdges}
          onEdgeChange={onEdgeChange}
          set={set}
          replaceConfig={onConfigChange}
          templateVariables={templateVariables}
          onOpenResource={onOpenResource}
        />
      )}
      {activeTab === "io" && (
        <IoTab
          node={node}
          issues={issues}
          incomingEdges={incomingEdges}
          outgoingEdges={outgoingEdges}
          incomingKinds={incomingKinds}
          onPortsChange={onPortsChange}
        />
      )}
      {activeTab === "policy" && (
        <PolicyTab graphId={graphId} nodeId={node.id} issues={issues} onPolicyExceptionCreated={onPolicyExceptionCreated} />
      )}
      {activeTab === "run" && (
        <RunTab
          selectedTrace={selectedTrace}
          onOpenRunPanel={onOpenRunPanel}
          childGraphId={node.type === "subgraph" ? String(node.config.graphId ?? "") : undefined}
        />
      )}
      {activeTab === "history" &&
        (graphId ? (
          <NodeHistoryTab graphId={graphId} nodeId={node.id} refreshKey={historyRefreshKey} onInspectRun={onInspectRun} />
        ) : (
          <Muted>Save the graph to see this node&apos;s history.</Muted>
        ))}
      {activeTab === "impact" &&
        (graphId && getDraftGraph ? (
          <NodeImpactTab
            graphId={graphId}
            nodeId={node.id}
            getDraftGraph={getDraftGraph}
            refreshKey={historyRefreshKey}
            onSelectNode={onSelectNode}
            onOpenResource={onOpenResource}
            onOpenReleases={onOpenReleases}
            onHighlight={onImpactHighlight}
          />
        ) : (
          <Muted>Save the graph to see this node&apos;s impact.</Muted>
        ))}
      {activeTab === "raw" && (
        <Group title="Raw config" icon={<Braces size={13} />}>
          <RawConfigEditor value={node.config} onApply={onConfigChange} />
        </Group>
      )}
    </PanelFrame>
  );
}

function Muted({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 12, lineHeight: "18px", color: text.secondary, ...style }}>{children}</div>;
}

function IntentBlurb({ nodeType }: { nodeType: NodeType }) {
  const taxonomy = NODE_TYPE_TAXONOMY[nodeType];
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: spacing[3], fontSize: 12, lineHeight: "18px", color: text.secondary }}>
      {taxonomy.summary}{" "}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="agb-focus-ring"
        style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: 0, border: "none", background: "transparent", color: color.primary[500], cursor: "pointer", fontSize: 12 }}
      >
        {open ? "Less" : "Learn more"}
        <ChevronDown size={12} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open && <p style={{ margin: `${spacing[1]}px 0 0`, color: text.muted }}>{taxonomy.details}</p>}
    </div>
  );
}

const BUILTIN_TOOLS: ComboboxOption[] = [
  { value: "lookup_topic", label: "lookup_topic", description: "Demo topic lookup", group: "Built-in" },
  { value: "web_search", label: "web_search", description: "Web search", group: "Built-in" },
  { value: "calculator", label: "calculator", description: "Arithmetic", group: "Built-in" },
];

function useToolOptions(enabled: boolean): ComboboxOption[] {
  const [registered, setRegistered] = useState<ToolDefinition[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    client.tools
      .list()
      .then((tools) => {
        if (!cancelled) setRegistered(tools);
      })
      .catch(() => {
        // Registry unavailable: built-ins still work.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return [
    ...BUILTIN_TOOLS,
    ...registered
      .filter((tool) => !BUILTIN_TOOLS.some((builtin) => builtin.value === tool.id))
      .map((tool) => ({ value: tool.id, label: tool.id, description: tool.description || undefined, group: "Registry" })),
  ];
}

function ConfigureTab({
  node,
  graphId,
  issues,
  outgoingEdges,
  onEdgeChange,
  set,
  replaceConfig,
  templateVariables,
  onOpenResource,
}: {
  node: GraphNode;
  graphId: string | null;
  issues: Diagnostic[];
  outgoingEdges: GraphEdge[];
  onEdgeChange?: (edgeId: string, patch: Partial<GraphEdge>) => void;
  set: (key: string, value: unknown) => void;
  replaceConfig: (config: Record<string, unknown>) => void;
  templateVariables: readonly string[];
  onOpenResource?: (kind: BindableResourceKind, resourceId: string) => void;
}) {
  const { byField, rest } = partitionDiagnosticsByField(
    issues.filter((issue) => !issue.edge_id),
    RENDERED_FIELDS[node.type],
  );
  const fieldIssues = (key: string) => byField[key] ?? [];
  const toolOptions = useToolOptions(node.type === "tool");
  const str = (key: string, fallback = "") => (node.config[key] as string | undefined) ?? fallback;
  const vars = [...new Set([...templateVariables, "upstream"])];
  // The transform node's "Try it" runs the bound library entry, else the inline config.
  const tryTransform: EdgeTransform | null =
    node.type !== "transform" ? null : str("transformId") ? { transform_id: str("transformId") } : nodeTransformValue(node.config);

  return (
    <div>
      <IntentBlurb nodeType={node.type} />
      {rest.length > 0 && (
        <div role="alert" style={{ marginBottom: spacing[3], padding: spacing[2], borderRadius: radius.lg, border: `1px solid ${rest.some((i) => i.severity === "error") ? color.error[700] : color.warning[700]}`, background: "rgba(226, 100, 90, 0.06)" }}>
          <FieldIssues issues={rest} />
        </div>
      )}

      {node.type === "input" && (
        <Group title="Input">
          <Field label="Variable name" hint="The key this node reads from the run input. The Run panel shows one field per input variable." issues={fieldIssues("variableName")}>
            {(id) => <TextInput id={id} value={str("variableName")} style={{ fontFamily: fontFamily.mono }} onChange={(e) => set("variableName", e.target.value)} />}
          </Field>
        </Group>
      )}

      {node.type === "prompt" && (
        <Group title="Template">
          <ResourceBindingField
            kind="prompts"
            label="Prompt template"
            value={str("promptId") || undefined}
            onChange={(id) => set("promptId", id)}
            onOpen={onOpenResource}
            issues={fieldIssues("promptId")}
            variables={vars}
          >
            <Field label="Prompt template" hint="Use {variables} from the run input, or {upstream} for the previous node's output." meta={`${str("template").length} chars`} issues={fieldIssues("template")}>
              {(id) => <TemplateEditor id={id} aria-label="Prompt template" title="Prompt template" value={str("template")} onChange={(v) => set("template", v)} variables={vars} rows={6} />}
            </Field>
          </ResourceBindingField>
        </Group>
      )}

      {(node.type === "llm" || node.type === "tool_loop") && (
        <>
          <Group title="Model">
            <ResourceBindingField
              kind="llm_profiles"
              label="Model"
              value={str("llmProfileId") || undefined}
              onChange={(id) => set("llmProfileId", id)}
              onOpen={onOpenResource}
              issues={fieldIssues("llmProfileId")}
            >
              <ProviderModelPicker
                graphId={graphId}
                provider={(node.config.provider as ChatProvider) ?? "ollama"}
                model={str("model", "qwen2.5:3b")}
                onProviderChange={(provider) => set("provider", provider)}
                onModelChange={(model) => set("model", model)}
              />
              <FieldIssues issues={[...fieldIssues("provider"), ...fieldIssues("model")]} />
            </ResourceBindingField>
          </Group>
          <Group title="Instructions">
            <ResourceBindingField
              kind="prompts"
              label="System prompt"
              value={str("systemPromptId") || undefined}
              onChange={(id) => set("systemPromptId", id)}
              onOpen={onOpenResource}
              issues={fieldIssues("systemPromptId")}
              variables={vars}
            >
              <Field label="System prompt" meta={`${str("systemPrompt").length} chars`} issues={fieldIssues("systemPrompt")}>
                {(id) => (
                  <TemplateEditor id={id} aria-label="System prompt" title="System prompt" value={str("systemPrompt")} onChange={(v) => set("systemPrompt", v)} variables={vars} rows={4} placeholder="Optional — how the model should behave" />
                )}
              </Field>
            </ResourceBindingField>
            {node.type === "tool_loop" && (
              <Field label="Max tool iterations" hint="Upper bound on tool-call rounds (1–64)." issues={fieldIssues("maxToolIterations")}>
                {(id) => (
                  <NumberStepper id={id} aria-label="Max tool iterations" value={Number(node.config.maxToolIterations ?? 4)} min={1} max={64} onChange={(v) => set("maxToolIterations", v)} />
                )}
              </Field>
            )}
          </Group>
        </>
      )}

      {node.type === "tool" && (
        <Group title="Tool">
          <Field label="Tool" issues={fieldIssues("toolName")}>
            {(id) => (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Combobox id={id} aria-label="Tool" value={str("toolName", "lookup_topic")} options={toolOptions} onChange={(v) => set("toolName", v)} searchPlaceholder="Search tools…" />
                </div>
                {onOpenResource && !BUILTIN_TOOLS.some((tool) => tool.value === str("toolName", "lookup_topic")) && (
                  <IconButton
                    label="Open tool"
                    icon={<ExternalLink size={15} />}
                    onClick={() => onOpenResource("tools", str("toolName"))}
                    style={{ width: 36, height: 36, border: `1px solid ${border.default}`, background: surface.card, flexShrink: 0 }}
                  />
                )}
              </div>
            )}
          </Field>
          <Field label="Input variable" hint="The variable passed to the tool as its input." issues={fieldIssues("inputVariable")}>
            {(id) => (
              <Combobox
                id={id}
                aria-label="Input variable"
                value={str("inputVariable", "question")}
                options={templateVariables.map((name) => ({ value: name, label: name }))}
                onChange={(v) => set("inputVariable", v)}
                allowCustom
                searchPlaceholder="Variable name…"
              />
            )}
          </Field>
        </Group>
      )}

      {(node.type === "router" || node.type === "branch") && (
        <Group
          title={`Routes · ${outgoingEdges.length}`}
          action={
            <TaxonomyTooltip layout="inline" title={ROUTER_RULES_TAXONOMY.title} summary={ROUTER_RULES_TAXONOMY.summary} details={ROUTER_RULES_TAXONOMY.details}>
              <span />
            </TaxonomyTooltip>
          }
        >
          {node.type === "branch" && (
            <Field label="Match content" hint="Substring gate on the upstream value." issues={fieldIssues("content")}>
              {(id) => <TextInput id={id} value={str("content")} onChange={(e) => set("content", e.target.value)} />}
            </Field>
          )}
          <FieldIssues issues={fieldIssues("routes")} />
          {outgoingEdges.length === 0 ? (
            <Muted>Connect edges from this node on the canvas to define routes.</Muted>
          ) : (
            outgoingEdges.map((edge) => (
              <RouterEdgeRow
                key={edge.id}
                edge={edge}
                issues={issues.filter((issue) => issue.edge_id === edge.id)}
                onChange={(patch) => onEdgeChange?.(edge.id, patch)}
              />
            ))
          )}
        </Group>
      )}

      {node.type === "output" && (
        <Group title="Output">
          <Muted>No configuration — whatever reaches this node becomes the run result.</Muted>
        </Group>
      )}

      {node.type === "guardrail" && (
        <Group title="Rules">
          <Toggle label="Allow URLs in content" description="When off, content containing URLs is blocked." checked={Boolean(node.config.allowUrls)} onChange={(v) => set("allowUrls", v)} />
          <FieldIssues issues={fieldIssues("allowUrls")} />
        </Group>
      )}

      {node.type === "rubric" && (
        <Group title="Rules">
          <Toggle label="Fail on findings" description="When on, any rubric finding fails this node (and the run)." checked={Boolean(node.config.rubricFailOnFindings)} onChange={(v) => set("rubricFailOnFindings", v)} />
          <FieldIssues issues={fieldIssues("rubricFailOnFindings")} />
        </Group>
      )}

      {node.type === "code_exec" && (
        <Group title="Code">
          <Field label="Language" issues={fieldIssues("codeExecLanguage")}>
            <SegmentedControl
              aria-label="Language"
              value={str("codeExecLanguage", "python") as "python" | "javascript" | "bash"}
              onChange={(v) => set("codeExecLanguage", v)}
              options={[
                { value: "python", label: "Python" },
                { value: "javascript", label: "JavaScript" },
                { value: "bash", label: "Bash" },
              ]}
            />
          </Field>
          <Field label="Contract / content" meta={`${str("content").length} chars`} issues={fieldIssues("content")}>
            {(id) => <TemplateEditor id={id} aria-label="Contract / content" value={str("content")} onChange={(v) => set("content", v)} variables={vars} rows={5} />}
          </Field>
          <Field label="Sandbox executor tool" hint="Optional tool that runs the code." issues={fieldIssues("toolName")}>
            {(id) => <TextInput id={id} value={str("toolName")} placeholder="None" onChange={(e) => set("toolName", e.target.value)} />}
          </Field>
        </Group>
      )}

      {node.type === "transform" && (
        <Group title="Transform" icon={<Shuffle size={13} />}>
          <ResourceBindingField
            kind="transforms"
            label="Transform"
            value={str("transformId") || undefined}
            onChange={(id) => set("transformId", id)}
            onOpen={onOpenResource}
            issues={fieldIssues("transformId")}
          >
            <TransformFields
              value={nodeTransformValue(node.config)}
              onChange={(transform) => replaceConfig(withNodeTransform(node.config, transform))}
            />
            <FieldIssues issues={["type", "pointer", "field", "template", "targetType"].flatMap((key) => fieldIssues(key))} />
          </ResourceBindingField>
          {tryTransform && <TransformTryIt transform={tryTransform} />}
        </Group>
      )}

      {node.type === "subgraph" && <SubgraphConfig node={node} graphId={graphId} set={set} fieldIssues={fieldIssues} variables={templateVariables} />}

      {node.type === "human_gate" && (
        <Group title="Checkpoint">
          <Field label="Content" hint="Shown to the approver at the checkpoint." issues={fieldIssues("content")}>
            {(id) => <TemplateEditor id={id} aria-label="Checkpoint content" value={str("content")} onChange={(v) => set("content", v)} variables={vars} rows={4} />}
          </Field>
          <Field label="GenUI surface (JSON)" hint="Optional schema-driven UI shown at the checkpoint." issues={fieldIssues("genuiCheckpointSurfaceJson")}>
            {(id) => (
              <TextArea id={id} style={{ height: 110, fontFamily: fontFamily.mono, fontSize: 12 }} value={str("genuiCheckpointSurfaceJson")} placeholder='{"type": "Stack", …}' onChange={(e) => set("genuiCheckpointSurfaceJson", e.target.value)} />
            )}
          </Field>
          <GenuiCheckpointPreview raw={str("genuiCheckpointSurfaceJson")} />
        </Group>
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
  incomingKinds,
  onPortsChange,
}: {
  node: GraphNode;
  issues: Diagnostic[];
  incomingEdges: GraphEdge[];
  outgoingEdges: GraphEdge[];
  incomingKinds: readonly PortKind[];
  onPortsChange?: (ports: NodePorts | undefined) => void;
}) {
  const mixedIncoming = [...new Set(incomingKinds)];
  const inputPorts = inputPortsFor(node);
  const outputPorts = outputPortsFor(node);
  // Mirrors backend/app/ports.py's default_input_port/default_output_port:
  // an edge with no explicit target_port/source_port binds to the first-
  // listed port (router/branch's default output port is "passthrough").
  const defaultInputPortId = inputPorts[0]?.id;
  const defaultOutputPortId = outputPorts[0]?.id;
  const current: NodePorts = { input_ports: node.input_ports, output_ports: node.output_ports };

  const setDeclared = (direction: PortDirection, list: GraphPort[] | null) =>
    onPortsChange?.(withDeclaredPorts(current, direction, list));

  const section = (direction: PortDirection, ports: GraphPort[], edges: GraphEdge[], defaultId: string | undefined) => {
    const declared = declaredPorts(node, direction);
    const edgePortOf = (edge: GraphEdge) => (direction === "input" ? edge.target_port : edge.source_port) ?? defaultId;
    return (
      <>
        {onPortsChange && (
          <Field
            label="Contract"
            hint={
              declared
                ? "Declared: these kinds and schemas are checked on every connection, and a mismatch with another declared port blocks compile."
                : "Inferred from the node type: mismatches only warn. Declare to type these ports explicitly."
            }
          >
            <SegmentedControl
              aria-label={`${direction === "input" ? "Input" : "Output"} contract`}
              value={declared ? "declared" : "inferred"}
              options={[
                { value: "inferred", label: "Inferred" },
                { value: "declared", label: "Declared" },
              ]}
              onChange={(mode) => setDeclared(direction, mode === "declared" ? declareFromInferred(node, direction, incomingKinds) : null)}
            />
          </Field>
        )}
        {direction === "input" && declared && mixedIncoming.length > 1 && (
          <Muted style={{ marginBottom: spacing[2], color: color.warning[500] }}>
            Incoming edges carry different kinds ({mixedIncoming.map(portKindLabel).join(", ")}). A declared kind blocks the edges that
            don&apos;t match — add a transform on those edges, or keep this input inferred.
          </Muted>
        )}
        {ports.map((port) => (
          <PortRow
            key={port.id}
            port={port}
            kindLabel={direction === "input" ? inputKindLabel(node, port) : port.contract.kind}
            connectedEdges={edges.filter((edge) => edgePortOf(edge) === port.id)}
            edgeLabel={(edge) => (direction === "input" ? `from ${edge.source}` : `to ${edge.target}`)}
            issues={issues.filter((issue) => issue.port_id === port.id)}
            editor={
              declared ? (
                <PortContractEditor
                  port={port}
                  direction={direction}
                  onChange={(patch) => setDeclared(direction, updatePortContract(declared, port.id, patch))}
                />
              ) : null
            }
          />
        ))}
      </>
    );
  };

  return (
    <div>
      <Group title="Inputs" icon={<ArrowLeftRight size={13} />}>
        {inputPorts.length === 0 ? <Muted>None — this is an entry node.</Muted> : section("input", inputPorts, incomingEdges, defaultInputPortId)}
      </Group>
      <Group title="Outputs" icon={<CornerDownRight size={13} />}>
        {outputPorts.length === 0 ? <Muted>None — this is a terminal node.</Muted> : section("output", outputPorts, outgoingEdges, defaultOutputPortId)}
      </Group>
    </div>
  );
}

const PORT_KIND_OPTIONS = PORT_KINDS.map((kind) => ({ value: kind, label: portKindLabel(kind) }));

/** Kind, required-ness (inputs) and optional JSON Schema for one declared port. */
function PortContractEditor({
  port,
  direction,
  onChange,
}: {
  port: GraphPort;
  direction: PortDirection;
  onChange: (patch: Partial<GraphPort["contract"]>) => void;
}) {
  const [editingSchema, setEditingSchema] = useState(Boolean(port.contract.schema));
  return (
    <div style={{ marginTop: spacing[2] }}>
      <Field label="Kind">
        {(id) => (
          <Combobox
            id={id}
            aria-label={`${port.name} kind`}
            value={port.contract.kind}
            options={PORT_KIND_OPTIONS}
            onChange={(kind) => kind && onChange({ kind: kind as PortKind })}
          />
        )}
      </Field>
      {direction === "input" && (
        <Toggle
          label="Required"
          description="Compile warns when nothing is connected to this input."
          checked={port.contract.required !== false}
          onChange={(required) => onChange({ required })}
        />
      )}
      {editingSchema ? (
        <Field label="JSON Schema" hint="type, required, properties, items and enum are checked against connected ports; other keywords warn. Apply {} to remove.">
          <RawConfigEditor
            label={`${port.name} schema`}
            value={port.contract.schema ?? {}}
            height={140}
            onApply={(schema) => {
              const empty = Object.keys(schema).length === 0;
              onChange({ schema: empty ? null : schema });
              if (empty) setEditingSchema(false);
            }}
          />
        </Field>
      ) : (
        <Button variant="secondary" onClick={() => setEditingSchema(true)}>
          Add JSON Schema
        </Button>
      )}
    </div>
  );
}

function PortRow({
  port,
  kindLabel = port.contract.kind,
  connectedEdges,
  edgeLabel,
  issues,
  editor = null,
}: {
  port: { id: string; name: string; contract: { kind: string } };
  kindLabel?: string;
  connectedEdges: GraphEdge[];
  edgeLabel: (edge: GraphEdge) => string;
  issues: Diagnostic[];
  editor?: ReactNode;
}) {
  return (
    <div style={{ padding: `${spacing[2]}px 0`, borderTop: `1px solid ${border.subtle}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: spacing[2] }}>
        <code style={{ fontFamily: fontFamily.mono, fontSize: 12.5, fontWeight: 600, color: text.primary }}>{port.name}</code>
        <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 999, border: `1px solid ${border.subtle}`, color: text.muted }}>
          {portKindLabel(kindLabel)}
        </span>
      </div>
      <Muted style={{ marginTop: 2 }}>
        {connectedEdges.length === 0 ? "Not connected" : connectedEdges.map(edgeLabel).join(", ")}
      </Muted>
      <FieldIssues issues={issues} />
      {editor}
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
      .policies.exceptions.list({ graphId })
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
      const created = await client.policies.exceptions.create(graphId, { code: diagnostic.code, expiresAt, nodeId, reason: "Waived from Studio" });
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
      await client.policies.exceptions.delete(graphId, exceptionId);
      setExceptions((current) => current.filter((exception) => exception.id !== exceptionId));
      onPolicyExceptionCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke exception.");
    } finally {
      setBusyKey(null);
    }
  }

  const policyIssues = issues.filter((issue) => issue.category === "policy");

  if (!graphId) return <Muted>Save the graph to manage policy exceptions.</Muted>;

  return (
    <div>
      <Group title="Policy diagnostics" icon={<Shield size={13} />}>
        {policyIssues.length === 0 ? (
          <Muted>No policy diagnostics on this node.</Muted>
        ) : (
          policyIssues.map((issue, index) => {
            const key = `${issue.code}-${index}`;
            return (
              <div key={key} style={{ padding: `${spacing[2]}px 0`, borderTop: index ? `1px solid ${border.subtle}` : "none" }}>
                <FieldIssues issues={[issue]} />
                {issue.blocking && (
                  <Button variant="secondary" disabled={busyKey === key} onClick={() => void handleWaive(issue, key)} style={{ marginTop: spacing[2], fontSize: 12 }}>
                    {busyKey === key ? "Waiving…" : "Waive for 30 days"}
                  </Button>
                )}
              </div>
            );
          })
        )}
      </Group>
      <Group title="Active exceptions">
        {loading ? (
          <Muted>Loading…</Muted>
        ) : exceptions.length === 0 ? (
          <Muted>No exceptions on this node.</Muted>
        ) : (
          exceptions.map((exception, index) => (
            <div key={exception.id} style={{ display: "flex", alignItems: "center", gap: spacing[2], padding: `${spacing[2]}px 0`, borderTop: index ? `1px solid ${border.subtle}` : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <code style={{ fontFamily: fontFamily.mono, fontSize: 12, fontWeight: 600 }}>{exception.policy_code}</code>
                <Muted>Expires {new Date(exception.expires_at).toLocaleDateString()}</Muted>
              </div>
              <Button variant="ghost" disabled={busyKey === exception.id} onClick={() => void handleRevoke(exception.id)} style={{ fontSize: 12 }}>
                {busyKey === exception.id ? "Revoking…" : "Revoke"}
              </Button>
            </div>
          ))
        )}
      </Group>
      {error && (
        <div role="alert" style={{ fontSize: 12, color: color.error[500] }}>
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

/** Wave 7d: which architecture layer (swimlane) the node sits in. */
function LayerField({
  layers,
  value,
  onChange,
  onManageLayers,
}: {
  layers: GraphLayer[];
  value: string | null;
  onChange: (layer: string | null) => void;
  onManageLayers?: () => void;
}) {
  const known = value && layers.some((layer) => layer.id === value) ? value : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: spacing[2], marginBottom: spacing[2] }}>
      <span style={{ fontSize: 12, color: text.secondary, flexShrink: 0 }}>Layer</span>
      {layers.length > 0 ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          <Combobox
            id="node-layer"
            aria-label="Layer"
            value={known}
            options={[{ value: "", label: "Unassigned" }, ...layers.map((layer) => ({ value: layer.id, label: layer.label }))]}
            onChange={(v) => onChange(v || null)}
          />
        </div>
      ) : (
        <span style={{ fontSize: 12, color: text.muted, flex: 1 }}>No layers yet</span>
      )}
      {onManageLayers && (
        <Button variant="secondary" onClick={onManageLayers} style={{ fontSize: 12, flexShrink: 0 }}>
          Manage…
        </Button>
      )}
    </div>
  );
}

function RunTab({
  selectedTrace,
  onOpenRunPanel,
  childGraphId,
}: {
  selectedTrace: NodeTrace | null;
  onOpenRunPanel?: () => void;
  /** Wave 7c: a subgraph node's configured graph, for "Open child run". */
  childGraphId?: string | null;
}) {
  if (!selectedTrace) {
    return (
      <Group title="Last execution">
        <Muted style={{ marginBottom: spacing[2] }}>No trace yet — run the graph to see this node&apos;s most recent execution.</Muted>
        {onOpenRunPanel && (
          <Button variant="secondary" onClick={onOpenRunPanel} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <Play size={13} aria-hidden="true" /> Open Run panel
          </Button>
        )}
      </Group>
    );
  }

  const duration = formatTraceDuration(selectedTrace);
  const tone = statusColor[selectedTrace.status];
  const childRun = childGraphId !== undefined ? childRunHref(selectedTrace, childGraphId) : null;
  return (
    <div>
      <Group
        title="Last execution"
        action={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: tone, fontWeight: 600 }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: tone }} />
            {STATUS_WORD[selectedTrace.status] ?? selectedTrace.status}
            {duration && <span style={{ color: text.secondary, fontWeight: 400 }}>· {duration}</span>}
          </span>
        }
      >
        <Field label="Input">
          <pre style={preStyle}>{JSON.stringify(selectedTrace.input, null, 2)}</pre>
        </Field>
        <Field label="Output">
          <pre style={preStyle}>{JSON.stringify(selectedTrace.output, null, 2)}</pre>
        </Field>
        {selectedTrace.error && (
          <div role="alert" style={{ fontSize: 12, color: color.error[500], overflowWrap: "anywhere" }}>
            {selectedTrace.error}
          </div>
        )}
        {childRun && (
          <a href={childRun} className="agb-focus-ring agb-hoverable" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: color.primary[500], marginTop: spacing[2] }}>
            <ExternalLink size={13} aria-hidden="true" /> Open child run
          </a>
        )}
      </Group>
    </div>
  );
}

const preStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: "18px",
  fontFamily: fontFamily.mono,
  background: surface.inset,
  border: `1px solid ${border.subtle}`,
  borderRadius: radius.lg,
  padding: spacing[2],
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 220,
  overflowY: "auto",
  color: text.primary,
};

export function EdgeInspector({
  edge,
  issues = [],
  sourcePorts = [],
  targetPorts = [],
  onChange,
  onDelete,
}: {
  edge: GraphEdge;
  issues?: Diagnostic[];
  /** The source node's output ports and the target's input ports (declared, else inferred). */
  sourcePorts?: GraphPort[];
  targetPorts?: GraphPort[];
  onChange: (patch: Partial<GraphEdge>) => void;
  onDelete: () => void;
  fullWidth?: boolean;
  reducedMotion?: boolean;
}) {
  const [tab, setTab] = useState("configure");
  const [addingTransform, setAddingTransform] = useState(false);
  const kindTaxonomy = EDGE_KIND_TAXONOMY[edge.kind];
  const transformIssues = issues.filter((issue) => TRANSFORM_ISSUE_CODES.has(issue.code));
  const routingIssues = issues.filter((issue) => !TRANSFORM_ISSUE_CODES.has(issue.code));
  const showTransform = Boolean(edge.transform) || transformIssues.length > 0 || addingTransform;
  return (
    <PanelFrame
      aria-label="Edge details"
      header={
        <PanelHeader
          icon={
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: radius.lg, border: `1px solid ${border.default}`, background: surface.card, color: text.muted }}>
              <CornerDownRight size={18} aria-hidden="true" />
            </span>
          }
          title="Edge"
          subtitle={
            <code style={{ fontFamily: fontFamily.mono, fontSize: 11 }}>
              {edge.source} → {edge.target}
            </code>
          }
          actions={<IconButton label="Delete edge" tone="destructive" icon={<Trash2 size={15} />} onClick={onDelete} tooltipPlacement="bottom" />}
        />
      }
      tabs={
        <IconTabs
          aria-label="Edge sections"
          activeId={tab}
          onChange={setTab}
          tabs={[
            { id: "configure", label: "Config", icon: <Settings2 size={14} /> },
            { id: "raw", label: "Raw JSON", icon: <Braces size={14} />, iconOnly: true },
          ]}
        />
      }
    >
      {tab === "configure" ? (
        <>
          <Group title="Routing">
            <Field label="When to follow" hint={kindTaxonomy.details}>
              <SegmentedControl aria-label="Edge kind" value={edge.kind} options={EDGE_KIND_OPTIONS} onChange={(kind) => onChange({ kind })} />
            </Field>
            {edge.kind === "conditional" && (
              <Field label="Match text" hint="Followed when the previous LLM output contains this text (not the prompt template).">
                {(id) => <TextInput id={id} value={edge.condition ?? ""} placeholder="e.g. technical" onChange={(e) => onChange({ condition: e.target.value })} />}
              </Field>
            )}
            <FieldIssues issues={routingIssues} />
          </Group>
          {(sourcePorts.length > 1 || targetPorts.length > 1 || edge.source_port || edge.target_port) && (
            <Group title="Ports" icon={<ArrowLeftRight size={13} />}>
              {sourcePorts.length > 1 && (
                <Field label="From output" hint="Which output of the source this edge carries. The first one is the default.">
                  <SegmentedControl
                    aria-label="Source port"
                    value={edge.source_port ?? sourcePorts[0].id}
                    options={sourcePorts.map((port) => ({ value: port.id, label: port.name, title: portKindLabel(port.contract.kind) }))}
                    onChange={(port) => onChange({ source_port: port === sourcePorts[0].id ? null : port })}
                  />
                </Field>
              )}
              {targetPorts.length > 1 && (
                <Field label="Into input" hint="Which input of the target this edge feeds. The first one is the default.">
                  <SegmentedControl
                    aria-label="Target port"
                    value={edge.target_port ?? targetPorts[0].id}
                    options={targetPorts.map((port) => ({ value: port.id, label: port.name, title: portKindLabel(port.contract.kind) }))}
                    onChange={(port) => onChange({ target_port: port === targetPorts[0].id ? null : port })}
                  />
                </Field>
              )}
            </Group>
          )}
          {showTransform ? (
            <Group title="Transform" icon={<Shuffle size={13} />}>
              <ResourceBindingField
                kind="transforms"
                label="Transform"
                value={edge.transform?.transform_id ?? undefined}
                onChange={(transformId) => onChange({ transform: transformId ? { transform_id: transformId } : null })}
                issues={transformIssues}
              >
                <TransformFields
                  allowNone
                  value={edge.transform?.transform_id ? null : (edge.transform ?? null)}
                  onChange={(transform) => {
                    if (!transform) setAddingTransform(false);
                    onChange({ transform });
                  }}
                />
              </ResourceBindingField>
              {edge.transform && <TransformTryIt transform={edge.transform} />}
            </Group>
          ) : (
            <Button variant="secondary" onClick={() => setAddingTransform(true)}>
              <Shuffle size={14} aria-hidden="true" /> Add transform
            </Button>
          )}
        </>
      ) : (
        <Group title="Raw" icon={<Braces size={13} />}>
          <RawConfigEditor
            label="Raw edge config"
            value={{
              kind: edge.kind,
              condition: edge.condition ?? null,
              source_port: edge.source_port ?? null,
              target_port: edge.target_port ?? null,
              transform: edge.transform ?? null,
            }}
            onApply={(next) => onChange(next)}
            parse={parseEdgeRawConfig}
            format={formatEdgeRawConfig}
          />
        </Group>
      )}
    </PanelFrame>
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
  return (
    <div style={{ padding: `${spacing[2]}px 0`, borderTop: `1px solid ${border.subtle}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: spacing[2], fontSize: 12, color: text.muted }}>
        <CornerDownRight size={13} aria-hidden="true" />
        <code style={{ fontFamily: fontFamily.mono, color: text.primary }}>{edge.target}</code>
      </div>
      <SegmentedControl aria-label={`Route to ${edge.target}`} value={edge.kind} options={EDGE_KIND_OPTIONS} onChange={(kind) => onChange({ kind })} />
      {edge.kind === "conditional" && (
        <TextInput
          aria-label={`Match text for ${edge.target}`}
          value={edge.condition ?? ""}
          placeholder="Match text, e.g. technical"
          onChange={(event) => onChange({ condition: event.target.value })}
          style={{ marginTop: spacing[2] }}
        />
      )}
      <FieldIssues issues={issues} />
    </div>
  );
}

function GenuiCheckpointPreview({ raw }: { raw: string }) {
  const surfaceValue = tryParseGenuiSurface(raw);
  if (!surfaceValue) return null;
  return (
    <Field label="Live preview">
      <GenuiSurfaceView surface={surfaceValue} />
    </Field>
  );
}
