import type { Locator, Page } from "@playwright/test";

import { expect, openGraph, test, waitForCanvasToSettle } from "../fixtures";

// canvas-workbench-ergonomics-plan.md, slice B: at laptop widths, with the
// node palette and the inspector open, the header's controls overlapped and
// the bottom overlays collided. The header now follows the canvas column's
// width, the inspector floats once docking it would leave the canvas under
// 480px, and the minimap is sized by the pane.

type Box = { x: number; y: number; width: number; height: number };

function intersects(a: Box, b: Box): boolean {
  // Touching edges (a shared border) is fine; overlapping area is not.
  return (
    a.x < b.x + b.width - 1 &&
    b.x < a.x + a.width - 1 &&
    a.y < b.y + b.height - 1 &&
    b.y < a.y + a.height - 1
  );
}

/** One atomic snapshot of the visible elements' boxes (a re-render between reads can't mix two layouts). */
function visibleBoxes(locator: Locator): Promise<{ name: string; box: Box }[]> {
  return locator.evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        style.visibility === "hidden" ||
        style.display === "none"
      )
        return [];
      const name =
        element.getAttribute("aria-label") ?? element.textContent ?? "?";
      return [
        {
          name: name.trim(),
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        },
      ];
    }),
  );
}

function overlaps(items: { name: string; box: Box }[]): string[] {
  const found: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (intersects(items[i].box, items[j].box))
        found.push(`${items[i].name} × ${items[j].name}`);
    }
  }
  return found;
}

async function openPalette(page: Page) {
  const addNode = page
    .getByRole("toolbar", { name: "Graph" })
    .getByRole("button", { name: "Add node" });
  if (await addNode.isVisible()) {
    await addNode.click();
  } else {
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitemcheckbox", { name: /Add node/ }).click();
  }
}

const WIDTHS = [1180, 1256, 1440, 1920];
const COMBOS = [
  { palette: false, inspector: false },
  { palette: true, inspector: false },
  { palette: false, inspector: true },
  { palette: true, inspector: true },
];

for (const width of WIDTHS) {
  test(`header, canvas and overlays fit at ${width}px`, async ({
    page,
    api,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const graph = await api.createDemoGraph(
      `E2E layout ${width} ${Date.now()}`,
    );
    await openGraph(page, graph);

    for (const combo of COMBOS) {
      const label = `${width}px, palette ${combo.palette ? "open" : "closed"}, inspector ${combo.inspector ? "open" : "closed"}`;
      if (combo.inspector)
        await page.locator('.react-flow__node[data-id="llm_classify"]').click();
      if (combo.palette) await openPalette(page);
      await waitForCanvasToSettle(page);

      const header = page.getByRole("toolbar", { name: "Graph" });
      await expect
        .poll(
          async () =>
            overlaps(
              await visibleBoxes(
                header.locator("button, input, [role=status]"),
              ),
            ),
          {
            message: `header controls overlap (${label})`,
          },
        )
        .toEqual([]);

      const column = (await page
        .locator("[data-canvas-column]")
        .boundingBox())!;
      expect(
        column.width,
        `canvas column width (${label})`,
      ).toBeGreaterThanOrEqual(480);

      // The status bar sits under the pane, so it clears the bottom overlays.
      const bottom = page.locator(
        ".react-flow__controls, .react-flow__minimap, [aria-label='Show minimap'], [role=group][aria-label='Canvas status']",
      );
      await expect
        .poll(async () => overlaps(await visibleBoxes(bottom)), {
          message: `bottom overlays overlap (${label})`,
        })
        .toEqual([]);

      // Undo this combination: close the palette, then deselect.
      if (combo.palette) await openPalette(page);
      if (combo.inspector)
        await page
          .locator(".react-flow__pane")
          .click({ position: { x: 10, y: 400 } });
      await expect(page.locator("[data-inspector-mode]")).toHaveCount(0);
    }
  });
}

test("the minimap shrinks with the pane and collapses to a Map button", async ({
  page,
  api,
}) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  const graph = await api.createDemoGraph(`E2E minimap ${Date.now()}`);
  await openGraph(page, graph);
  await expect
    .poll(
      async () =>
        (await page.locator(".react-flow__minimap").boundingBox())?.width,
    )
    .toBe(200);

  await page.setViewportSize({ width: 1180, height: 800 });
  await page.locator('.react-flow__node[data-id="llm_classify"]').click();
  // 1180 − the 384px inspector leaves a 796px pane.
  await expect
    .poll(
      async () =>
        (await page.locator(".react-flow__minimap").boundingBox())?.width,
    )
    .toBe(160);

  // The docked palette takes it to 508px: the minimap folds into a button.
  await openPalette(page);
  await expect(page.locator("[data-inspector-mode]")).toHaveAttribute(
    "data-inspector-mode",
    "docked",
  );
  await expect(page.locator(".react-flow__minimap")).toHaveCount(0);
  await page.getByRole("button", { name: "Show minimap" }).click();
  await expect(page.locator(".react-flow__minimap")).toBeVisible();

  // Docking both at 1120px would leave the canvas 448px: the inspector floats instead.
  await page.setViewportSize({ width: 1120, height: 800 });
  await expect(page.locator("[data-inspector-mode]")).toHaveAttribute(
    "data-inspector-mode",
    "overlay",
  );
  expect(
    (await page.locator("[data-canvas-column]").boundingBox())!.width,
  ).toBeGreaterThanOrEqual(480);
});

test("the status bar holds the structure, snapping, zoom and edge kinds", async ({
  page,
  api,
}) => {
  const graph = await api.createDemoGraph(`E2E status bar ${Date.now()}`);
  await openGraph(page, graph);
  const bar = page.getByRole("group", { name: "Canvas status" });
  await expect(bar.getByText("8 nodes · 8 edges")).toBeVisible();
  await expect(
    bar.getByRole("button", { name: /^Zoom \d+%\. Fit view$/ }),
  ).toBeVisible();

  await bar.getByRole("button", { name: "Edge kinds" }).click();
  await expect(page.getByRole("note", { name: "Edge kinds" })).toContainText(
    "Match text",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("note", { name: "Edge kinds" })).toHaveCount(0);

  const snap = bar.getByRole("button", { name: "Snap" });
  await expect(snap).toHaveAttribute("aria-pressed", "true");
  await snap.click();
  await expect(snap).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(
    page
      .getByRole("group", { name: "Canvas status" })
      .getByRole("button", { name: "Snap" }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("focus mode: widen the neighborhood from the status bar, and Escape leaves it", async ({
  page,
  api,
}) => {
  const graph = await api.createDemoGraph(`E2E focus hops ${Date.now()}`);
  await openGraph(page, graph);
  const opacity = (id: string) =>
    page
      .locator(`.react-flow__node[data-id="${id}"] [data-status]`)
      .evaluate((el) => getComputedStyle(el).opacity);

  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await page.locator('.react-flow__node[data-id="llm_classify"]').click();
  await expect.poll(() => opacity("input_1")).toBe("0.35");

  const focus = page.getByRole("group", { name: "Focus mode" });
  await focus
    .getByRole("button", { name: "2 hops around the selection" })
    .click();
  // Two hops from llm_classify reach input_1 and router_1's branches.
  await expect.poll(() => opacity("input_1")).toBe("1");
  await expect.poll(() => opacity("tool_lookup")).toBe("1");
  await expect.poll(() => opacity("output_1")).toBe("0.35");
  await expect(
    focus.getByRole("button", { name: "Fit to focus" }),
  ).toBeEnabled();

  await page
    .locator(".react-flow__pane")
    .click({ position: { x: 10, y: 400 } });
  await page.keyboard.press("Escape");
  await expect(focus).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Focus mode", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});
