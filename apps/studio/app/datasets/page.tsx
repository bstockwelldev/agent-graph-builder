"use client";

import { ResourcePage } from "@/components/studio/resource-page";
import { datasetKind } from "@/components/studio/resource-kinds";

export default function DatasetsPage() {
  return <ResourcePage kind={datasetKind} />;
}
