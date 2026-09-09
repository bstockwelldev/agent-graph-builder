import type { CSSProperties } from "react";
import { accentSurface, color, radius, spacing, surface, text, typeScale } from "../theme";
import { Button } from "./ui/Button";

export function ErrorFallback({
  regionLabel,
  message,
  onRetry,
  onReload,
}: {
  regionLabel: string;
  message?: string;
  onRetry?: () => void;
  onReload?: () => void;
}) {
  return (
    <div style={containerStyle} role="alert">
      <div style={{ ...typeScale.small, fontWeight: 600, marginBottom: spacing[1] }}>{regionLabel} failed to render</div>
      <div style={{ ...typeScale.caption, color: text.muted, marginBottom: spacing[3], lineHeight: "18px" }}>
        {message ?? "Something went wrong in this panel. Your graph data is still in memory."}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: spacing[2] }}>
        {onRetry && (
          <Button variant="primary" onClick={onRetry} style={actionStyle}>
            Retry
          </Button>
        )}
        {onReload && (
          <Button variant="secondary" onClick={onReload} style={actionStyle}>
            Reload app
          </Button>
        )}
      </div>
    </div>
  );
}

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "flex-start",
  height: "100%",
  minHeight: 120,
  padding: spacing[4],
  background: accentSurface.destructive.bg,
  border: `1px solid ${accentSurface.destructive.border}`,
  borderRadius: radius.lg,
  color: accentSurface.destructive.text,
};

const actionStyle: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  borderColor: surface.borderStrong,
  color: text.primary,
};
