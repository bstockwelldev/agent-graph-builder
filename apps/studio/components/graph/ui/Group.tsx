import type { ReactNode } from "react";
import { border, radius, spacing, surface, text } from "@/lib/graph-theme";

/**
 * A card that groups related fields under a small uppercase caption
 * (Wave 2.5). Groups are what give the inspector/run console a readable
 * rhythm instead of one long undifferentiated column of controls.
 */
export function Group({
  title,
  icon,
  action,
  children,
  flush = false,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** No inner padding (for lists that draw their own row padding). */
  flush?: boolean;
}) {
  return (
    <section
      style={{
        marginBottom: spacing[3],
        borderRadius: radius.xl,
        border: `1px solid ${border.subtle}`,
        background: surface.card,
        padding: flush ? 0 : spacing[3],
      }}
    >
      {(title || action) && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: spacing[2],
            padding: flush ? `${spacing[2]}px ${spacing[3]}px 0` : 0,
            minHeight: 20,
          }}
        >
          {icon && <span style={{ display: "inline-flex", color: text.secondary }} aria-hidden="true">{icon}</span>}
          {title && (
            <h3 style={{ margin: 0, fontSize: 11, lineHeight: "16px", fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: text.secondary }}>
              {title}
            </h3>
          )}
          {action && <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
