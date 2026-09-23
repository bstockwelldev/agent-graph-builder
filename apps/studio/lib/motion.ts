/**
 * Wave 3 (studio-graph-workbench-redesign-plan.md): JS-driven motion that
 * the global `prefers-reduced-motion` CSS rule can't reach -- an explicit
 * `scrollIntoView({ behavior: "smooth" })` overrides CSS `scroll-behavior`.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
