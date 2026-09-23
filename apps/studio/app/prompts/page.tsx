"use client";

import { ResourcePage } from "@/components/studio/resource-page";
import { promptKind } from "@/components/studio/resource-kinds";

// Config-driven (studio-graph-workbench-redesign-plan.md, Wave 4b): the page
// shell, card list, editor and delete flow live in ResourcePage; this
// registry's copy, card content and fields live in resource-kinds.tsx.
export default function PromptsPage() {
  return <ResourcePage kind={promptKind} />;
}
