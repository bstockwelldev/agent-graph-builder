import { describe, expect, it } from "vitest";

import { drawerPanelWidth, inspectorColumnFits, shouldUseInspectorDrawer } from "./shellLayout";
import { shell } from "./theme";

describe("inspectorColumnFits", () => {
  const chrome = shell.rail.library + shell.rail.run + shell.rail.inspector;

  it("keeps the inspector column when canvas would stay at canvasMinWidth", () => {
    expect(inspectorColumnFits(chrome + shell.canvasMinWidth)).toBe(true);
  });

  it("rejects the inspector column when canvas would drop below canvasMinWidth", () => {
    expect(inspectorColumnFits(chrome + shell.canvasMinWidth - 1)).toBe(false);
  });
});

describe("drawerPanelWidth", () => {
  it("uses full viewport width on phone", () => {
    expect(drawerPanelWidth(shell.breakpoint.phone - 1)).toBe("100vw");
  });

  it("caps drawer width on compact and desktop", () => {
    expect(drawerPanelWidth(shell.breakpoint.phone)).toBe("min(340px, 92vw)");
    expect(drawerPanelWidth(1200)).toBe("min(340px, 92vw)");
  });
});

describe("shouldUseInspectorDrawer", () => {
  it("uses the drawer below the wide breakpoint", () => {
    expect(shouldUseInspectorDrawer(shell.breakpoint.wide - 1)).toBe(true);
    expect(shouldUseInspectorDrawer(shell.breakpoint.compact)).toBe(true);
  });

  it("uses the column at the wide breakpoint when rails leave canvasMinWidth", () => {
    expect(shouldUseInspectorDrawer(shell.breakpoint.wide)).toBe(false);
  });

  it("uses the drawer at a wide viewport if rails would starve the canvas", () => {
    const squeezedWide = shell.breakpoint.wide;
    const originalInspector = shell.rail.inspector;
    expect(originalInspector).toBe(300);
    expect(shouldUseInspectorDrawer(squeezedWide)).toBe(false);
    expect(inspectorColumnFits(1279)).toBe(false);
    expect(shouldUseInspectorDrawer(1279)).toBe(true);
  });
});
