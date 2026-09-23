import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { radius, shadow, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";

type TaxonomyTooltipLayout = "block" | "inline" | "corner";

const TOOLTIP_WIDTH = 260;
const VIEWPORT_MARGIN = spacing[2];

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
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const tooltipId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipHeight = tooltip?.offsetHeight ?? 120;
    const gap = spacing[1];

    let top = 0;
    let left = 0;

    if (layout === "corner") {
      left = triggerRect.right + gap;
      top = triggerRect.top;
      if (left + TOOLTIP_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
        left = triggerRect.left - TOOLTIP_WIDTH - gap;
      }
    } else {
      left = triggerRect.left;
      top = triggerRect.bottom + gap;
      if (top + tooltipHeight > window.innerHeight - VIEWPORT_MARGIN) {
        top = triggerRect.top - tooltipHeight - gap;
      }
      if (left + TOOLTIP_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
        left = window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN;
      }
    }

    top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - tooltipHeight - VIEWPORT_MARGIN));
    left = Math.max(VIEWPORT_MARGIN, left);

    setPosition({ top, left });
  }, [layout]);

  const show = useCallback(() => {
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
    setPosition(null);
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    updatePosition();
  }, [visible, updatePosition]);

  useEffect(() => {
    if (!visible) return;

    const onReposition = () => updatePosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [visible, updatePosition]);

  useEffect(() => {
    if (!visible) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        hide();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible, hide]);

  const rootStyle = layoutStyles[layout];

  return (
    <div ref={rootRef} style={rootStyle}>
      {layout === "block" ? <div style={{ flex: 1, minWidth: 0 }}>{children}</div> : children}
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Help: ${title}`}
        aria-describedby={visible ? tooltipId : undefined}
        title={summary}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) {
            show();
          }
        }}
        onBlur={hide}
        className="agb-focus-ring agb-hoverable"
        style={layout === "corner" ? cornerHelpButtonStyle : helpButtonStyle}
      >
        <Info size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            style={{
              ...tooltipStyle,
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              visibility: position ? "visible" : "hidden",
            }}
          >
            <div style={{ ...typeScale.small, fontWeight: 600, marginBottom: spacing[1] }}>{title}</div>
            <div style={{ ...typeScale.caption, color: text.muted, lineHeight: "18px" }}>{details}</div>
          </div>,
          document.body,
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

// Wave 2.5 ("Inspector & Run console v2"): a compact inline hint glyph,
// not a 44px bordered button -- the old size made these help triggers the
// loudest thing in every inspector/run field row (10 of them across the two
// panels). The hit area stays generous via padding, the visual is 14px.
const helpButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  padding: 0,
  borderRadius: 999,
  border: "none",
  background: "transparent",
  color: text.secondary,
  cursor: "help",
  flexShrink: 0,
};

const cornerHelpButtonStyle: CSSProperties = {
  ...helpButtonStyle,
  position: "absolute",
  top: spacing[1],
  right: spacing[1],
  zIndex: 1,
};

const tooltipStyle: CSSProperties = {
  position: "fixed",
  zIndex: shell.zIndex.tooltip,
  width: TOOLTIP_WIDTH,
  padding: spacing[3],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.panel,
  color: text.primary,
  boxShadow: shadow[4],
  pointerEvents: "none",
};
