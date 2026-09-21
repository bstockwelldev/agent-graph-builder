import { color, localType, radius, spacing, surface, text } from "@/lib/graph-theme";

export interface TabDef {
  id: string;
  label: string;
}

/**
 * Phase 10 Slice B (docs/planning/features/studio-shell-ux-gap-analysis.md):
 * the selection dock's Configure/I-O/Policy/Run tab strip. A small, local
 * primitive rather than the shadcn `components/ui/tabs.tsx` used elsewhere
 * in Studio -- this whole inspector renders through the token-based
 * `graph-theme.ts` system, not Tailwind, so it stays consistent with its
 * siblings (Button.tsx, CollapsibleSection.tsx, fields.tsx) instead of
 * mixing two styling systems in one panel.
 */
export function Tabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: TabDef[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: spacing[1],
        marginBottom: spacing[3],
        borderBottom: `1px solid ${surface.border}`,
      }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            style={{
              ...localType.ui,
              padding: `${spacing[2]}px ${spacing[2]}px`,
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${active ? color.primary[600] : "transparent"}`,
              color: active ? text.primary : text.muted,
              cursor: "pointer",
              borderRadius: `${radius.sm}px ${radius.sm}px 0 0`,
              fontWeight: active ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
