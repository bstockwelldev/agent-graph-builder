import { shell } from "./theme";

export function inspectorColumnFits(viewportWidth: number): boolean {
  const chrome = shell.rail.library + shell.rail.run + shell.rail.inspector;
  return viewportWidth - chrome >= shell.canvasMinWidth;
}

/** Inspector is a drawer unless the viewport is wide and the canvas would stay ≥ canvasMinWidth. */
export function shouldUseInspectorDrawer(viewportWidth: number): boolean {
  if (viewportWidth < shell.breakpoint.wide) {
    return true;
  }
  return !inspectorColumnFits(viewportWidth);
}
