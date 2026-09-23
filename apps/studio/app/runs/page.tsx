import { redirect } from "next/navigation";

// Retired (studio-graph-workbench-redesign-plan.md, Wave 2 / STO-603): runs
// live in graph context now -- each graph's Run panel has the full history,
// dataset capture, snapshots, and replay. Old links land on the graph list.
export default function RunsPage() {
  redirect("/graphs");
}
