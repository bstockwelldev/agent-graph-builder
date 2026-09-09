/**
 * Design tokens -- Phase A of the AgentFlow-mockup gap-analysis recommendation.
 *
 * Structure (ramp-based color, numeric spacing/radius/shadow scales, a named
 * type scale) follows the mockup's style guide. Values are re-derived for
 * this app's existing DARK theme rather than copied from the mockup's light
 * palette -- the mockup's swatches are a structural reference, not a literal
 * palette to adopt (see the design-review agent's theme-conflict note).
 *
 * Phase A scope: extraction only. Every color/spacing/radius value below was
 * pulled from what components already rendered, then snapped onto the
 * mockup's numeric scales where the drift was trivial (radius 6->8, a few
 * off-scale spacing values). Typography sizes are extracted as-is, unsnapped
 * -- applying real hierarchy (using `typeScale.heading` etc. for a workflow
 * title, growing body text) is a Phase C decision, not this pass.
 */

// ---- Color ramps -----------------------------------------------------

export const color = {
  primary: { 500: "#8fbaff", 600: "#6ea8fe", 700: "#4a7cd1", 800: "#3a67ba" },
  success: { 500: "#3cb873", 600: "#2f9e5c", 700: "#227d47" },
  warning: { 500: "#e8bc4a", 600: "#d8a92c", 700: "#b98c1e" },
  error: { 500: "#e2645a", 600: "#d1453b", 700: "#a8352c" },
  neutral: {
    50: "#e8eaed", // primary text
    100: "#c9cdd6", // secondary text (new -- not yet used, available for Phase C)
    300: "#8b909c", // tertiary/disabled text (new -- not yet used)
    400: "#5c6270", // sequence-edge stroke, quiet borders
    500: "#3a3f4b", // idle node border
    600: "#2f333d", // input/button border
    700: "#2a2d35", // panel border
    800: "#20232b", // raised surface (cards, inputs, nodes)
    900: "#181a20", // panel surface
    950: "#111318", // page background
  },
} as const;

/** Named, role-based surfaces -- mirrors the mockup's surface/muted/border tokens. */
export const surface = {
  page: color.neutral[950],
  panel: color.neutral[900],
  raised: color.neutral[800],
  border: color.neutral[700],
  borderStrong: color.neutral[600],
} as const;

export const text = {
  primary: color.neutral[50],
  muted: color.neutral[100],
} as const;

/** Status colors, one per run/node lifecycle state. */
export const status = {
  idle: color.neutral[500],
  running: color.warning[600],
  succeeded: color.success[600],
  failed: color.error[600],
} as const;

/**
 * Semantic node-type palette — bg/accent/label tuned for WCAG AA (4.5:1) label
 * contrast on dark surfaces. Accent drives idle border tint; label is type eyebrow.
 */
export const nodeType = {
  input: { bg: "#152228", border: "#3d8b96", accent: "#6ec9d4", label: "#a8e0e8" },
  prompt: { bg: "#221c30", border: "#7c5cbf", accent: "#a88de8", label: "#d4c4f5" },
  llm: { bg: "#182238", border: "#4a7cd1", accent: "#8fbaff", label: "#b8d4ff" },
  tool: { bg: "#262018", border: "#b98c1e", accent: "#e8bc4a", label: "#f0d88a" },
  router: { bg: "#281c2a", border: "#b060a8", accent: "#d88cc8", label: "#e8b8dc" },
  output: { bg: "#152420", border: "#2f9e5c", accent: "#3cb873", label: "#9eddb8" },
} as const;

/** Blueprint-style canvas pane — subtle paper tone over dark base. */
export const canvas = {
  pane: "#0d1520",
  grid: "#1a2a42",
  gridMajor: "#243a5c",
} as const;

/** Non-neutral surfaces used for callouts (destructive actions, success banners, error text). */
export const accentSurface = {
  destructive: { bg: "#2b1c1c", border: "#5a2c2c", text: "#f0a0a0" },
  successAction: { bg: "#1f3a2a", border: "#2f5a3f" },
} as const;

// ---- Spacing scale (mockup: 4/8/12/16/24/32/48) -----------------------

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
} as const;

// ---- Radius scale (mockup: 2/4/8/12/16) --------------------------------

export const radius = {
  sm: 2,
  md: 4,
  lg: 8,
  xl: 12,
  xxl: 16,
} as const;

// ---- Shadow / elevation scale (mockup: sm / 0-8) -----------------------

export const shadow = {
  none: "none",
  sm: "0 1px 2px rgba(0, 0, 0, 0.3)",
  1: "0 2px 4px rgba(0, 0, 0, 0.35)",
  2: "0 4px 8px rgba(0, 0, 0, 0.4)",
  4: "0 8px 16px rgba(0, 0, 0, 0.45)",
  8: "0 16px 32px rgba(0, 0, 0, 0.5)",
  /** The existing running-node glow, kept as-is rather than folded into the elevation scale. */
  runningGlow: "0 0 10px rgba(216, 169, 44, 0.6)",
} as const;

// ---- Typography --------------------------------------------------------

export const fontFamily = {
  /** Current app font -- kept in Phase A. Switching to Inter (per the mockup) is a Phase C call. */
  ui: "system-ui, -apple-system, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

/**
 * The mockup's official named scale (Display/Heading/Subheading/Body/Small/
 * Caption). Nothing in the app uses these yet -- the largest current text is
 * 13px -- but they're defined now so Phase C has them ready (e.g. a workflow
 * title/version header belongs at `heading`, not a new one-off value).
 */
export const typeScale = {
  display: { fontSize: 32, lineHeight: "40px", fontWeight: 700 },
  heading: { fontSize: 24, lineHeight: "32px", fontWeight: 600 },
  subheading: { fontSize: 18, lineHeight: "28px", fontWeight: 500 },
  body: { fontSize: 16, lineHeight: "24px", fontWeight: 400 },
  small: { fontSize: 14, lineHeight: "20px", fontWeight: 500 },
  caption: { fontSize: 12, lineHeight: "16px", fontWeight: 400 },
} as const;

/**
 * App-specific sizes that don't map onto the mockup's named scale but are
 * what the current UI actually renders at today. Kept distinct from
 * `typeScale` rather than force-fit, per the "no visual change yet" rule.
 */
export const localType = {
  /** Node status word under the label (idle/running/succeeded/failed). */
  micro: { fontSize: 10, lineHeight: "14px", fontWeight: 500 },
  /** Primary UI text: inputs, buttons, node labels, run result text. */
  ui: { fontSize: 13, lineHeight: "18px", fontWeight: 400 },
  /** Uppercase section labels/eyebrows (reuses caption's size). */
  label: { ...typeScale.caption, textTransform: "uppercase" as const, letterSpacing: 0.5 },
} as const;

// ---- App shell (responsive drawers, a11y) -------------------------------

export const shell = {
  breakpoint: {
    /** Collapse fixed rails into drawers */
    compact: 1100,
    /** Inspect + run only; disable touch-draw authoring */
    phone: 640,
  },
  touchTarget: {
    min: 44,
  },
  rail: {
    library: 220,
    run: 340,
    inspector: 300,
  },
  zIndex: {
    backdrop: 40,
    drawer: 50,
    tooltip: 60,
  },
  motion: {
    drawerMs: 200,
  },
  shadow: {
    drawer: "0 8px 24px rgba(0, 0, 0, 0.45)",
  },
  panelPadding: spacing[3],
  sectionGap: spacing[2],
} as const;
