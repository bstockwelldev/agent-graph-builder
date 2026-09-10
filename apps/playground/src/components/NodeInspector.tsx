import type { CSSProperties, ReactNode } from "react";
import { EDGE_KIND_TAXONOMY, ROUTER_RULES_TAXONOMY } from "../content/taxonomy";
import type { ChatProvider, EdgeKind, GraphEdge, GraphNode, Diagnostic } from "../types";
import { accentSurface, color, fontFamily, localType, radius, shell, spacing, surface, text, typeScale } from "../theme";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { TaxonomyTooltip } from "./Tooltip";
import { Button } from "./ui/Button";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { Select, TextArea, TextInput } from "./ui/fields";

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

export function NodeInspector({
  node,
  graphId = null,
  issues = [],
  outgoingEdges = [],
  onConfigChange,
  onEdgeChange,
  onDelete,
  fullWidth = false,
  reducedMotion = false,
}: {
  node: GraphNode;
  graphId?: string | null;
  issues?: Diagnostic[];
  outgoingEdges?: GraphEdge[];
  onConfigChange: (config: Record<string, unknown>) => void;
  onEdgeChange?: (edgeId: string, patch: Partial<GraphEdge>) => void;
  onDelete: () => void;
  fullWidth?: boolean;
  reducedMotion?: boolean;
}) {
  const set = (key: string, value: unknown) => onConfigChange({ ...node.config, [key]: value });

  return (
    <div style={panelStyle(fullWidth)}>
      <CollapsibleSection sectionId={`inspector-node-${node.type}`} title={`Configure: ${node.type}`} reducedMotion={reducedMotion}>
      <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[3] - 2 }}>{node.id}</div>
      <IssueList issues={issues} />

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

      <Button variant="destructive" style={{ marginTop: spacing[2], minHeight: 44 }} onClick={onDelete}>
        Delete node
      </Button>
      </CollapsibleSection>
    </div>
  );
}

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
          <option value="sequence">sequence</option>
          <option value="conditional">conditional</option>
          <option value="default">default</option>
        </Select>
      </Field>

      {edge.kind === "conditional" && (
        <Field label="Condition (substring match against upstream router input)">
          <TextInput value={edge.condition ?? ""} onChange={(e) => onChange({ condition: e.target.value })} />
        </Field>
      )}

      <Button variant="destructive" style={{ marginTop: spacing[2], minHeight: 44 }} onClick={onDelete}>
        Delete edge
      </Button>
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
          <option value="sequence">sequence</option>
          <option value="conditional">conditional</option>
          <option value="default">default</option>
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
