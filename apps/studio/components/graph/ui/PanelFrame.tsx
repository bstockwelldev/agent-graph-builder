"use client";

import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { useOpenHelp } from "@/components/workbench/WorkbenchProvider";
import { getArticle } from "@/lib/kb";
import { border, spacing, surface, text } from "@/lib/graph-theme";
import { IconButton } from "./IconButton";

/**
 * Shared frame for the right-side panels (Wave 2.5: node inspector, run
 * console). Solid surface; a sticky header with an identity slot and
 * actions; an optional sticky tab row; a scrolling body; an optional sticky
 * footer for the panel's primary action. Replaces each panel hand-rolling
 * its own padding and header.
 */
export function PanelFrame({
  header,
  tabs,
  footer,
  children,
  "aria-label": ariaLabel,
}: {
  header: ReactNode;
  tabs?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <section
      aria-label={ariaLabel}
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: surface.panel, color: text.primary }}
    >
      <div style={{ flexShrink: 0, borderBottom: tabs ? "none" : `1px solid ${border.subtle}`, background: surface.panel }}>
        <div style={{ padding: `${spacing[3]}px ${spacing[3]}px ${tabs ? spacing[2] : spacing[3]}px` }}>{header}</div>
        {tabs && <div style={{ padding: `0 ${spacing[2]}px` }}>{tabs}</div>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: spacing[3] }}>{children}</div>
      {footer && (
        <div style={{ flexShrink: 0, padding: `${spacing[2]}px ${spacing[3]}px`, borderTop: `1px solid ${border.subtle}`, background: surface.panel }}>
          {footer}
        </div>
      )}
    </section>
  );
}

/** Standard header layout: leading icon chip, title/subtitle, trailing actions. */
export function PanelHeader({
  icon,
  title,
  subtitle,
  actions,
  helpArticleId,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Adds a help button that opens this knowledge-base article (canvas-workbench-ergonomics-plan.md §11). */
  helpArticleId?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, lineHeight: "22px", fontWeight: 650, minWidth: 0 }}>{title}</div>
        {subtitle && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2, fontSize: 12, lineHeight: "16px", color: text.secondary }}>
            {subtitle}
          </div>
        )}
      </div>
      {(actions || helpArticleId) && (
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          {helpArticleId && <PanelHelpButton articleId={helpArticleId} />}
          {actions}
        </div>
      )}
    </div>
  );
}

function PanelHelpButton({ articleId }: { articleId: string }) {
  const openHelp = useOpenHelp();
  const article = getArticle(articleId);
  if (!openHelp || !article) return null;
  return <IconButton label={`Help: ${article.title}`} icon={<HelpCircle size={15} />} onClick={() => openHelp(articleId)} tooltipPlacement="bottom" />;
}
