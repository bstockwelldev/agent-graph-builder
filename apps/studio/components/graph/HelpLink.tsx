"use client";

import { BookOpen } from "lucide-react";
import { useOpenHelp } from "@/components/workbench/WorkbenchProvider";
import { getArticle } from "@/lib/kb";
import { color } from "@/lib/graph-theme";

/**
 * Opens a knowledge-base article in the Help panel (canvas-workbench-
 * ergonomics-plan.md §11). Renders nothing outside a workbench (standalone
 * tests) or for an unknown article.
 */
export function HelpLink({ articleId, children }: { articleId: string; children?: string }) {
  const openHelp = useOpenHelp();
  const article = getArticle(articleId);
  if (!openHelp || !article) return null;
  const label = children ?? `Help: ${article.title}`;
  return (
    <button
      type="button"
      className="agb-focus-ring"
      onClick={() => openHelp(articleId)}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 0, border: "none", background: "transparent", color: color.primary[500], cursor: "pointer", fontSize: 12 }}
    >
      <BookOpen size={12} aria-hidden="true" />
      {label}
    </button>
  );
}
