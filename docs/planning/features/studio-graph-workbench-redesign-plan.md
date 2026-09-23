---
title: Graph workspace redesign — graph-first workbench, rich nodes, reliable layout
status: in-progress
capability: studio-graph-workbench-redesign
depends_on:
  - studio-shell-ux-gap-analysis.md
  - studio-ux-gap-remediation-plan.md
  - studio-ux-revision-plan.md
linear_issue: STO-602
last_updated: 2026-09-23
---

# Graph workspace redesign

> **Status:** Wave 1 shipped 2026-09-23 ([STO-602](https://linear.app/stockwise-productions-prototypes/issue/STO-602)).
> Waves 2–4 are open backlog:
> - [STO-603](https://linear.app/stockwise-productions-prototypes/issue/STO-603)
> - [STO-604](https://linear.app/stockwise-productions-prototypes/issue/STO-604)
> - [STO-605](https://linear.app/stockwise-productions-prototypes/issue/STO-605)

## Context

A third-party "Deep UI/UX Design Review" proposed a graph-native workspace. It made two claims:

- The graph is the application.
- Every drawer, diagnostic, run, analytic, resource and Chat response should be a connected view into it.

Items already covered elsewhere are not repeated here. The review's diagnostics-as-navigation, waterfall and Chat items were scoped in [studio-ux-gap-remediation-plan.md](studio-ux-gap-remediation-plan.md), and §1–§3 there have shipped.

On 2026-09-23 the review's remaining change sets were re-audited against the code in three parallel passes:

- shell and controls;
- nodes, edges and layout;
- dock, runs and analytics.

The audit found that the **graph route itself** still had the largest visible gaps. The Phase 10 work had shipped the *pieces*, but not the *workbench*.

### Audit findings

| Area | Finding | Review § |
| --- | --- | --- |
| Header | ~19 HUD controls (17 of them text buttons) in a `flex-wrap` row. No Validate or Run▾ in the header, and Chat reachable only by hotkey. Labels swapped to "Close X". Imported shadcn `Button`/`Badge`/`Input` into `components/graph/*`, against `apps/studio/AGENTS.md`. | 8–11 |
| Layout control | Orientation took 5 always-visible controls (label, help, Auto/H/V, Relayout). | 10, 82 Canvas |
| Graph kit | No token-styled `IconButton` or `Tooltip`, so the mobile icon buttons had no tooltips. | 11 |
| Node card | See the breakdown below. | 13–17 |
| Layout | See the breakdown below. | 20–21 |
| Edges | Every edge carried a stock label ("Always" on every sequence edge). Conditional edges were *always* animated, so motion meant "conditional", not "running". No failed-edge style. | 17–18 |

The node card problems:

- No NodeToolbar and no hover layer.
- Status was a bare word under the content.
- Issues showed as one 42-character sentence.
- Status colour replaced the selection ring.
- The router's `clipPath` diamond hid its own border, glow and selection.
- Six node types shared one grey palette.
- Summaries were thin: router had none, LLM said only "via provider".
- Nodes couldn't be named.

The layout problems:

- Dagre assumed 280×160, but the card had only a `minWidth`, so long text grew cards into their neighbours.
- Dagre re-ran on every load, discarding saved positions.
- New nodes landed at random positions.
- `fitView` was clamped by React Flow's default `minZoom` of 0.5, so wide graphs never fully fit.

---

## Wave 1: Graph workbench + rich nodes (review P0.1 / P0.3 / P0.4 / P0.5), shipped

### Slice 1: Graph-kit primitives

- `components/graph/ui/IconButton.tsx`:
  - the required `label` is both the `aria-label` and the tooltip;
  - `pressed` sets `aria-pressed` and a raised surface;
  - `size="touch"` gives a 44px target;
  - focus ring via `.agb-focus-ring`.
- `components/graph/ui/HoverTooltip.tsx`:
  - wraps any control;
  - opens on hover or focus after a delay, and dismisses on Escape;
  - portaled, with `role="tooltip"`.
- `NodeContextMenu` action extensions:
  - `checked` (renders `menuitemcheckbox`), `disabled`, `separatorBefore` + `groupLabel`, `shortcut`, `icon`, `keepOpen`;
  - Arrow-key navigation;
  - `menuAnchorFor(trigger)` anchors a menu to the button that opened it.
- Tokens in `lib/graph-theme.ts`:
  - `shell.motion.{fast,standard,slow,easing}`, with `drawerMs` kept as an alias;
  - `shell.headerHeight`;
  - distinct AA-contrast palettes for guardrail, rubric, human_gate, tool_loop, code_exec and branch (label-on-bg ratio of 10:1 or better).
- `app/globals.css`: focus ring, hover, inline-input, restrained `agb-pulse`, and `agb-edge-active` utilities, all of which respect `prefers-reduced-motion`.

### Slice 2: Graph header (`components/graph/GraphHeader.tsx`)

`[‹] [switcher] [name] ● Saved [💾] … [⚠ 2] [▶ Run][▾] | [+] [⊞] [◎] [✦] [···]`

- **Left:** identity and save state.
  - The save state is a dot with text, read out via `role=status`.
  - A Save icon button, plus the new ⌘S / Ctrl+S shortcut.
- **Validate chip:** reflects `validationSummary`. Clicking it re-validates and opens the Run panel's Diagnostics section.
- **Run split button:** the primary button toggles the Run panel.
  - The ▾ menu opens a specific section: Run controls, Run with fixture, Event log, Run history, or Diagnostics.
  - Sections open through RunPanel's new `sectionRequest` prop.
  - This also fixed a pre-existing bug: the old "Run with fixture…" menu item called `openSection` on an *uncontrolled* section, so it did nothing if that section had been collapsed. Uncontrolled sections now take a `revealNonce`.
- **Icon tools:** Add node, Layout, Focus mode, Chat (new: Chat is now reachable from the graph).
- **`···` overflow menu:** Releases, Routing lab and Knowledge (shown checked while open), Export/Import JSON, Shortcuts.
- **Compact widths:** the header keeps back, name, save state and validate. The bottom bar moved to `IconButton`s (tooltips, 44px targets) and gained Chat, with Releases, Routing lab and Knowledge moving into `···`.
- **Canvas live region:** orientation announcements were previously passed as no-op stubs and dropped. They're now wired to real state.

### Slice 3: Layout menu

One Layout control holds:

- Auto-arrange now;
- Fit view;
- Direction (Auto / Horizontal / Vertical);
- Spacing (Compact / Standard / Relaxed, mapped to dagre `nodesep`/`ranksep` presets in `LAYOUT_SPACING`);
- Show minimap.

Spacing and the minimap setting are per-viewer preferences stored in `localStorage`, with every access guarded. `OrientationControl.tsx` was deleted.

### Slice 4: Rich nodes (`nodes/GraphNodeView.tsx`)

- **Geometry is the single source of truth.** `layout/nodeGeometry.ts` defines `NODE_CARD_WIDTH` = 264 and `NODE_CARD_MAX_HEIGHT` = 124. The card enforces them: fixed width, single-line rows with ellipsis, and the running bar is an overlay rather than a row. Dagre uses the same constants.
- **Anatomy:**
  - a TYPE eyebrow with a status pill and an issue badge;
  - the title;
  - a summary line (`summaryFor`);
  - an I/O contract row: port kinds from `content/node-ports.ts`, which mirrors backend `ports.py`.
- **Summary lines:**

  | Node | Summary |
  | --- | --- |
  | router / branch | "N routes" |
  | prompt | "vars: …", from `templateVariables` |
  | output | "Final result" |
  | human_gate / code_exec | Content snippet |
  | llm / tool / input with a user-given name | The config field the title would otherwise show |
- **Independent state layers:**
  - selection is an outer outline;
  - run status is the border plus a pill with icon and word, never colour alone;
  - issues are a badge with severity icon and count, and the tooltip lists *every* message (`buildIssueMaps` now accumulates them).

  A selected, failed node shows both at once.
- **Stale state:** once the graph is edited after a run was painted, that run's pills turn dashed and faded, with the tooltip "Result from before your last edit".
- **Router:** drawn as an SVG hexagon, with the border colour as its stroke. The `clipPath` is gone, so selection, status and glow all show.
- **NodeToolbar on selection** (React Flow's `NodeToolbar`, zoom-independent): Edit configuration, Run from here, Duplicate, Zoom to node, Delete.
  - "Run from here" hands a `runFromNodeRequest` to RunPanel, which runs it with its current inputs.
  - Callbacks arrive through `canvasActions.tsx`'s context.
  - The right-click node menu gained Edit and Run from here.
- **Hover preview** (a second `NodeToolbar`, shown after a 350ms delay):
  - title, type and summary;
  - last run status with its duration;
  - the error snippet;
  - an issue summary.
- **Node naming:**
  - The NodeInspector "Name" field persists to `node.extensions.label`. It's schema-valid today, so no schema change was needed.
  - `extensions.label` is display-only, like `position`. It's excluded from the **semantic** fingerprint in both `backend/app/fingerprint.py` (`_DISPLAY_ONLY_EXTENSION_KEYS`) and `packages/agent-graph-sdk/src/schema.ts` (`DISPLAY_ONLY_EXTENSION_KEYS`), so renaming never counts as a behavioural change or shows up in semantic diffs.
  - Shared fixture digests in `test_fingerprint.py` and `schema.test.ts` prove the two implementations agree, and existing fingerprints are unchanged.
  - The local dirty-check fingerprint (`fingerprintGraph`) now includes `extensions`, so a rename marks the graph Unsaved.

### Slice 5: Layout reliability

- `needsInitialLayout(nodes, rankDir)` decides whether a freshly opened graph gets auto-arranged. It only does when the saved positions can't be trusted:
  - every node sits at the origin;
  - any two cards overlap;
  - the positions run along the other axis from the effective direction (for example, a desktop left-to-right layout opened on a portrait phone).

  Otherwise the saved positions are kept, and only the handle sides are updated.
- `findFreePosition` places new or duplicated nodes at the viewport centre (or the clicked point), nudged clear of existing cards. This replaces the random placement.
- `minZoom` is 0.15, and fit padding keeps the graph clear of the header, plus the mobile summary strip and bottom bar on compact widths.
- On compact widths, React Flow's zoom Controls and the edge legend are hidden. They sat under the mobile bar, and pinch-zoom plus edge chips cover what they did.

### Slice 6: Edges (`components/graph/edges/LabeledEdge.tsx`)

- Registered as the default edge type.
- **Chips:**
  - sequence edges get none;
  - conditional edges show "if: {condition}";
  - default edges show "fallback".

  Clicking a chip selects the edge.
- **Run state** (`edge.data.runState`, set in `paintInspectionPath`):
  - `active`: the edge into the currently running node. The only animated state, via a CSS dash that respects reduced motion.
  - `failed`: into a failed node, drawn red.
  - `traversed`.

  Kind-based `animated` was removed everywhere.

### Wave 1 acceptance criteria (review §82: Canvas, Nodes, Shell)

**Canvas**
- [x] **No nodes overlap on initial load.** Card bounds equal the layout box, and overlapping saved positions trigger a re-layout (`dagreLayout.test.ts`, 13 tests).
- [x] **Edges remain visible and the graph is automatically positioned.** Fit-view respects the header and mobile chrome, and `minZoom` no longer clamps wide graphs.
- [x] **Layout is accessible from one compact control** (the Layout menu).

**Nodes**
- [x] **Node purpose is understandable without selecting it:** type, title, summary and I/O row.
- [x] **State is visible, and not by colour alone:** pill with icon and word, plus the stale state.
- [x] **Important configuration is summarized.**
- [x] **Selection exposes contextual actions** (NodeToolbar).
- [x] **Hover previews without permanent clutter.**

**Shell (graph route)**
- [x] **The graph remains the dominant surface,** with a single-row header.
- [x] **Controls are compact and contextual:** icon buttons with tooltips, and low-frequency actions in `···`.
- [x] **Chat is discoverable from the graph** (header and mobile bar).

**Verification**
- **Studio:** `tsc` clean. `eslint` clean apart from 2 pre-existing warnings. `vitest` 177/177, including the new `GraphHeader.test.tsx`, `GraphNodeView.test.tsx` and `graphAuthoring.test.ts`.
- **SDK:** 95/95. **Backend:** 428/428. Root `pnpm run build` passes.
- **Visual (Playwright against a live backend and Studio on the demo graph):**
  - Desktop 1440×900: idle, selected (NodeToolbar and Name field), Layout menu, overflow menu, hover preview, after a run (status pills and traversed edges).
  - Mobile 390×844: idle and selected.
- **Not visually verified:** the `failed` edge style. The stub run succeeded, so it is covered by code only.

**Found during visual QA and fixed in the same change:**
- the `minZoom` clamp on `fitView`;
- fit padding under the header;
- compact Controls and legend overlapping the mobile bar;
- saved positions on the wrong axis on portrait screens;
- two controls both matched the accessible name "More";
- `lib/consoleLog.ts`'s `getServerSnapshot` returned a fresh array on every call. React warned about it, and it produced the Next dev "1 Issue" badge on every page. This came from the earlier Console panel work.

**Not in wave 1 (explicit):**
- Typed multi-port handles: a router has two declared outputs but one drawn handle, and edges never set `source_port`. This is a cross-language contract change, deferred.
- The remaining shadcn usage inside `components/graph/GraphSwitcherCombobox.tsx`.
- The "Unsaved" badge on first open of graphs whose saved positions overlap. It's the honest result of the auto-arrange, which changes positions.

---

## Wave 2: IA + selection model (open, [STO-603](https://linear.app/stockwise-productions-prototypes/issue/STO-603))

- **Icon nav rail** (56–72px) with a single Resources entry. Today `studio-nav.tsx` has 9 top-level items in a 240px column.
- **URL state** (`?node`, `?run`, `?panel`, `?tab`) so graph context can be deep-linked and restored.
- **NodeInspector tabs:** History (the node's recent runs) and Performance.
- **Graph-scoped analytics:** per-node backend rollups in `analytics.py`, with clickable metrics.
- **Retire `/runs` and `/runs/[graphId]`,** after porting dataset capture and multi-select into RunPanel history.
- **A clickable RunPanel event log.**

## Wave 3: Motion + accessibility (open, [STO-604](https://linear.app/stockwise-productions-prototypes/issue/STO-604))

- **Drawers slide:** `ShellDrawer` returns null when closed, so its transition never runs.
- **Graph menus** emerge from their trigger.
- **Escape closes panels**, with a focus trap and focus returning to the trigger.
- **`reducedMotion`** is passed to every panel.
- **Focus rings** across the whole graph kit.
- **Dead CSS removed:** the `graph-editor-canvas-glow-*` rules.

## Wave 4: Resource binding + inspector consolidation (open, [STO-605](https://linear.app/stockwise-productions-prototypes/issue/STO-605))

- **Node↔registry binding.** Nodes don't reference registry resources today: prompt, LLM and tool nodes use inline config.
- **Reverse "used by" API.**
- **One resource inspector framework** replacing the five duplicated page shells.
- **Open a resource from its node** without leaving the graph.

## Related docs

- [studio-ux-gap-remediation-plan.md](studio-ux-gap-remediation-plan.md): diagnostics, waterfall and Chat items from the same review.
- [studio-shell-ux-gap-analysis.md](studio-shell-ux-gap-analysis.md): Phase 10, the shell remediation this builds on.
- [roadmap.md](../roadmap.md): Phase 11.
