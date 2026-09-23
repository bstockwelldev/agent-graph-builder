import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { usePersistedCollapse } from "@/hooks/usePersistedCollapse";
import { shell, spacing, typeScale } from "@/lib/graph-theme";

type CollapsibleSectionProps = {
  sectionId: string;
  title: ReactNode;
  defaultOpen?: boolean;
  reducedMotion?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  headerActions?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Uncontrolled sections only: each new value force-opens the section
   * and scrolls it into view (e.g. the graph header's Run▾ menu jumping to
   * "Run with fixture" -- studio-graph-workbench-redesign-plan.md, Slice 2). */
  revealNonce?: number;
};

export function CollapsibleSection({
  sectionId,
  title,
  defaultOpen = true,
  reducedMotion = false,
  children,
  style,
  headerActions,
  open: openProp,
  onOpenChange,
  revealNonce,
}: CollapsibleSectionProps) {
  const isControlled = openProp !== undefined;
  const persisted = usePersistedCollapse(sectionId, defaultOpen, !isControlled);
  const open = isControlled ? openProp : persisted.open;
  const contentId = `section-${sectionId}`;
  const sectionRef = useRef<HTMLElement>(null);
  const { setOpen } = persisted;

  useEffect(() => {
    if (revealNonce === undefined) return;
    if (!isControlled) setOpen(true);
    // Deferred past the open/expand render (and any sibling sections
    // collapsing), otherwise the scroll targets a pre-layout position.
    const timer = window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per nonce
  }, [revealNonce]);

  const handleToggle = () => {
    if (isControlled) {
      onOpenChange?.(!open);
      return;
    }
    persisted.toggle();
  };

  return (
    <section ref={sectionRef} style={style}>
      <div style={headerRowStyle}>
        <button
          type="button"
          className="agb-collapse-header"
          onClick={handleToggle}
          aria-expanded={open}
          aria-controls={contentId}
          style={headerButtonStyle}
        >
          <ChevronDown
            size={16}
            strokeWidth={2}
            aria-hidden="true"
            style={{
              flexShrink: 0,
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
              transition: reducedMotion ? "none" : `transform ${shell.motion.drawerMs}ms ease`,
            }}
          />
          <span style={{ ...typeScale.small, fontWeight: 600, flex: 1, textAlign: "left" }}>{title}</span>
        </button>
        {headerActions ? <div style={headerActionsStyle}>{headerActions}</div> : null}
      </div>
      <div
        id={contentId}
        hidden={!open}
        style={{
          overflow: open ? undefined : "hidden",
        }}
      >
        {children}
      </div>
    </section>
  );
}

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[1],
  width: "100%",
  minHeight: shell.touchTarget.min,
  marginBottom: spacing[2],
};

const headerButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[1],
  flex: 1,
  minWidth: 0,
  minHeight: shell.touchTarget.min,
  margin: 0,
  padding: `${spacing[1]}px 0`,
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  textAlign: "left",
};

const headerActionsStyle: CSSProperties = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
};
