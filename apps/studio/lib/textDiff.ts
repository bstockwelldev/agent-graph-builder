// Line diff for Code mode's "review before saving" (canvas-workbench-
// ergonomics-plan.md §5). Graph text runs to thousands of lines, so the
// common prefix and suffix are trimmed before the LCS, and an oversized
// middle falls back to "all removed, all added" rather than stalling.

export type TextDiffLine = { kind: "same" | "added" | "removed"; text: string };
export type DiffHunkLine = TextDiffLine | { kind: "skip"; count: number };

const MAX_CELLS = 4_000_000;

export function diffText(before: string, after: string): TextDiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head: TextDiffLine[] = a.slice(0, start).map((text) => ({ kind: "same", text }));
  const tail: TextDiffLine[] = a.slice(endA).map((text) => ({ kind: "same", text }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  const middle: TextDiffLine[] = [];
  if ((n + 1) * (m + 1) > MAX_CELLS) {
    for (const text of midA) middle.push({ kind: "removed", text });
    for (const text of midB) middle.push({ kind: "added", text });
    return [...head, ...middle, ...tail];
  }
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] = midA[i] === midB[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      middle.push({ kind: "same", text: midA[i++] });
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      middle.push({ kind: "removed", text: midA[i++] });
    } else {
      middle.push({ kind: "added", text: midB[j++] });
    }
  }
  while (i < n) middle.push({ kind: "removed", text: midA[i++] });
  while (j < m) middle.push({ kind: "added", text: midB[j++] });
  return [...head, ...middle, ...tail];
}

/** Changed lines with `context` unchanged lines around them; longer unchanged runs collapse to a skip. */
export function diffHunks(lines: TextDiffLine[], context = 2): DiffHunkLine[] {
  const keep = lines.map(() => false);
  lines.forEach((line, index) => {
    if (line.kind === "same") return;
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k++) keep[k] = true;
  });
  const result: DiffHunkLine[] = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (skipped) result.push({ kind: "skip", count: skipped });
      skipped = 0;
      result.push(line);
    } else {
      skipped++;
    }
  });
  if (skipped && result.length) result.push({ kind: "skip", count: skipped });
  return result;
}
