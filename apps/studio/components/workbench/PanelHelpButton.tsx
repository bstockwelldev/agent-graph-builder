"use client";

import { HelpCircle } from "lucide-react";
import { IconButton } from "@/components/graph/ui/IconButton";
import { getArticle } from "@/lib/kb";
import { useOpenHelp } from "./WorkbenchProvider";

/** A panel's "?" (canvas-workbench-ergonomics-plan.md §11): opens its knowledge-base article. Token-styled with the rest of the canvas chrome. */
export function PanelHelpButton({ articleId }: { articleId: string }) {
  const openHelp = useOpenHelp();
  const article = getArticle(articleId);
  if (!openHelp || !article) return null;
  return (
    <IconButton label={`Help: ${article.title}`} icon={<HelpCircle size={16} aria-hidden="true" />} onClick={() => openHelp(articleId)} />
  );
}
