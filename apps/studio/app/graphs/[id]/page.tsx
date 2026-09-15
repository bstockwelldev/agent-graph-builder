"use client";

import { use } from "react";

import { GraphEditor } from "@/components/graph/GraphEditor";

export default function GraphDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <GraphEditor graphId={id} />;
}
