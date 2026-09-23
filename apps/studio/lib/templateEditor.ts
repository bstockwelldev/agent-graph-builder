/**
 * Pure helpers behind components/graph/ui/TemplateEditor.tsx
 * (studio-graph-workbench-redesign-plan.md, Wave 2.5).
 */
export type TemplateSegment = { text: string; kind: "text" | "known" | "unknown" };

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Splits a template into plain text and `{variable}` tokens, marking each
 * token known/unknown against `known` so the editor can colour them. */
export function templateSegments(template: string, known: readonly string[]): TemplateSegment[] {
  const knownSet = new Set(known);
  const segments: TemplateSegment[] = [];
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: template.slice(last, index), kind: "text" });
    segments.push({ text: match[0], kind: knownSet.has(match[1]) ? "known" : "unknown" });
    last = index + match[0].length;
  }
  if (last < template.length) segments.push({ text: template.slice(last), kind: "text" });
  return segments;
}

/** If the caret sits inside an open `{partial` token, returns the partial
 * (possibly "") and where the `{` is; otherwise null. */
export function openPlaceholderAt(value: string, caret: number): { partial: string; start: number } | null {
  const before = value.slice(0, caret);
  const match = before.match(/\{([A-Za-z_][A-Za-z0-9_]*)?$/);
  if (!match) return null;
  return { partial: match[1] ?? "", start: caret - match[0].length };
}

/** Replaces the open `{partial` before the caret with `{name}`; returns the
 * new value and the caret position just after the inserted token. */
export function insertPlaceholder(value: string, caret: number, name: string): { value: string; caret: number } {
  const open = openPlaceholderAt(value, caret);
  const start = open ? open.start : caret;
  // Swallow an already-typed closing brace right after the caret.
  const after = value.slice(caret).startsWith("}") ? value.slice(caret + 1) : value.slice(caret);
  const token = `{${name}}`;
  return { value: value.slice(0, start) + token + after, caret: start + token.length };
}

export function suggestPlaceholders(known: readonly string[], partial: string): string[] {
  const p = partial.toLowerCase();
  return [...new Set(known)].filter((name) => name.toLowerCase().startsWith(p)).slice(0, 8);
}
