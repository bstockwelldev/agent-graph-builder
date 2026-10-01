"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getArticle } from "@/lib/kb";
import { useOpenHelp } from "./WorkbenchProvider";

/** A panel's "?" (canvas-workbench-ergonomics-plan.md §11): opens its knowledge-base article. shadcn-styled, for workbench chrome. */
export function PanelHelpButton({ articleId }: { articleId: string }) {
  const openHelp = useOpenHelp();
  const article = getArticle(articleId);
  if (!openHelp || !article) return null;
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Help: ${article.title}`} title={`Help: ${article.title}`} onClick={() => openHelp(articleId)}>
      <HelpCircle className="size-4" />
    </Button>
  );
}
