import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { color, radius, shadow, shell, spacing, surface, text, typeScale } from "../theme";

type TaxonomyTooltipLayout = "block" | "inline" | "corner";

export function TaxonomyTooltip({
  title,
  summary,
  details,
  children,
  layout = "block",
}: {
  title: string;
  summary: string;
  details: string;
  children: ReactNode;
  layout?: TaxonomyTooltipLayout;
}) {
  const [open, setOpen] = useState(false);
  const cardId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const rootStyle = layoutStyles[layout];

  return (
    <div ref={rootRef} style={rootStyle}>
      {layout === "block" ? <div style={{ flex: 1, minWidth: 0 }}>{children}</div> : children}
      <button
        type="button"
        aria-label={`Help: ${title}`}
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        title={summary}
        onClick={() => setOpen((value) => !value)}
        style={layout === "corner" ? cornerHelpButtonStyle : helpButtonStyle}
      >
        ?
      </button>
      {open && (
        <div
          id={cardId}
          role="dialog"
          aria-labelledby={`${cardId}-title`}
          style={cardStyle}
        >
          <div id={`${cardId}-title`} style={{ ...typeScale.small, fontWeight: 600, marginBottom: spacing[1] }}>
            {title}
          </div>
          <div style={{ ...typeScale.caption, color: text.muted, lineHeight: "18px" }}>{details}</div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              ...typeScale.caption,
              marginTop: spacing[2],
              color: color.primary[500],
              background: "none",
              border: "none",
              cursor: "pointer",
              minHeight: shell.touchTarget.min,
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

const layoutStyles: Record<TaxonomyTooltipLayout, CSSProperties> = {
  block: {
    position: "relative",
    display: "flex",
    width: "100%",
    alignItems: "flex-start",
    gap: spacing[1],
  },
  inline: {
    position: "relative",
    display: "inline-flex",
    width: "auto",
    alignItems: "center",
    gap: spacing[1],
    flexWrap: "nowrap",
  },
  corner: {
    position: "relative",
    display: "block",
    width: "100%",
  },
};

const helpButtonStyle: CSSProperties = {
  minWidth: shell.touchTarget.min,
  minHeight: shell.touchTarget.min,
  width: shell.touchTarget.min,
  height: shell.touchTarget.min,
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  color: text.primary,
  cursor: "pointer",
  ...typeScale.caption,
  fontWeight: 700,
  flexShrink: 0,
};

const cornerHelpButtonStyle: CSSProperties = {
  ...helpButtonStyle,
  position: "absolute",
  top: spacing[1],
  right: spacing[1],
  zIndex: 1,
};

const cardStyle: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: spacing[1],
  zIndex: shell.zIndex.tooltip,
  width: 260,
  padding: spacing[3],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.panel,
  color: text.primary,
  boxShadow: shadow[4],
};
