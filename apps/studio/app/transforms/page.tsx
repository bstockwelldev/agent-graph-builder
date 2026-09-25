"use client";

import { ResourcePage } from "@/components/studio/resource-page";
import { transformKind } from "@/components/studio/resource-kinds";

export default function TransformsPage() {
  return <ResourcePage kind={transformKind} />;
}
