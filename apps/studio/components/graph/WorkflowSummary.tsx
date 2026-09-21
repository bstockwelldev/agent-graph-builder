import type { Edge, Node } from "@xyflow/react";
import type { Diagnostic, NodeType, RunSummary } from "@bstockwelldev/agent-graph-sdk";
import { accentSurface, color, localType, radius, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import type { GraphNodeData } from "./nodes/GraphNodeView";
import { Button } from "./ui/Button";

function formatRunLabel(run: RunSummary): string {
  const when = run.started_at ? new Date(run.started_at).toLocaleString() : run.run_id;
  return `${run.status} · ${when}`;
}

/**
 * Phase 10 Slice B (docs/planning/features/studio-shell-ux-gap-analysis.md,
 * "Selection dock rebuild"): the "nothing selected" workflow summary per
 * `studio-ux-revision-plan.md` Section 6 -- fills the same dock slot the
 * node/edge inspector occupies once something is selected, so the column
 * always shows something contextual rather than sitting empty by default.
 * "Estimated complexity/cost" from that section is left out — no cost model
 * exists anywhere in this app yet, and inventing one for this panel alone
 * would be a fabricated number, not a summary.
 */
export function WorkflowSummary({
  nodes,
  edges,
  diagnostics,
  runHistory,
  onAddNode,
  onOpenPalette,
  onRunFixture,
  onSelectRun,
}: {
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
  diagnostics: Diagnostic[];
  runHistory: RunSummary[];
  onAddNode: (type: NodeType) => void;
  onOpenPalette: () => void;
  onRunFixture: () => void;
  onSelectRun: (runId: string) => void;
}) {
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;
  const targetIds = new Set(edges.map((edge) => edge.target));
  const sourceIds = new Set(edges.map((edge) => edge.source));
  const entrypoints = nodes.filter((node) => !targetIds.has(node.id));
  const terminals = nodes.filter((node) => !sourceIds.has(node.id));
  const recentRuns = runHistory.slice(0, 3);

  return (
    <div style={{ width: "100%", height: "100%", padding: shell.panelPadding, background: surface.panel, color: text.primary, overflowY: "auto" }}>
      <div style={{ ...typeScale.small, fontWeight: 600, marginBottom: spacing[3] }}>Workflow summary</div>

      <div style={{ display: "flex", gap: spacing[3], marginBottom: spacing[3] }}>
        <SummaryStat label="Nodes" value={nodes.length} />
        <SummaryStat label="Edges" value={edges.length} />
      </div>

      <div style={{ ...localType.label, opacity: 0.6, marginBottom: spacing[2] }}>Validation</div>
      <div style={{ ...typeScale.caption, marginBottom: spacing[3] }}>
        {errorCount === 0 && warningCount === 0 ? (
          <span style={{ color: color.success[500] }}>No issues.</span>
        ) : (
          <>
            {errorCount > 0 && <span style={{ color: accentSurface.destructive.text }}>{errorCount} error{errorCount === 1 ? "" : "s"}</span>}
            {errorCount > 0 && warningCount > 0 && ", "}
            {warningCount > 0 && <span style={{ color: color.warning[500] }}>{warningCount} warning{warningCount === 1 ? "" : "s"}</span>}
          </>
        )}
      </div>

      <div style={{ ...localType.label, opacity: 0.6, marginBottom: spacing[2] }}>Entrypoints</div>
      <div style={{ ...typeScale.caption, opacity: 0.75, marginBottom: spacing[3] }}>
        {entrypoints.length === 0 ? "None -- every node has an incoming edge." : entrypoints.map((n) => n.id).join(", ")}
      </div>

      <div style={{ ...localType.label, opacity: 0.6, marginBottom: spacing[2] }}>Terminal nodes</div>
      <div style={{ ...typeScale.caption, opacity: 0.75, marginBottom: spacing[3] }}>
        {terminals.length === 0 ? "None -- every node has an outgoing edge." : terminals.map((n) => n.id).join(", ")}
      </div>

      <div style={{ ...localType.label, opacity: 0.6, marginBottom: spacing[2] }}>Recent runs</div>
      {recentRuns.length === 0 ? (
        <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[3] }}>No runs yet.</div>
      ) : (
        <div style={{ marginBottom: spacing[3] }}>
          {recentRuns.map((run) => (
            <button
              key={run.run_id}
              type="button"
              onClick={() => onSelectRun(run.run_id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                ...typeScale.caption,
                padding: `${spacing[1]}px 0`,
                background: "transparent",
                border: "none",
                color: text.primary,
                cursor: "pointer",
              }}
            >
              {formatRunLabel(run)}
            </button>
          ))}
        </div>
      )}

      <div style={{ ...localType.label, opacity: 0.6, marginBottom: spacing[2] }}>Quick actions</div>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
        <Button variant="secondary" onClick={() => onAddNode("llm")}>
          Add LLM node
        </Button>
        <Button variant="secondary" onClick={() => onAddNode("router")}>
          Add router
        </Button>
        <Button variant="secondary" onClick={onOpenPalette}>
          Browse node palette
        </Button>
        <Button variant="secondary" onClick={onRunFixture}>
          Run test fixture
        </Button>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        flex: 1,
        padding: spacing[2],
        borderRadius: radius.lg,
        border: `1px solid ${surface.borderStrong}`,
        background: surface.raised,
        textAlign: "center",
      }}
    >
      <div style={{ ...typeScale.subheading, fontWeight: 700 }}>{value}</div>
      <div style={{ ...localType.label, opacity: 0.6 }}>{label}</div>
    </div>
  );
}
