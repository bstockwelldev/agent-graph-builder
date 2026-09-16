// Ported from micro-ui-agent-builder's packages/shared/src/schemas.ts
// (genuiNodeSchema/GenuiNode/GenuiSurface) — plain TS types here rather than
// a Zod schema, since there's no backend GenUI endpoint to validate against
// yet. AGB's `human_gate` node's `genuiCheckpointSurfaceJson` config field is
// the only place a surface currently lives (Phase 4d).
export type GenuiNode =
  | {
      type: "Stack";
      id?: string;
      props?: { gap?: number; direction?: "col" | "row" };
      children: GenuiNode[];
    }
  | { type: "Text"; id?: string; props: { content: string } }
  | {
      type: "Button";
      id: string;
      props: { label: string; actionId?: string };
    }
  | {
      type: "Card";
      id?: string;
      props?: { title?: string };
      children?: GenuiNode[];
    }
  | {
      type: "FormField";
      id: string;
      props: { label: string; inputType?: "text" | "number" };
    };

export type GenuiSurface = { root: GenuiNode };

/** Returns null instead of throwing — used for live-preview-while-typing. */
export function tryParseGenuiSurface(raw: string): GenuiSurface | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "root" in parsed &&
      (parsed as { root?: unknown }).root &&
      typeof (parsed as { root: { type?: unknown } }).root.type === "string"
    ) {
      return parsed as GenuiSurface;
    }
    return null;
  } catch {
    return null;
  }
}
