import { redirect } from "next/navigation";

// Retired (studio-graph-workbench-redesign-plan.md, Wave 2 / STO-603): the
// standalone run-history table moved into the graph's own Run panel (run
// history + multi-select dataset capture + snapshots). Old links open the
// graph with that panel and section already showing.
export default async function GraphRunsPage({ params }: { params: Promise<{ graphId: string }> }) {
  const { graphId } = await params;
  redirect(`/graphs/${encodeURIComponent(graphId)}?panel=run&section=observe-history`);
}
