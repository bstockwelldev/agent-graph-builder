import type { CSSProperties, ReactNode } from "react";
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
}: CollapsibleSectionProps) {
  const isControlled = openProp !== undefined;
  const persisted = usePersistedCollapse(sectionId, defaultOpen, !isControlled);
  const open = isControlled ? openProp : persisted.open;
  const contentId = `section-${sectionId}`;

  const handleToggle = () => {
    if (isControlled) {
      onOpenChange?.(!open);
      return;
    }
    persisted.toggle();
  };

  return (
    <section style={style}>
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
