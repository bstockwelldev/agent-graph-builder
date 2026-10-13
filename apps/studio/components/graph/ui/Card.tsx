import type { CSSProperties, ReactNode } from "react";
import { border, localType, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";

/**
 * A grouped block inside a panel, in the canvas's tokens: the raised card
 * surface (`surface.card`, lighter than the panel it sits on) with the subtle
 * border. Replaces the shadcn Card the CRUD pages used.
 *
 * `title` renders as an `h3` so the block is a landmark for screen readers and
 * `aria-labelledby` ties the section to it.
 */
export function Card({
  title,
  description,
  actions,
  children,
  style,
  id,
  titleId,
  "aria-label": ariaLabel,
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** Trailing controls in the header row (a filter, a button). */
  actions?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
  /** An anchor target (`#id`). */
  id?: string;
  /** Names the title element, so the section is labelled by it. */
  titleId?: string;
  "aria-label"?: string;
}) {
  return (
    <section
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={titleId}
      style={{
        padding: spacing[3],
        borderRadius: radius.lg,
        border: `1px solid ${border.subtle}`,
        background: surface.card,
        color: text.primary,
        ...style,
      }}
    >
      {title || actions ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: spacing[2], marginBottom: children || description ? spacing[2] : 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {title ? (
              <h3 id={titleId} style={{ margin: 0, ...typeScale.small, fontWeight: 600 }}>
                {title}
              </h3>
            ) : null}
            {description ? <p style={{ margin: "2px 0 0", ...typeScale.caption, color: text.secondary }}>{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A small uppercase caption + value, for a headline number on a Card. */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card>
      <div style={{ ...localType.label, color: text.secondary, textTransform: "uppercase" }}>{label}</div>
      <p style={{ margin: `${spacing[1]}px 0 0`, fontSize: 18, lineHeight: "24px", fontWeight: 600 }}>{value}</p>
    </Card>
  );
}
