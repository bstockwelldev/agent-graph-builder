"use client";

import { ResourcePage } from "@/components/studio/resource-page";
import { evalSuiteKind } from "@/components/studio/resource-kinds";

export default function EvalSuitesPage() {
  return <ResourcePage kind={evalSuiteKind} />;
}
