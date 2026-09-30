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
- **Follow-up:** show the build's short commit SHA in the Help overlay and in `GET /api/health`, so a stale deploy is visible from a screenshot.

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

## 3. Right-click menu: native behavior and more actions

**Bug RCA: no hover highlight.**
- Menu items get `className="agb-menu-item"` plus an inline style with `background: "transparent"` (`itemStyle` in `NodeContextMenu.tsx`).
- The hover and focus rule `.agb-menu-item:not(:disabled):hover, .agb-menu-item:focus-visible { background: rgba(255,255,255,0.06) }` in `app/globals.css` has no `!important`.
- An inline style beats a class rule, so hover and keyboard focus never change the background.
- The sibling rule `.agb-hoverable` works because it does use `!important`.
- Measured: the hovered "LLM node" item's computed background is `rgba(0, 0, 0, 0)`.
- **Fix:**
  - Drop `background` from the inline style, or add `!important` to the rule.
  - Raise the tint: 6% white barely shows on `surface.panel`.

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

## Suggested slices

| # | Slice | Items | Priority | Impact |
| - | ----- | ----- | -------- | ------ |
| A | Quick bug fixes | §3 hover fix; §10 focus mode as a local neighborhood with edges dimmed; §0 build SHA | P1 | High, small |
| B | Layout at laptop widths | §8 canvas-width breakpoints, header priority collapse, status bar; §2 minimap sizing and overlay slots | P1 | High |
| C | Native context menu | §3 Base UI menu engine and the actions registry | P1 | High |
| D | Console dock | §6, on the status bar from B | P2 | Medium |
| E | Tool bar and palette | §4 tools, registry-driven palette, drag-and-drop | P2 | High |
| F | Snapping and alignment | §9 smart guides, align/distribute, snap everywhere | P2 | Medium |
| G | Edge styles | §7, with the fingerprint change | P2 | Medium |
| H | Code mode | §5 CodeMirror, Canvas/Code/Split, Save | P2 | Medium |
| I | Knowledge base | §11 content, Help panel, coverage test, Chat grounding | P2 | High |

Slice B's status bar is the shared seam: it gives D (console), E (active tool),
F (snap toggle) and §1 (summary facts) a home. Do B before those.
