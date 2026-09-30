// The build's commit (canvas-workbench-ergonomics-plan.md §0): the Help overlay
// shows the studio's and the API's, so a stale or mismatched deploy is
// visible from a screenshot. NEXT_PUBLIC_BUILD_SHA is set at build time in
// next.config.ts from VERCEL_GIT_COMMIT_SHA (or GIT_COMMIT_SHA).

export const STUDIO_BUILD_SHA: string | null = process.env.NEXT_PUBLIC_BUILD_SHA || null;

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "local";
}

/** "Studio abc1234 · API abc1234", with a warning when both are known and differ. */
export function describeBuild(studio: string | null, api: string | null | undefined): { text: string; mismatch: boolean } {
  const mismatch = Boolean(studio && api && studio !== api);
  return { text: `Studio ${shortSha(studio)} · API ${api === undefined ? "…" : shortSha(api)}`, mismatch };
}
