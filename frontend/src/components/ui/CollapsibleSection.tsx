import type { CSSProperties, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { usePersistedCollapse } from "../../hooks/usePersistedCollapse";
import { shell, spacing, typeScale } from "../../theme";

type CollapsibleSectionProps = {
  sectionId: string;
  title: ReactNode;
  defaultOpen?: boolean;
  reducedMotion?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  headerActions?: ReactNode;
};

export function CollapsibleSection({
  sectionId,
  title,
  defaultOpen = true,
  reducedMotion = false,
  children,
  style,
  headerActions,
}: CollapsibleSectionProps) {
  const { open, toggle } = usePersistedCollapse(sectionId, defaultOpen);
  const contentId = `section-${sectionId}`;

  return (
    <section style={style}>
      <button
        type="button"
        onClick={toggle}
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
        {headerActions}
      </button>
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

const headerButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[1],
  width: "100%",
  marginBottom: spacing[2],
  padding: 0,
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  textAlign: "left",
};
