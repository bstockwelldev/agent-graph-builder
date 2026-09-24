"use client";

import type { CSSProperties } from "react";
import type { GraphHealth } from "@bstockwelldev/agent-graph-sdk";

import { fontFamily, radius, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { HEALTH_BAND, orderedFactors } from "@/lib/graphHealth";
import { Button } from "./ui/Button";
import { SkeletonBlock } from "./ui/Skeleton";

/**
 * Graph health breakdown (large-graph complexity, Wave 7a / STO-610): the
 * 0-100 score, its band, and every factor with what it cost and why. Items
 * that name a node focus it on the canvas.
 */
export function HealthPanel({
  health,
  loading,
  error,
  onRefresh,
  onFocusNode,
  layout = "rail",
}: {
  health: GraphHealth | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onFocusNode: (nodeId: string) => void;
  layout?: "rail" | "drawer";
}) {
  const band = health ? HEALTH_BAND[health.band] : null;
  return (
    <div style={containerStyle(layout)}>
      <div style={scrollerStyle}>
        {error && (
          <div role="alert" style={{ ...typeScale.caption, color: HEALTH_BAND.at_risk.color, marginBottom: spacing[2] }}>
            {error}
          </div>
        )}
        {!health ? (
          loading ? <SkeletonBlock lines={4} gap={spacing[2]} /> : null
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: spacing[2], marginBottom: spacing[1] }}>
              <span aria-label={`Health score ${health.score} of 100`} style={{ fontSize: 40, lineHeight: "44px", fontWeight: 700, color: band!.color, fontFamily: fontFamily.ui }}>
                {health.score}
              </span>
              <span style={{ ...typeScale.caption, color: text.secondary }}>/ 100</span>
              <span style={{ ...chipStyle, color: band!.color, borderColor: band!.color, marginLeft: "auto" }}>{band!.label}</span>
            </div>
            <div style={{ ...typeScale.caption, color: text.secondary, marginBottom: spacing[3], lineHeight: "16px" }}>
              Starts at 100; each factor subtracts up to its cap. Reflects the canvas as it is now, unsaved edits included.
            </div>
            {orderedFactors(health).map((factor) => (
              <section key={factor.id} aria-label={factor.label} data-testid={`health-factor-${factor.id}`} style={rowStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: spacing[2] }}>
                  <span style={{ ...typeScale.caption, fontWeight: 600, flex: 1 }}>{factor.label}</span>
                  <span style={{ ...typeScale.caption, color: factor.deduction > 0 ? band!.color : text.secondary, fontFamily: fontFamily.mono }}>
                    −{factor.deduction} / {factor.max}
                  </span>
                </div>
                <div aria-hidden="true" style={meterTrack}>
                  <div style={{ ...meterFill, width: `${factor.max ? (factor.deduction / factor.max) * 100 : 0}%`, background: band!.color }} />
                </div>
                {factor.note && <div style={{ ...typeScale.caption, color: text.secondary, marginTop: spacing[1] }}>{factor.note}</div>}
                {factor.items.length > 0 && (
                  <ul style={{ listStyle: "none", margin: `${spacing[1]}px 0 0`, padding: 0 }}>
                    {factor.items.slice(0, 8).map((item, index) => (
                      <li key={`${item.node_id ?? item.edge_id ?? "g"}-${index}`} style={{ marginTop: 2 }}>
                        {item.node_id ? (
                          <button type="button" className="agb-focus-ring agb-hoverable" onClick={() => onFocusNode(item.node_id!)} style={itemButtonStyle}>
                            {item.message}
                          </button>
                        ) : (
                          <span style={{ ...typeScale.caption, color: text.secondary }}>{item.message}</span>
                        )}
                      </li>
                    ))}
                    {factor.items.length > 8 && (
                      <li style={{ ...typeScale.caption, color: text.secondary, marginTop: 2 }}>+{factor.items.length - 8} more</li>
                    )}
                  </ul>
                )}
              </section>
            ))}
            <Button variant="ghost" onClick={onRefresh} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
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
const scrollerStyle: CSSProperties = { padding: shell.panelPadding, flex: 1, minHeight: 0, overflowY: "auto" };
const rowStyle: CSSProperties = { padding: spacing[2], borderRadius: radius.lg, border: `1px solid ${surface.borderStrong}`, background: surface.raised, marginBottom: spacing[2] };
const chipStyle: CSSProperties = { ...typeScale.caption, fontSize: 11, padding: "0 8px", borderRadius: 999, border: "1px solid", whiteSpace: "nowrap" };
const meterTrack: CSSProperties = { height: 4, borderRadius: 2, background: surface.inset, marginTop: spacing[1], overflow: "hidden" };
const meterFill: CSSProperties = { height: "100%", borderRadius: 2 };
const itemButtonStyle: CSSProperties = {
  ...typeScale.caption,
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  padding: "2px 4px",
  borderRadius: radius.md,
  color: text.primary,
  cursor: "pointer",
  lineHeight: "16px",
};
