import { expect, openGraph, test, type GraphJson } from "../fixtures";

// Slice 1 (resource-forms-consistency-plan.md): a run paused at a
// human_gate is approved or rejected from the Run panel, and the
// checkpoint's GenUI form values reach downstream nodes.
const SURFACE = {
  root: {
    type: "Stack",
    children: [
      { type: "Text", props: { content: "Confirm the lookup before answering." } },
      { type: "FormField", id: "amount", props: { label: "Budget", inputType: "number" } },
      { type: "Button", id: "escalate", props: { label: "Escalate", actionId: "escalate" } },
    ],
  },
};

/** The demo with a checkpoint after the lookup: tool_lookup -> gate_review -> prompt_after -> output. */
function withGate(graph: GraphJson): GraphJson {
  const position = { x: 900, y: 0 };
  return {
    ...graph,
    nodes: [
      ...graph.nodes,
      { id: "gate_review", type: "human_gate", position, config: { content: "Review the lookup result.", genuiCheckpointSurfaceJson: JSON.stringify(SURFACE) } },
      { id: "prompt_after", type: "prompt", position: { x: 1100, y: 0 }, config: { template: "Budget {gate_review[amount]} ({gate_review[action]}): {upstream}" } },
    ],
    edges: [
      ...graph.edges.filter((edge) => !(edge.source === "tool_lookup" && edge.target === "output_1")),
      { id: "e_lookup_gate", source: "tool_lookup", target: "gate_review" },
      { id: "e_gate_prompt", source: "gate_review", target: "prompt_after" },
      { id: "e_prompt_output", source: "prompt_after", target: "output_1" },
    ],
  };
}

async function runToCheckpoint(page: import("@playwright/test").Page, graph: GraphJson) {
  await openGraph(page, graph, "?panel=run");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const checkpoint = page.getByRole("region", { name: /^Approval needed at / });
  await expect(checkpoint).toBeVisible();
  await expect(checkpoint).toContainText("Review the lookup result.");
  await expect(checkpoint).toContainText("Confirm the lookup before answering.");
  return checkpoint;
}

test("approves a paused run with form values that reach the next node", async ({ page, api }) => {
  const graph = withGate(await api.createDemoGraph("E2E approval"));
  await api.updateGraph(graph);
  const checkpoint = await runToCheckpoint(page, graph);

  await checkpoint.getByLabel("Budget").fill("250");
  // A surface button approves and records its actionId.
  await checkpoint.getByRole("button", { name: "Escalate" }).click();

  const status = page.getByRole("tabpanel", { name: "Status" });
  await expect(status).toContainText(/Budget 250 \(escalate\): A database index is a data structure/);
  await expect(checkpoint).toBeHidden();
  const runId = new URL(page.url()).searchParams.get("run")!;
  expect((await api.getRun(runId)).status).toBe("succeeded");
});

test("rejects a paused run with a reason", async ({ page, api }) => {
  const graph = withGate(await api.createDemoGraph("E2E rejection"));
  await api.updateGraph(graph);
  const checkpoint = await runToCheckpoint(page, graph);

  await checkpoint.getByLabel("Reason").fill("Lookup looks wrong");
  await checkpoint.getByRole("button", { name: "Reject" }).click();

  await expect(page.getByRole("tabpanel", { name: "Status" }).getByRole("alert")).toHaveText("Lookup looks wrong");
  await expect(checkpoint).toBeHidden();
  const runId = new URL(page.url()).searchParams.get("run")!;
  expect(await api.getRun(runId)).toMatchObject({ status: "failed", error: "Lookup looks wrong" });
});
