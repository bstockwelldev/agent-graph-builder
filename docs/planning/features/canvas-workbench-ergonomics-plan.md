# Canvas workbench ergonomics plan

**Status:** Proposed 2026-09-30. Captured from a review of the graph editor
at laptop widths, with three screenshots: the old "Workflow summary" panel,
the empty-canvas right-click menu, and a squished header at about 1256px.

Evidence for each item below was checked against `master` at `3e62431`. The
layout, menu and minimap findings were reproduced with Playwright on the
built studio, at 1180, 1256 and 1440px wide with the Node Palette and a node
inspector open.

Code of record:
- `apps/studio/components/graph/GraphEditor.tsx` (canvas state, menus, panels)
- `FlowCanvas.tsx` (React Flow wiring)
- `GraphHeader.tsx` (the floating header)
- `NodeContextMenu.tsx` (every right-click and header menu)
- `NodePalette.tsx`
- `edges/LabeledEdge.tsx`
- `components/workbench/*` (panels, console, help)
- `lib/graph-theme.ts` (`shell` breakpoints)

## 0. Finding: the screenshots came from a build behind `master`

The first two screenshots show UI that `master` no longer has:
- **Workflow summary panel.** Removed on 2026-09-25 by `b0f8a6e`, "Fold workflow summary into the graph header".
- **Add-node menu with 13 types.** `master` lists 14: `NODE_TYPES` in `NodePalette.tsx` includes `transform`.

So the environment they came from (production or a local build) predates
2026-09-25. Production is deployed by hand (`vercel deploy --prod`, see
AGENTS.md), so it can fall behind `master` without anyone noticing.

- **Action (operator):** redeploy production from `master`.
- **Follow-up (shipped 2026-09-30, slice A):** `GET /api/health` returns `commit` (from `VERCEL_GIT_COMMIT_SHA` or `GIT_COMMIT_SHA`; null locally). The Help overlay (`?`) ends with "Studio abc1234 · API abc1234" and flags a studio and API on different commits (`lib/buildInfo.ts`; the studio's commit is baked in at build time as `NEXT_PUBLIC_BUILD_SHA`).

## 1. Workflow summary: dispersed across the layout

**Shipped 2026-09-25 (`b0f8a6e`).** The nothing-selected summary panel took a
full 384px column. Its content now lives in the header:
- **Node and edge counts:** the structure chip ("8 nodes · 8 edges").
- **Entry and terminal nodes:** the chip's tooltip, or the ⋯ menu on compact screens.
- **Validation:** the Validate chip.
- **Recent runs:** the last three, under **Run ▾**.

The Quick actions were dropped. Right-click, the palette and the header
already cover them.

**Still open:** the header is now the crowded part (§8). The design there moves
the structure chip, save state and validation count into a bottom **status
bar**. That is the natural home for "summary" facts, and the console toggle
(§6) lives there too.

## 2. Shrink the minimap on smaller screens

**Current behavior.**
- `FlowCanvas.tsx` renders `<MiniMap>` at React Flow's default size, 200×150px, with no size props.
- It is hidden only when the viewport is below `shell.breakpoint.compact` (1100px).
- It is anchored bottom-right. The edge legend (`CanvasEdgeLegend.tsx`) is centered at the bottom, and the zoom controls are bottom-left.

**Measured.** At 1180×700 the minimap was 200×150px while the canvas column
was only about 500px wide. At 1180, 1256 and 1440 it covers nodes, and the
edge legend overlaps both the minimap and the controls.

**Design.**
- Size the minimap by the canvas column's width, not the viewport's. Measure the column with a `ResizeObserver`; `useShellLayout` only knows `window.innerWidth`.
  - Canvas ≥ 1000px: 200×150.
  - Canvas 700–999px: 160×110.
  - Canvas below 700px: collapse to a 32px "Map" button that expands on click.
- The size must also respect the user's "Minimap" toggle (Layout menu, `agb.layout.showMinimap`).
- Keep the three bottom overlays in one layout slot, so they can't collide:
  - Controls stay bottom-left.
  - The edge legend moves into the status bar (§8), as a popover.
  - The minimap stays bottom-right.
- Keep `pannable zoomable`. Add `ariaLabel` to the minimap.

**Acceptance:** at 1180, 1256 and 1440px, with palette and inspector open, no overlay intersects another or covers the fitted graph's nodes. An e2e test compares bounding boxes.

**Shipped 2026-09-30 (slice B):**
- `minimapLayout` in `lib/canvasLayout.ts` sizes the minimap by the pane width from `useCanvasOrientation`.
- Below 700px it becomes a **Map** button (`aria-expanded`) that opens it at 160×110.
- The minimap has an `ariaLabel`.
- The edge legend moved into the status bar as an **Edge kinds** popover.
- `e2e/specs/canvas-layout.spec.ts` checks that the controls, minimap and status bar never intersect at 1180, 1256, 1440 and 1920px.

## 3. Right-click menu: native behavior and more actions

**Bug RCA: no hover highlight.**
- Menu items get `className="agb-menu-item"` plus an inline style with `background: "transparent"` (`itemStyle` in `NodeContextMenu.tsx`).
- The hover and focus rule `.agb-menu-item:not(:disabled):hover, .agb-menu-item:focus-visible { background: rgba(255,255,255,0.06) }` in `app/globals.css` has no `!important`.
- An inline style beats a class rule, so hover and keyboard focus never change the background.
- The sibling rule `.agb-hoverable` works because it does use `!important`.
- Measured: the hovered "LLM node" item's computed background is `rgba(0, 0, 0, 0)`.
- **Fix (shipped 2026-09-30, slice A):**
  - The inline style no longer sets a background; `.agb-menu-item` sets it in CSS.
  - Hovering an item focuses it, so `:focus` is the one highlight for pointer and keyboard.
  - The tint went from 6% to 10% white.

**Gaps against a native context menu.**
- **Empty canvas:** the menu only adds nodes, as a flat 14-item list.
- **Edge:** the only action is Delete.
- **Pointer vs keyboard:** hover and arrow-key focus are tracked separately, so two items can look active at once. There's no typeahead, and Home/End and submenus are missing.
- **Stale menu:** it needs checking that the menu closes when the canvas is panned, zoomed or scrolled, and when the window blurs. A second right-click elsewhere should reopen it at the new point.

**Design.**
- **Menu component.** One engine for every canvas menu: the headless Base UI `Menu`/`ContextMenu` (already a studio dependency via shadcn), styled with graph tokens.
  - Headless keeps us inside the styling rule (no Tailwind in `components/graph/*`).
  - It gives us roving focus (hover moves focus, so one highlight), typeahead, submenus with ArrowRight/ArrowLeft, Home/End, and dismissal on scroll, blur and resize.
  - It also gives us `aria-haspopup` and touch long-press.
- **Actions per target** (✓ = exists today):

| Target | Actions |
| --- | --- |
| Empty canvas | Add node ▸ (grouped by taxonomy category, with search) · Paste · Select all · Add group · Auto-layout · Fit view · Snap to grid (toggle) |
| Node | Edit ✓ · Run from here ✓ · Rename · Duplicate ✓ · Copy / Cut · Show upstream / downstream / all ✓ · Add to group ✓ · Focus on this node · Delete ✓ |
| Edge | Edit condition · Kind ▸ (sequence / conditional / fallback) · Style ▸ (§7) · Insert node ▸ (splices, like the Transform splice) · Delete ✓ |
| Selection | Group ✓ · Extract to graph ✓ · Align ▸ · Distribute ▸ (§9) · Copy · Delete |

- Actions come from one registry, keyed by target, so the command palette and keyboard shortcuts share labels and handlers with the menu. Shortcut hints are shown in the menu.

**Acceptance:**
- Hover and keyboard focus show one highlight.
- Typeahead, submenus and Escape (which closes a submenu first) behave like a native OS menu.
- An e2e test covers each target's menu.

**Shipped 2026-10-01 (slice C):**
- **Engine.** We kept our own menu engine (`NodeContextMenu.tsx`) instead of switching to Base UI. It's token-styled already, and it also drives the header, run panel and inspector menus, so they all gain the same behavior; a Base UI swap would have meant restyling and re-testing all of them for no behavior gain. What it does now:
  - Submenus, one level deep. They open on hover, click, Enter or ArrowRight, sit beside the parent item and flip left at the screen edge. ArrowLeft closes one.
  - Typeahead, plus Home and End.
  - Escape closes a submenu first, then the menu.
  - It closes when the window loses focus, when the window width changes (height alone doesn't, so a phone keyboard won't close it), and on wheel over the canvas.
  - A right-click elsewhere closes it and re-sends the click to whatever is underneath, so the menu opens on the new target.
- **Actions per target:** `canvasMenuActions.tsx` has one builder per target (labels, order, groups, shortcut hints). GraphEditor supplies the handlers.
  - **Empty canvas:** Add node ▸ (grouped Flow / Model / Data and tools / Checks and review), Paste, Select all, Auto-arrange, Fit view, Snap to grid.
  - **Node:** Edit, Run from here, Rename (selects the node and focuses its name field), Duplicate, Copy, Cut, Show upstream / downstream / all, Focus on this node, the group actions, Delete.
  - **Edge:** Edit, Kind ▸, Insert node ▸, Delete.
    - Insert node splices a new node in at the edge's midpoint: the first half keeps the edge's kind, condition and source port; the second half keeps its target port.
  - **Selection:** Group, Extract, Copy, Cut, Delete N nodes.
- **Clipboard** (`lib/canvasClipboard.ts`): an in-app clipboard of nodes plus the edges between them.
  - Pasted nodes get fresh ids and become the selection.
  - Paste goes to the clicked point, or 40px offset from the original.
  - Shortcuts: ⌘A, ⌘C, ⌘X, ⌘V. They do nothing while typing in a field, and ⌘C/⌘X leave any selected text alone.
- **Not yet:**
  - Style ▸ waits on §7, and Align ▸ / Distribute ▸ on §9.
  - The command palette doesn't yet share the menu registry.
  - Touch long-press.
- **Tests:**
  - `e2e/specs/context-menus.spec.ts` covers every target, the keyboard behavior, re-targeting, splice and clipboard.
  - Unit tests: `canvasMenuActions.test.tsx`, `canvasClipboard.test.ts`, and engine tests in `NodeContextMenu.test.tsx`.

## 4. Palette panel and tool bar (Photoshop/Figma-style)

**Current behavior.**
- `NodePalette.tsx` is a fixed 288px list (`w-72`) of the hardcoded `NODE_TYPES`, where click adds a node.
- Its only content is node types: no edges, templates, library resources or saved graphs.
- Pointer modes are implicit: drag pans, shift-drag selects, and there is no hand tool.

**Design.**
- **Tool bar:** a vertical strip at the canvas's left edge.

| Tool | Key | React Flow setting |
| --- | --- | --- |
| Select | V | `selectionOnDrag=false`, `panOnDrag=[1]` |
| Hand / pan | H, or hold Space | `panOnDrag` |
| Marquee (group select) | M | `selectionOnDrag`, `selectionMode="partial"` |
| Connect | C | Click a source then a target; the next edge uses the palette's current edge kind |
| Zoom | Z | Click to zoom in, Alt-click to zoom out |

  The active tool shows in the status bar. Figma's keys are used where they exist.
- **Palette:** registry-driven sections, so a new section registers without editing the palette.
  - Nodes, grouped by taxonomy category.
  - Edges: the kinds and styles become the default for new connections.
  - Library: prompts, tools and LLM profiles; dropping one creates a bound node.
  - Transforms.
  - Subgraphs (saved graphs).
  - Templates.
- **Interaction:**
  - Drag-and-drop onto the canvas at the drop point; click still adds at the viewport center.
  - Search across all sections.
  - The palette collapses to an icon strip, so it gives space back to the canvas (§8).
- **Considerations:**
  - One source of truth for types: the taxonomy plus the SDK's `NodeType`.
  - Keyboard access to drag-to-add: Enter adds at the viewport center.
  - The touch/phone rules stay as they are (no draw-authoring below 640px).

**Shipped 2026-10-01 (slice E):**
- **Tool bar** (`CanvasToolbar.tsx`, `lib/canvasTools.ts`): a vertical strip at the canvas's left edge. Arrow keys move between the tools.
  - **Select (V):** unchanged. Drag pans, drag a node to move it, Shift-drag draws a selection box.
  - **Hand (H, or hold Space):** pans even over nodes, which don't move.
  - **Marquee (M):** drag selects the nodes the box touches. Middle and right mouse buttons still pan.
  - **Connect (C):** click a source, then a target. A chip names the pending source; Escape or a pane click cancels. The edge goes through the same path as a handle drag.
  - **Zoom (Z):** click zooms in around the pointer; Alt-click zooms out.
  - **Status bar and cursors:** the status bar shows the active tool. Cursors follow the tool (`[data-canvas-tool]` rules in `globals.css`).
  - **Fit-to-view** keeps clear of the strip.
- **Palette** (`NodePalette.tsx`, `paletteSections.ts`): it renders the registered sections, so a new kind of item is one new registry entry.
  - **Nodes:** grouped Flow / Model / Data and tools / Checks and review.
  - **Library:** prompts, LLM profiles and tools. Adding one creates a node already bound to it (`promptId`, `llmProfileId`, `toolName`).
  - **Transforms:** library transforms, added as a transform node bound by `transformId`.
  - **Subgraphs:** every other saved graph, added as a subgraph node pinned to `latest`.
  - One search box filters every section.
  - **New edges:** Always, Match text or Fallback. It sets the kind for handle drags and the Connect tool. Match text first asks for the condition, through the existing kind menu.
  - **Adding nodes:** click or Enter adds a node at the viewport center; dragging drops it at the pointer.
  - **On desktop the palette stays open** while you work, instead of closing on select or add. The compact drawer still closes.
- **Icon strip:** the palette folds to a 56px icon strip (node types only, still clickable and draggable). The fold is per viewer (`agb.palette.collapsed`).
  - It also folds on its own when docking it would squeeze the canvas under 480px (`dockLayout`). That was the first step of §8's minimum-width rule; the inspector now floats only if even the strip doesn't fit.
- **Not yet:** templates (there's no template registry yet), and edge styles in the palette (§7).
- **Tests:**
  - e2e: `e2e/specs/canvas-tools.spec.ts` covers the tools, Connect with the new-edge kind, palette search, drag-and-drop, library binding, and the strip that persists across a reload.
  - e2e: `canvas-layout.spec.ts` now expects the palette to fold at 1120px.
  - Unit: `canvasTools.test.ts`, `NodePalette.test.tsx`, and `dockLayout` tests.

## 5. Full graph JSON/YAML editor mode

**Current behavior.** A live editor exists (2026-09-25,
[studio-config-editor-and-console-plan.md](studio-config-editor-and-console-plan.md)).
- It is `GraphConfigPanel.tsx`, a 32rem side panel with JSON and YAML views.
- It is reached only from the ⋯ menu ("Graph config (JSON/YAML)").
- **Apply** goes through `applyGraphDefinition`; persisting it is a separate **Save**.
- It is a plain textarea: no line numbers or folding, and errors aren't mapped to lines.

**Design.**
- **View switch:** Canvas | Code | Split, in the header, stored in the URL as `?view=code`.
  - Code is a full-width editor.
  - Split puts the canvas and code side by side.
- **Editor:** lazy-load CodeMirror 6 (much lighter than Monaco) with JSON and YAML modes, line numbers, folding and search.
  - Diagnostics become line gutter marks: map the diagnostic's path to a line through the `yaml` package's node ranges, or a JSON AST.
  - Clicking a diagnostic jumps to it.
- **Save:** ⌘S in Code view validates (`graphDefinitionSchema` + `parseGraphRawConfig`), applies through the same `applyGraphDefinition` path, and persists in one step.
  - Show a diff against the saved version first.
  - A failed save leaves the text as typed.
- **Split view:** canvas edits refresh an untouched draft. A draft with edits keeps the "Apply keeps your version" rule the panel already uses.
- **Later:** schema-aware autocomplete from `packages/agent-graph-sdk/contract/openapi.json`.
- **Considerations:**
  - Bundle size: CodeMirror loads only in Code view.
  - The protected demo graph is read-only in Code view too.
  - JSON stays the stored contract; YAML is a view only.

**Shipped 2026-10-01 (slice H):**
- **View switch:** Canvas | Code | Split buttons in the header (in the ⋯ menu at tight widths; phones keep the canvas), stored as `?mode=code|split`. `?view=` already names the canvas view (layers, heatmap), hence `mode`. The canvas refits when it reappears or changes width.
- **Editor** (`components/graph/code/CodeEditor.tsx`): CodeMirror 6 with `basicSetup` (line numbers, folding, search, history), JSON and YAML modes, line wrapping, and a token-colored dark theme. `GraphCodeView` loads it through `next/dynamic`, so the canvas never ships it.
- **Problems on lines** (`lib/graphCode.ts`): one YAML document parse gives source ranges for both views (JSON is YAML 1.2). Syntax errors, `graphDefinitionSchema` issues, the fixed `id`/`entry_node_id` checks, and compile diagnostics (by node or edge id) become gutter marks and a Problems list; clicking a problem moves the cursor to its line.
- **Save** (⌘S in the editor, anywhere in Code or Split view, or the Save button): check, then review the change against the saved version (`lib/textDiff.ts`, hunks with context; schema key order, no nulls and no `updated_at`, so the review shows edits rather than formatting), then apply and persist through `saveGraph`, the same path the header's Save uses (the read-only demo forks to a copy). A failed check or save leaves the text as typed. Apply updates the canvas without saving.
- **Split view:** canvas edits refresh an untouched draft; a draft with edits is kept and flagged.
- The ⋯ menu's "Graph config (JSON/YAML)" side panel stays for quick edits next to the canvas.

## 6. Terminal-style console at the bottom of the canvas

**Current behavior.** The Console exists (2026-09-22,
`workbench/panels/ConsolePanel.tsx`), but it isn't where this item wants it:
- It is a floating right-side panel, not a bottom dock (that was an explicit scope decision at the time).
- It opens only with ⌘⇧J or from the command palette. There is no visible toggle.
- Entries come from `lib/consoleLog.ts`: client errors, run events, and clickable node and run links.

**Design.**
- **Placement:** a bottom dock inside the canvas column.
  - Collapsed by default, to a status-bar segment showing the counts ("2 errors · 5 warnings").
  - Expands to a drag-resizable panel; its height is remembered in localStorage.
- **Terminal look:** monospace text, a timestamp and level gutter, follow-tail (auto-scroll, paused while scrolled up), and ANSI-style level colors from graph tokens.
- **Controls:**
  - Filters for level, source (run, validate, save, API, user) and node.
  - Search, clear, and copy or export as NDJSON.
- **User log trail:** log user actions as well as system events (save, apply, validate, run start and stop, publish, import), so a session can be traced after the fact.
- **Retention:** cap it (e.g. 2,000 entries, a ring buffer).
- **Accessibility:** new errors are announced politely; don't announce every run event.

**Acceptance:**
- Collapsed by default.
- Opens from the status bar and from ⌘⇧J.
- Clicking a node id focuses the node.
- An e2e test covers the dock at 1180px.

**Shipped 2026-10-01 (slice D):**
- **Dock** (`CanvasConsoleDock.tsx`): it sits between the pane and the status bar, inside the canvas column.
  - Collapsed by default.
  - A status-bar segment shows the counts ("2 errors · 5 warnings") and toggles the dock.
  - On desktop, ⌘⇧J and the command palette's Console toggle the dock instead of the floating panel. Compact layouts keep the floating panel.
  - Drag-resizable (or ArrowUp/ArrowDown on the handle), 120px to 60% of the viewport. The height is stored in `agb.console.height`.
- **Terminal look:** monospace rows of time, level tag (INFO/WARN/ERR in graph-token colors), source and message.
  - The list follows the tail, pausing while you're scrolled up (a **Jump to latest** button resumes it).
  - New errors are announced politely. Other entries aren't.
- **Controls:**
  - level toggles with counts, a source filter, and a text filter over message, source, node and run
  - Clear, and Export as NDJSON (the filtered entries)
  - a node id link focuses the node, or opens its graph when the entry is from another graph
- **What gets logged** (`lib/consoleLog.ts`):
  - **System events:** run started (provider, model, agent), blocked or settled, plus the node events. Fast runs that finish before streaming starts now log their node events too.
  - **Validation:** the header Validate result.
  - **Your actions:** save (and fork, or failure), import, applying the graph config, approving or rejecting a paused step, publishing a release.
- **Retention:** a 2,000-entry ring buffer (was 300).
- **Tests:**
  - `e2e/specs/console-dock.spec.ts`, at 1180px.
  - `CanvasConsoleDock.test.tsx`, `consoleLog.test.ts`, and a status-bar toggle test.

## 7. Edge styles (dotted, dashed, solid, thick, …)

**Current behavior.**
- `LabeledEdge.tsx` changes the stroke only for a failed run (red, 2.5px) and for selection (2.5px).
- The edge's kind (sequence, conditional, fallback) shows only as a text label, and users can't style edges.

**Design.**
- **Storage:** add `extensions.style` on `GraphEdge`: `{ pattern: solid | dashed | dotted, weight: thin | normal | thick, color?: token }`.
  - It is display-only.
  - `backend/app/fingerprint.py` currently hashes edge `extensions` raw, and only nodes go through `_DISPLAY_ONLY_EXTENSION_KEYS`. So add `style` to that set, apply it to edges, and mirror the change in the SDK's `DISPLAY_ONLY_EXTENSION_KEYS`. Restyling must not change the semantic fingerprint.
- **Default styles by kind**, so the style carries meaning before anyone customizes it: sequence is solid, conditional is dashed, fallback is dotted. Update the edge legend to match.
- **Editing:**
  - The edge inspector gets Style controls: a segmented pattern control plus weight.
  - The edge right-click menu gets Style ▸.
  - The palette's Edges section sets the style of the next connection.
- **Keep:** animation still means "executing", and red still means "failed". User styles can't take over those two signals.
- **Later:** routing (curved, step, straight) per edge or per graph.

**Shipped 2026-10-01 (slice G):**
- **Storage:** `extensions.style = { pattern, weight, color }` on an edge. `style` is display-only for edges in `backend/app/fingerprint.py` and the SDK's `semanticPayload`; the semantic fingerprint and release diffs ignore it (pinned digests in both test suites). The studio now round-trips edge `extensions` on save; it used to drop them.
- **Defaults by kind:** Always solid, Match text dashed, Fallback dotted (`lib/edgeStyle.ts`). The status bar's Edge kinds legend draws each pattern.
- **Editing:** the edge inspector's Style group (pattern, weight, and color swatches, each with Default), and the edge menu's Style ▸ with Reset style.
- **Kept:** a running edge keeps its animated dash, a failed edge stays red, and a validation issue keeps its color and width. The palette has no red.
- **Not done:** the palette setting the style of the next connection (its "New edges" control sets the kind, whose default pattern follows).

## 8. Layout squished at smaller screen sizes

**Bug RCA** (reproduced at 1180, 1256 and even 1440px wide, with the Node
Palette and a node inspector both open):
1. **The header overlaps itself.**
   - The identity group in `GraphHeader.tsx` has `flex: 1 1 auto; minWidth: 0`, so it may shrink below its content. Its children don't shrink: the graph switcher, the structure chip, the name input (`minWidth: 80`) and the `nowrap` save state.
   - Its overflow is visible, so the children spill into the next group and draw on top of each other: "Demo graph", "8 nodes · 8 edges", the name and "Unsaved" all collide.
   - `b0f8a6e` made this worse by adding the structure chip to this group.
2. **Responsive rules follow the viewport, not the canvas.**
   - `compact` (below 1100px) is the only point where the header collapses (the switcher hides) and the side panels turn into drawers.
   - Between 1100 and about 1500px, the icon rail (72px), a docked palette (288px) and a docked inspector (about 384px) leave the canvas only 500–750px, and the header needs about 720px.
   - `shell.canvasMinWidth` (420) exists as a token, but nothing enforces it.
3. **Bottom overlays collide** (§2): the edge legend, minimap and controls.

**Design.**
- **Canvas-width breakpoints:** measure the canvas column with a `ResizeObserver` (container queries where the component is styled with Tailwind).
- **Header drops items by priority as the canvas narrows:**
  1. The structure chip and save-state text move to the status bar.
  2. The graph switcher becomes an icon.
  3. The name input truncates with an ellipsis.
  4. Low-priority buttons move into ⋯ (`overflowActions` already exists).
  - The identity group gets `overflow: hidden`, so any leftover overlap clips instead of drawing over other controls.
- **Enforce `canvasMinWidth`:** when the canvas would drop below about 480px, collapse the palette to its icon strip (§4) first, then turn the inspector into an overlay drawer.
- **Status bar** (new, 28px, at the bottom of the canvas column):
  - Structure ("8 nodes · 8 edges", entry and terminal nodes in its tooltip).
  - Validation.
  - Save state.
  - Zoom %.
  - Active tool.
  - Snap toggle.
  - Edge legend (a popover).
  - Console toggle and counts.
  - This also finishes §1: the summary's facts end up in one quiet strip.

**Acceptance:** an e2e test at 1180, 1256, 1440 and 1920px, with every
combination of palette and inspector open, asserts that no two header
controls' bounding boxes intersect and that the canvas column is at least
480px.

**Shipped 2026-09-30 (slice B):**
- **Canvas-width density.** `useElementWidth` measures the canvas column, and `headerDensity` maps its width to a density:
  - `full`: 1120px and wider.
  - `snug`: 760–1119px. The save state shows as a dot only (the text stays for screen readers), the graph switcher becomes an icon, and the health chip moves to ⋯.
  - `tight`: below 760px. Add node, Layout, Focus and Chat also move to ⋯.
  - The identity group clips instead of drawing over its neighbors, and the name input ends in an ellipsis.
- **Structure chip:** it moved from the header to the status bar, and stays in ⋯ on compact.
- **Minimum width enforced.** `inspectorOverlaysCanvas` measures the whole graph surface, which avoids a resize feedback loop. When docking the inspector would leave the canvas under 480px, the inspector floats over the canvas's right edge (`data-inspector-mode="overlay"`). This happens with the palette docked at 1100–1151px viewports, for example.
  - Deviation: the palette's icon strip, the plan's first step here, waits on slice E.
- **Status bar** (`CanvasStatusBar.tsx`, 28px, inside the ReactFlowProvider under the pane; hidden on compact, where the mobile tray takes its place). It holds:
  - The structure summary, with entry and terminal nodes in its tooltip.
  - Focus mode's 1–3 hop control, **Fit to focus** and exit.
  - The **Edge kinds** popover.
  - The **Snap** toggle, persisted in `agb.layout.snapToGrid`.
  - The zoom readout, which fits the view on click.
- **Still to come:** validation and save state stay in the header, since they're primary actions there. The active tool arrives with slice E and the console toggle with slice D.
- **Tests:** `e2e/specs/canvas-layout.spec.ts` covers every width and panel combination named above, plus the minimap, the status bar and focus hops.

## 9. Grid snapping and alignment

**Current behavior.**
- `FlowCanvas.tsx` already sets `snapToGrid` with `snapGrid={[24, 24]}`, matching the minor grid (`Background` gap 24), so dragged nodes snap.
- There is no snap toggle.
- There are no alignment guides and no align or distribute commands.
- Positions from auto-layout (dagre) and from adding at a point may not land on the grid. **To verify:** `addNode(type, { x, y })` and the layout output.

**Design.**
- **Smart guides:** during `onNodeDrag`, compare the dragged node's edges and center with nearby nodes' bounds.
  - Draw guide lines in an overlay.
  - Within 6px, snap to a guide; guides take priority over the grid.
  - Hold ⇧ (or ⌥, Figma's key) to turn snapping off for that drag.
- **Commands for a multi-selection:** Align (left, center, right, top, middle, bottom) and Distribute (horizontal, vertical). Offer them in the selection context menu and the command palette, with shortcuts.
- **Snap everywhere:** round auto-layout output, add-at-point positions and palette drops to the grid.
- **Settings:** a snap toggle and grid size (12, 24 or 48) in the status bar, stored per browser.
- **Considerations:**
  - Positions aren't semantic: they're already excluded from fingerprints.
  - Group frames (`buildGroupFrameNodes`) move with their members.
  - Performance: the guide search runs only over nodes near the one being dragged.

**Shipped 2026-10-01 (slice F):**
- **Smart guides** (`lib/canvasAlign.ts` `snapToGuides`, applied in `FlowCanvas` `handleNodesChange`):
  - While one node is dragged, it snaps to the nearest left, center or right edge (and top, middle or bottom) of another node within 6 flow px. A line marks the match (rendered through `ViewportPortal`, 1 screen px at any zoom).
  - The search covers nodes within 800px only.
  - Grid snapping moved out of React Flow and into the same handler, so a guide wins on its axis and the grid applies on the other. React Flow rounded to the grid first, which could leave an off-grid neighbor out of reach.
  - The drop keeps the snapped position; React Flow's drag-end change carries the raw one.
  - Holding ⇧ or ⌥ drags freely, grid included.
  - Group frames don't snap themselves.
- **Align** (left, horizontal center, right, top, vertical middle, bottom) and **Distribute** (horizontally, vertically; three or more nodes):
  - In the selection menu, and in the node menu when the node is part of a multi-selection.
  - Figma's shortcuts: ⌥A, ⌥H, ⌥D, ⌥W, ⌥V, ⌥S to align; ⌥⇧H and ⌥⇧V to distribute.
  - Undoable. Sizes come from React Flow's `measured` (falling back to the card's default).
- **Snap everywhere:** with Snap on, positions land on the grid for auto-arrange (dagre output), add node (palette, menu or drop), paste and splice.
- **Grid size** 12, 24 or 48 next to the status bar's Snap toggle (`agb.layout.gridSize`). The background grid follows it, with major lines every 5 steps.
- **Not yet:** Align and Distribute in the command palette, which is still navigation-only.
- **Tests:**
  - `e2e/specs/snapping.spec.ts` covers a guide snap with its line, Align from the menu, ⌥W and ⌥⇧H, and the grid size persisting with auto-arrange on it.
  - Unit tests: `canvasAlign.test.ts`, plus the menu and status-bar tests.

## 10. Focus mode appears to do nothing

**Bug RCA.**
- Focus mode (header toggle, `focusMode` in `GraphEditor.tsx`) dims nodes only when a node is also selected.
- It lights the selected node's full ancestor and descendant closure: `computeFocusNodeIds(selectedNodeId, edges)`, with direction "both", in the SDK's `graph/traverse.ts`.
- Three things make it look dead:
  1. **Nothing selected, nothing happens.** There is no hint, no dimming and no toast.
  2. **The closure is almost the whole graph.** In the demo graph, input → prompt_classify → llm_classify → router_1 feeds both branches, which rejoin at output_1. So selecting input_1, prompt_classify, llm_classify, router_1 or output_1 (5 of 8 nodes) lights every node and changes nothing. Only tool_lookup, prompt_answer and llm_answer dim anything, one branch each.
  3. **Edges never dim.** `LabeledEdge` has no focus state, so even when nodes dim the picture barely changes.
- The right-click menu's "Show upstream / downstream / all dependencies" (`dependencyView`) already covers the closure use case.

**Design.**
- **Redefine focus mode as the local neighborhood:** the selected node plus N hops (default 1, adjustable 1–3 in the status bar). The whole-closure view stays with the dependency view.
- **Dim everything outside it:** edges not between two lit nodes, and group frames.
- **Offer to fit the view** to the lit set.
- **With nothing selected:** show a status-bar hint ("Focus: select a node"), and take the first node the user clicks.
- **Exit:** Escape leaves focus mode.
- **Alternative:** fold focus mode into the dependency view and remove the separate toggle. Decide after the neighborhood version has had some use.

**Acceptance:** on the demo graph, turning focus mode on and selecting llm_classify dims every node and edge more than one hop away. An e2e test covers it.

**Shipped 2026-09-30 (slice A):**
- Focus mode lights the selected node and its direct neighbors (`lib/focusMode.ts`, one hop).
- Edges dim whenever either end is dimmed, for find, impact and the dependency view as well. The flag is derived in `canvasEdges`, never stored on edges.
- With nothing selected, a chip says "Focus mode: select a node to see it and its neighbors", with a Turn off button.
- Not yet: the hop control, fit-to-lit and Escape to exit. They wait on the status bar (slice B).

**Shipped 2026-09-30 (slice B):**
- The status bar's Focus group sets 1–3 hops and has **Fit to focus**.
- Escape leaves focus mode, unless a menu, the find bar or a pending connection took the key first.

## 11. One consistent in-app knowledge base

**Current behavior.** Help about how the tool works is spread across places
that don't share a source:
- Node taxonomy text: `content/taxonomy.ts`, used by palette tooltips and the inspector's "Learn more".
- Field hints written inline in each form.
- The shortcuts overlay (`HelpOverlay.tsx`).
- Empty-state coaching copy.
- `README.md`.
- Internal planning docs, which aren't user-facing.

As a result:
- Concepts such as ports and contracts, transforms, releases, replay, datasets, policies, GenUI and agents have no single explanation.
- There's no searchable help.
- Chat doesn't know how the product works.

**Design.**
- **One content source:** Markdown articles under `apps/studio/content/kb/`.
  - Frontmatter: `id`, `title`, `summary`, `related`, `keywords`.
  - One article per concept, node type, edge kind, panel and resource kind.
  - `taxonomy.ts` becomes generated from, or checked against, these articles, so the two can't disagree.
- **Where it shows up:**
  - Tooltips and "Learn more" links by id.
  - A searchable Help panel (a global workbench panel).
  - Command-palette entries ("Help: Transforms").
  - Empty states and diagnostic messages ("What's a contract warning?").
- **Chat:** the backend serves the knowledge base, and `chat_context.py` adds the relevant articles to the context.
- **Keeping it consistent:** a coverage test, like the SDK's route-handler test, fails when a node type, edge kind, panel or resource kind has no article. Articles version with the code, so they can't drift from it.
- **Considerations:**
  - Keep articles short and task-oriented ("How do I…").
  - Link out to the SDK docs for API detail.

**Shipped 2026-10-01 (slice I):**
- **Content:** 46 short articles in `apps/studio/content/kb/*.md` (frontmatter `id`, `title`, `summary`, `category`, `keywords`, `related`; in-body `[label](kb:id)` links): guides, every node type, edge kind and resource kind, and every panel (`PANEL_ARTICLE` in `lib/kb.ts`; resource panels share their resource's article).
- **Build:** `pnpm kb` (`apps/studio/scripts/kb-build.mjs`) validates articles and links and writes one bundle for the studio (`content/kb.generated.json`) and a copy for the API (`backend/app/kb_articles.json`), since the API deploys on its own.
- **Consistency:** `lib/kb.test.ts` fails on a stale bundle or a node type, edge kind, panel, resource kind or diagnostic category without an article; `backend/tests/test_kb.py` checks node types and edge kinds on the API side. `content/taxonomy.ts` now derives node and edge tooltips (title, summary, opening paragraph) from the articles.
- **Where it shows up:** "?" opens Help (search, article reader with related links, and the Shortcuts tab). Help opens on an article from the node and edge inspector headers and Learn more, the edge kind field, each Run panel issue ("What's a contract issue?"), the Run and Graph config panel headers, and the command palette ("Help: …" once you type).
- **API and Chat:** `GET /api/kb[?q=]` and `GET /api/kb/{article_id}` (SDK `client.kb`). `chat_context.build_chat_prompt` adds up to three matching articles (plus the selected node's type) to the chat system prompt, marked as context, not instructions.
- **Found on the way:** the command palette (⌘K) threw on open: `CommandDialog` rendered cmdk parts without the `<Command>` root. Fixed in `components/ui/command.tsx`; `e2e/specs/help.spec.ts` now opens it.
- **Not done:** empty-state copy still lives inline; articles cover panels by mapping, and only the Run and Graph config panels (plus the inspectors) have a header help button so far.

## Follow-ups shipped 2026-10-01

- **Knowledge base, finished:** Releases, Routing lab, Knowledge, Policies, Health and Analytics get a title bar with a help button (`WorkbenchDrawer titleBar`); resource panels and the compact drawer get one beside their title. Empty states link to their article: the empty-graph coach, the Run panel before a run, Releases with none yet.
- **Canvas actions in ⌘K** (`components/graph/canvasCommands.ts`): the editor publishes its commands through the workbench graph context, read when the palette opens. Arrange (Align ×6, Distribute ×2, Auto-arrange), Canvas (Select all, Fit view, Snap, Focus mode, Add sticky note, Undo/Redo), View (Canvas/Code/Split, Overview/Layers/Heatmap) and Graph (Save, Validate, Run, Find, Export). A command that can't run yet is listed disabled with the reason ("Select two or more nodes").
- **Sticky notes with comments** (`GraphDefinition.notes`; `lib/notes.ts`, `nodes/StickyNote.tsx`, `NoteInspector.tsx`): add from the canvas menu, a node's menu (pinned to it) or ⌘K. A note has text, a color, an author, timestamps, an optional pinned node, a resolved flag and a comment thread. The author is the signed-in user's email, else a name saved in the browser. Notes are display-only: saved (document fingerprint, dirty check) but outside the semantic fingerprint and release diffs (pinned digests in the backend and SDK tests); a note whose node is deleted stays, unpinned. Edits are undoable; Delete removes the selected note.

## Notes polish shipped 2026-10-03

- **Pinned notes follow their node:** a drag, Align, Distribute or auto-arrange moves a pinned note by its node's change in position (`followPinnedNodes`). Loading, undo/redo and Apply set notes and nodes together and skip it, so a note never moves twice.
- **Notes panel** (graph-scope workbench panel, `NotesPanel.tsx`): every note, filtered Open, Resolved or All (newest activity first); clicking one shows notes, selects it and pans to it. **Show notes on canvas** hides or shows them (remembered per browser); hidden notes stay saved and listed.
- **Status bar:** "N open notes" opens the panel. ⌘K adds **Show all notes** and **Hide/Show notes on canvas**.
- Not done: @mentions (there's no user directory to resolve them against).

## Suggested slices

| # | Slice | Items | Priority | Impact |
| - | ----- | ----- | -------- | ------ |
| A | Quick bug fixes — **shipped 2026-09-30** | §3 hover fix; §10 focus mode as a local neighborhood with edges dimmed; §0 build SHA | P1 | High, small |
| B | Layout at laptop widths — **shipped 2026-09-30** | §8 canvas-width breakpoints, header priority collapse, status bar; §2 minimap sizing and overlay slots | P1 | High |
| C | Native context menu — **shipped 2026-10-01** | §3 Base UI menu engine and the actions registry | P1 | High |
| D | Console dock — **shipped 2026-10-01** | §6, on the status bar from B | P2 | Medium |
| E | Tool bar and palette — **shipped 2026-10-01** | §4 tools, registry-driven palette, drag-and-drop | P2 | High |
| F | Snapping and alignment — **shipped 2026-10-01** | §9 smart guides, align/distribute, snap everywhere | P2 | Medium |
| G | Edge styles — **shipped 2026-10-01** | §7, with the fingerprint change | P2 | Medium |
| H | Code mode — **shipped 2026-10-01** | §5 CodeMirror, Canvas/Code/Split, Save | P2 | Medium |
| I | Knowledge base — **shipped 2026-10-01** | §11 content, Help panel, coverage test, Chat grounding | P2 | High |

Slice B's status bar is the shared seam: it gives D (console), E (active tool),
F (snap toggle) and §1 (summary facts) a home. Do B before those.
