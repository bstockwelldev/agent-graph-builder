import { API_URL, expect, openGraph, runOnStub, test } from "../fixtures";

test("publishes a release, diffs it against an edited draft, and runs the pinned release", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph("E2E releases");
  await openGraph(page, graph);

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Releases" }).click();
  await page.getByPlaceholder("What changed in this release?").fill("First release");
  await page.getByPlaceholder("Your name").fill("E2E");
  await page.getByRole("button", { name: "Publish release" }).click();
  await expect(page.getByText(/^Published rel_/)).toBeVisible();

  const summaries: { release_id: string }[] = await (await request.get(`${API_URL}/api/graphs/${graph.id}/releases`)).json();
  expect(summaries).toHaveLength(1);
  const release: { id: string } = await (
    await request.get(`${API_URL}/api/graphs/${graph.id}/releases/${summaries[0].release_id}`)
  ).json();
  expect(release).toMatchObject({ release_notes: "First release", author: "E2E" });

  // Edit the draft behind the release's back.
  const draft = await api.getGraph(graph.id);
  draft.nodes.find((node) => node.id === "prompt_answer")!.config = { template: "Answer briefly: {question}" };
  await api.updateGraph(draft);

  await page.reload(); // ?panel=releases keeps the panel open
  await page.getByRole("button", { name: /^rel_/ }).click();
  await page.getByRole("button", { name: "Diff vs draft" }).click();
  await expect(page.getByText("prompt_answer").last()).toBeVisible();
  await expect(page.getByText("MODIFIED")).toBeVisible();
  await expect(page.getByText(/^config: .*→.*Answer briefly: \{question\}/)).toBeVisible();

  // The release still runs what was published; the draft runs the edit.
  const releaseRun = await (
    await request.post(`${API_URL}/api/graph-releases/${release.id}/runs`, {
      data: { input: { question: "How does a database index work?" }, provider: "stub" },
    })
  ).json();
  await expect.poll(async () => (await api.getRun(releaseRun.run_id)).status).toBe("succeeded");
  const pinned = await (await request.get(`${API_URL}/api/runs/${releaseRun.run_id}`)).json();
  expect(pinned).toMatchObject({ graph_release_id: release.id, source: "release" });

  // graph_fingerprint is the semantic fingerprint of the graph that actually ran.
  const draftRun = await (await request.get(`${API_URL}/api/runs/${await runOnStub(page, draft)}`)).json();
  expect(draftRun.graph_release_id ?? null).toBeNull();
  expect(draftRun.graph_fingerprint).toBeTruthy();
  expect(draftRun.graph_fingerprint).not.toBe(pinned.graph_fingerprint);
});
