import type { CSSProperties, ReactNode } from "react";
import { shell, spacing, surface, text, typeScale } from "../theme";
import { Button } from "./ui/Button";

export function ShellDrawer({
  open,
  onClose,
  side,
  title,
  drawerId,
  reducedMotion,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  title: string;
  drawerId: string;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  if (!open) return null;

  const panelStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    bottom: 0,
    [side]: 0,
    width: "min(340px, 92vw)",
    maxWidth: "100%",
    zIndex: shell.zIndex.drawer,
    display: "flex",
    flexDirection: "column",
    background: surface.panel,
    color: text.primary,
    borderLeft: side === "right" ? `1px solid ${surface.border}` : undefined,
    borderRight: side === "left" ? `1px solid ${surface.border}` : undefined,
    boxShadow: shell.shadow.drawer,
    transform: "translateX(0)",
    transition: reducedMotion ? undefined : `transform ${shell.motion.drawerMs}ms ease-in-out`,
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: shell.zIndex.backdrop,
          background: "rgba(0, 0, 0, 0.45)",
          border: "none",
          cursor: "pointer",
        }}
      />
      <aside
        id={drawerId}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={panelStyle}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: spacing[3],
            borderBottom: `1px solid ${surface.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ ...typeScale.small, fontWeight: 600 }}>{title}</div>
          <Button variant="ghost" onClick={onClose} aria-label={`Close ${title}`} style={{ minWidth: shell.touchTarget.min, minHeight: shell.touchTarget.min }}>
            ✕
          </Button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</div>
      </aside>
    </>
  );
}

export function ShellDrawerToggle({
  label,
  active,
  controlsId,
  onClick,
}: {
  label: string;
  active: boolean;
  controlsId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={active}
      aria-controls={controlsId}
      onClick={onClick}
      style={{
        minHeight: shell.touchTarget.min,
        minWidth: shell.touchTarget.min,
        padding: `${spacing[2]}px ${spacing[3]}px`,
        borderRadius: 8,
        border: `1px solid ${active ? surface.borderStrong : surface.border}`,
        background: active ? surface.raised : "transparent",
        color: text.primary,
        cursor: "pointer",
        ...typeScale.caption,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}
