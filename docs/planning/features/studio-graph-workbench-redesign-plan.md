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
> Wave 2 shipped 2026-09-23 ([STO-603](https://linear.app/stockwise-productions-prototypes/issue/STO-603)).
> Waves 3–4 are open backlog:
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

## Wave 2: IA + selection model — shipped ([STO-603](https://linear.app/stockwise-productions-prototypes/issue/STO-603))

Review §7, §25, §29–31, §36–38, §62–64.

### What shipped

**Graph/node analytics backend (`backend/app/node_analytics.py`)**
- `GET /api/graphs/{id}/analytics?window=` rolls up a graph's recent runs:
  - run counts, success rate, P95 run latency, token and spend totals;
  - per node: executions, success rate, avg and P95 latency from the node's own trace timestamps, and the last run and last error;
  - nodes are sorted slowest first, so slow nodes are easy to identify.
- `GET /api/graphs/{id}/nodes/{node}/history` lists a node's recent executions.
- Aggregation is pure (`build_graph_analytics`, `build_node_history`) with 6 tests. The SDK gained `getGraphAnalytics` and `getNodeHistory` with typed schemas.

**NodeInspector History tab (`NodeHistoryTab.tsx`)**
- Shows success, executions, avg and P95 latency, and the recent executions.
- Clicking a row paints that run onto the canvas.
- It refetches when a run finishes.

**Graph-scoped Analytics panel**
- With a graph open, the panel defaults to **This graph**: stat cards and a per-node table, with **Workspace** one toggle away.
- A node row focuses the node and opens its History tab. A "run" link inspects that run.
- Unhealthy nodes (success rate under 80% with failures) are flagged.
- Workspace rows link to their graph.
- The panel navigates back into the graph through two new `StudioGraphContext` actions, `focusNode` and `inspectRun`.

**URL state (`lib/graphUrlState.ts`)**
- The graph route mirrors `?node`/`?tab` or `?edge`, `?run` and `?panel` via `history.replaceState`, so a reload or a shared link restores the exact context.
- `?section` is one-shot: it reveals a Run panel section, then drops.
- Deep links wait out the load-time fit before panning.
- A deep link's panel or selection wins over the default-open Run panel.

**Runs retired as a destination**
- RunPanel run history gained multi-select and "Save N as dataset", which opens the existing `CaptureDatasetDialog`, rendered by GraphEditor because it's shadcn.
- The event log's node events are clickable and focus the node.
- `/runs` redirects to `/graphs`.
- `/runs/{graphId}` redirects to `/graphs/{graphId}?panel=run&section=observe-history`.

**Navigation**
- A 72px icon rail (Graphs · Resources · Analytics) with a compact account menu replaces the 240px, nine-item sidebar.
- A new `/resources` hub (discovery cards).
- A resource-type tab strip on every resource page.
- The mobile sheet lists the resource types under Resources.
- The command palette groups follow suit, and Runs is gone.

**Found in visual QA and fixed**
- Canvas selection now mirrors programmatic selection. Diagnostics, waterfall, event-log, analytics and deep-link focus previously set our selection state but not React Flow's `selected` flag, so the selection ring and NodeToolbar never appeared for them.
- Floating workbench panels are opaque. The docked dock's text bled through the 82% glass.
- The inspector's tab strip scrolls instead of clipping its sixth tab.
- "Run with fixture" is collapsed by default. Expanded, it squeezed the Observe region (status, history) to about 100px.
- Section reveal scrolls after layout settles.

### Acceptance criteria
- [x] Nav is an icon rail, and resources are grouped under one entry (`studio-nav.test.tsx`).
- [x] Reloading or sharing a URL restores the selected node, run and panel (`graphUrlState.test.ts`, plus the Playwright deep link `?node=llm_classify&tab=history`).
- [x] A node's recent runs and metrics are visible from its inspector (`NodeHistoryTab.test.tsx`, verified live).
- [x] The analytics panel scopes to the open graph, and metric rows navigate (`AnalyticsPanel.test.tsx`; live: a row click focused the node and updated the URL).
- [x] Nothing is available only on `/runs`: dataset capture, snapshots and history all live in the Run panel, and the pages redirect (live: the redirect landed on Run history, and the capture dialog opened with 2 selected runs).
- [x] Run events focus their nodes (live: an event-log click focused `llm_classify` and updated the URL).

**Verification**
- Studio: `vitest` 193/193.
- Backend: 434/434.
- SDK: 97/97.
- `tsc` and `eslint` clean (one pre-existing warning).
- Root build passes.
- Playwright on a live stub backend: resources hub, prompts with tabs (desktop and mobile), deep-link History, graph-scoped analytics plus row click, `/runs` redirect, dataset dialog, and event-log focus.

**Not in wave 2:** `/analytics` stays as the workspace-wide page (the rail's Analytics entry). It's a legitimate cross-graph view, not duplicated graph context.

## Wave 2.5: Inspector & Run console v2 — shipped ([STO-606](https://linear.app/stockwise-productions-prototypes/issue/STO-606))

Waves 1 and 2 redesigned the header, the nodes, the rail and analytics. The two right-side panels, `NodeInspector.tsx` and `RunPanel.tsx`, still looked like the pre-redesign baseline. This wave brings them up to the same level. The user decided it should be its own wave, and that the Run console gets one field per input variable.

### Problem audit

- **Contrast.** Inputs used `surface.raised` with a near-invisible border, about 1.2:1 against the panel. Helper text was dimmed with `opacity: 0.6`.
- **Layout.**
  - Both panels were one flat accordion.
  - In the Run panel, Run sat below a textarea, a provider select and a paragraph of explanation.
  - Compile, Validate and Run carried equal weight.
  - The inspector kept Duplicate and Delete at the bottom.
- **Icons.** There were almost none. What there was: seven 44px ⓘ buttons in the inspector and three in the Run panel.
- **Inputs.** Native `<select>` and raw textareas everywhere. The run input was hard-coded to `{question}`, even for graphs whose input nodes read other variables.

### What shipped

**Foundations** (`lib/graph-theme.ts`, `components/graph/ui/`)

- **New tokens:**
  - `surface.inset`: input wells, darker than the panel.
  - `surface.card`: field groups.
  - `border.subtle`, `border.default` and `border.focus`. `default` is 3.54:1 on `inset`, which meets WCAG 1.4.11.
  - `text.secondary`: a real `#aab0bc`, about 8:1 on the panel, replacing opacity dimming.
  - `control.height`.
- **`fields.tsx`** restyled onto those tokens: 36px controls, a focus ring, and a visible placeholder. Every existing call site picks this up.
- **New primitives, each with RTL tests:**

  | Primitive | Behaviour |
  | --- | --- |
  | `Field` | Label, hint glyph, meta slot, and the field's own diagnostics inline, with remediation. |
  | `Group` | Card with an uppercase caption. |
  | `Toggle` | `role="switch"`. |
  | `NumberStepper` | Stepper input. |
  | `SegmentedControl` | Radiogroup with arrow keys. |
  | `IconTabs` | Icon + label + count badge, with arrow/Home/End keys. |
  | `Combobox` | Searchable, grouped, keyboard-driven, optional custom value. |
  | `PanelFrame` / `PanelHeader` | Sticky header, tabs and footer around a scrolling body. |
  | `TemplateEditor` | See below. |

- **`TemplateEditor`** has no dependency. It overlays a transparent textarea on a mirrored backdrop:
  - `{var}` tokens are highlighted, known ones in accent and unknown ones in warning;
  - typing `{` opens autocomplete;
  - ⌘/Ctrl+↵ submits;
  - an expand dialog;
  - a `plain` mode for free text.
- **Retired:** `ui/Tabs.tsx`, `useExclusiveCollapse` and the observe-accordion constants.

**Node Inspector v2** (`NodeInspector.tsx`)

- **Header** (in `PanelFrame`):
  - a type chip, using the shared `nodeTypeIcons.ts` map;
  - an **inline-editable name**;
  - a sub-line with type, id, last-run status and an issue count;
  - actions: Run from here, Duplicate, and ⋯ (Open Run panel, Delete node).

  The bottom Duplicate/Delete buttons are gone.
- **Tabs** are `IconTabs`: Config, I/O, Policy, Run, History and Raw. I/O and Policy show count badges.
- **The Config tab is grouped into cards**, one per concern:
  - Model uses `ProviderModelPicker`, which is now two comboboxes with provider dots and a loading skeleton.
  - Prompts use `TemplateEditor`.
  - The tool is a combobox of built-ins plus the registry.
  - Routes use a `SegmentedControl` for the edge kind plus a match input.
  - Guardrail and rubric settings are `Toggle`s, and max iterations is a `NumberStepper`.
  - The code language is a segmented control.
- **Inline diagnostics.** `lib/diagnostics.ts` `partitionDiagnosticsByField` sends each issue to the field it names (the `"node 'x': field: msg"` format, plus code-based routes and tool mappings). Anything unmatched stays in a compact banner.
- **Edge inspector** also moved to `PanelFrame`: a segmented kind control and a Config/Raw tab.
- **Dock width.** The desktop selection dock went from `w-80` to `w-96`, matching the Run console.

**Run console v2** (`RunPanel.tsx`)

- **One field per input variable.** `lib/runInputs.ts` `runInputVariables(nodes)` returns the input nodes' distinct `variableName`s, falling back to `question`.
  - Each field is a `plain` `TemplateEditor` with a **Recent** menu drawn from run history.
  - ⌘↵ from any field runs.
  - `onRun` and `onRunFromNode`, and `GraphEditor.runGraph`, now carry `Record<string, string>`; it used to be `{ question }`.
  - No backend change was needed. `compute_input` already reads `raw_input[variableName]`, and a new runtime test proves two input nodes each get their own value.
- **Header.** A "Ready / N errors" status that opens Issues, and a **provider chip** (dot + model). The chip reveals a Model card with the provider/model comboboxes and the API-key field.
- **Sticky action bar.**
  - A primary **Run** with a ⌘↵ hint and a spinner.
  - A secondary **Validate**.
  - A ⋯ menu: Compile, Debug run, Run from selected node, and Run with fixture…
- **Observe is now `IconTabs`:** Status, Waterfall, Trace, Events (count), History (count) and Issues (count, coloured by severity).
  - Status is a result card: status pill, duration, provider, the run's inputs, and the output or error.
  - History rows show all of a run's inputs (`formatRunInputs`).
  - The fixture simulator is a closable card that defaults its input JSON to the console's current values.
- **Legacy section ids** (header Run▾, the Validate chip, `/runs` redirects, `?section=`) map to tabs through `observeTabForSection`. `run-simulate` opens the fixture card. The diagnostics focus target wraps Observe, and focusing it opens Issues.
- **"Inspecting an earlier run" banner.** It only shows for a run picked from history. The run you just started is also "inspected" so the canvas shows its traces, but it isn't called out.

### Acceptance criteria

- [x] **Inputs meet 3:1 non-text contrast, and helper text uses a real colour.**
  - `border.default` is 3.54:1 on `inset`. `text.secondary` is about 8:1.
  - Playwright computed styles: unselected tab `rgb(170,176,188)`.
- [x] **The inspector header carries the identity and actions, and there is no bottom Delete** (`NodeInspector.test.tsx`).
- [x] **Diagnostics render under their field** (`diagnostics.test.ts` `partitionDiagnosticsByField`).
- [x] **Selects are searchable comboboxes, and booleans, numbers and enums use purpose-built controls** (`primitives.test.tsx`).
- [x] **Templates highlight known and unknown variables and autocomplete them** (`templateEditor.test.ts`). Live: `{topic}` and `{audience}` were known, `{tone}` unknown, and `{au` suggested `{audience}`.
- [x] **The Run console renders one field per input variable, and ⌘↵ sends them all** (`RunPanel.test.tsx`; backend `test_each_input_node_reads_its_own_run_input_variable`). Live: the backend run input was `{"topic": "TCP handshakes", "audience": "ten-year-olds"}`.
- [x] **Observe is tabbed with counts, and legacy section ids still land** (`RunPanel.test.tsx`).

### Verification

- **Studio:** `vitest` 217/217. (2 tests were removed along with the dead `nextExclusiveOpenId`.)
- **Backend:** 435/435.
- **Other gates:** `tsc` clean, `eslint` 0 errors (3 pre-existing warnings), root build passes.
- **Playwright on a live stub backend** (desktop 1440×900 and mobile 390×844):
  - demo graph: LLM and router inspectors;
  - a seeded two-input graph (`topic` / `audience`): Run console fields, ⌘↵ run, result card, model card, History, prompt highlighting and autocomplete.

**QA fixes made during the pass:**

- The Observe and inspector tab strips overflowed. History is now icon-only with a count, and the dock is wider.
- The empty-state copy wrapped around the bold "Run".
- The "past run" banner showed for fresh runs.
- The derived node title placeholder read as a hint.
- `ProviderModelPicker` refetched the catalog, and reset a custom model, on every model change.

## Wave 3: Motion + accessibility — shipped ([STO-604](https://linear.app/stockwise-productions-prototypes/issue/STO-604))

Review sections 52–57, 73 and 80, audited 2026-09-23.

### What shipped

- **Drawers slide both ways.**
  - `hooks/usePresence.ts` keeps an element mounted through its exit animation.
  - `WorkbenchDrawer` uses it, so compact drawers slide in from their edge and back out, and the backdrop fades. Before, `ShellDrawer` returned `null` the instant it closed, so its transition never ran.
  - Floating panels scale from their top corner.
  - Docked panels fade and slide in on open, but unmount at once on close. The canvas reflows into their width, and animating that would be a layout shift.
- **Menus emerge from their trigger.**
  - `NodeContextMenu` and `ConnectKindMenu` scale in from a `transform-origin` set at the anchor point, even when the menu is nudged to stay inside the viewport.
  - The same applies to the `Combobox` popover (bottom origin when it flips above) and the Tailwind `GraphSwitcherCombobox` (`animate-in zoom-in-95`).
  - Tooltips fade in, and the expanded template editor floats up over a fading backdrop.
- **Escape closes the active panel.** `WorkbenchProvider` handles it for every workbench panel, but only when no menu, listbox or non-panel modal dialog is open (`hasOverlayOwningEscape`), and only if no handler has already consumed the key. The old `useShellLayout` Escape only closed the unused `openDrawer`, and `HelpOverlay` had its own copy, which is now gone.
- **Focus returns to the opener.**
  - The provider tracks the last focus outside any panel or menu, so a panel opened from a menu item returns focus to the menu's trigger.
  - It also covers panels that were already open on load.
  - Both menus now hand focus back to their trigger when they close.
- **Focus trap.** `hooks/useFocusTrap.ts` gives initial focus (`data-autofocus`, otherwise the first focusable element) and keeps Tab cycling inside, then restores focus on close. It's used by `ShellDrawer` (initial focus on its close button), `HelpOverlay` and the expanded `TemplateEditor`.
- **Reduced motion.** A global, unlayered `prefers-reduced-motion` rule collapses every animation and transition, inline ones included. `lib/motion.ts` `scrollBehavior()` handles the explicit smooth `scrollIntoView` calls, which CSS can't override. Canvas `fitView`/`setCenter` already honoured `reducedMotion`. This replaces the plan to pass `reducedMotion` to each panel.
- **Visible focus everywhere.** A zero-specificity `[data-graph-surface] :where(button, a, input, select, textarea, tab, menuitem, option, [tabindex]):focus-visible` ring. It is set on the GraphEditor root, the workbench panels, the drawers, menus and portaled popovers. shadcn controls (`data-slot`) and controls with their own focus treatment (`.agb-field`, inline `outline: none`) keep theirs.
- **Styling-rule fix.** `ShellDrawer`'s close control is the graph kit's `IconButton`; it used to be shadcn's `Button`.
- **Dead CSS removed:** the `graph-editor-canvas-*` keyframes and `-glow-*` classes.

### Acceptance criteria

- [x] **Drawers slide, dialogs float, and menus originate from their triggers.**
  - `usePresence` test.
  - Playwright: the mobile drawer runs `agb-drawer-in-right`, and `data-closing` shows mid-exit.
  - Playwright: the header Run▾ menu runs `agb-pop-in` with its origin at the trigger.
- [x] **Escape closes the active panel and focus returns to its trigger.**
  - Provider test.
  - Playwright: header Run▾ → Run controls → Esc closed the Run console and focus landed on "Run options".
  - Esc inside an open provider combobox closed only the combobox. Esc closed the Help overlay.
- [x] **`prefers-reduced-motion` disables every transition.** Playwright `reducedMotion: "reduce"`: the drawer's `animation-duration` computes to `1e-05s`.
- [x] **Every interactive graph control has a visible focus ring.**
  - Playwright: an inspector tab and an unclassed React Flow "Zoom In" button both compute `outline: solid rgb(143, 186, 255)` on keyboard focus.
  - Drawer focus trap test.

### Verification

- **Studio:** `vitest` 222/222.
- **Other gates:** `tsc` clean, `eslint` 0 errors (3 pre-existing warnings), root build passes.
- **Backend:** no changes.
- **Playwright on a live stub backend,** desktop 1440×900 and mobile 390×844, plus a reduced-motion context.

## Wave 4: Resource binding + inspector consolidation — shipped ([STO-605](https://linear.app/stockwise-productions-prototypes/issue/STO-605))

Shipping in two PRs, per a user decision:

- **4a:** binding, validation, "used by", and opening a resource from its node. Shipped.
- **4b:** one config-driven resource inspector replacing the five duplicated `app/*/page.tsx` shells and the copied forms in `resourceFormConfigs.tsx`. Shipped.

### Wave 4a: resource binding — shipped

**Semantics** (user decision): a binding is a **live reference, frozen on release**.

- Draft runs read the resource's current content.
- Publishing a release (and every run snapshot) captures it in `resource_snapshots`.

This is the contract tool bindings already had. Editing a bound prompt changes the draft's semantic fingerprint, because snapshots feed it.

**Bindings** (single source of truth: `backend/app/bindings.py` `BINDING_FIELDS`):

| Node | Field | Registry | Effect |
| --- | --- | --- | --- |
| prompt | `promptId` | prompts | Resource `body` replaces the inline `template` |
| llm, tool_loop | `llmProfileId` | llm_profiles | Resource `model` becomes the node model; the run-level model override still wins |
| llm, tool_loop | `systemPromptId` | prompts | Resource `body` replaces the inline `systemPrompt` |
| tool | `toolName` | tools | Existing binding; now also covered by "used by" and Open |

**Backend**

- `node_bindings(node)` is the only walker. Every consumer uses it:
  - **Compiler** (`compiler.py`): an unresolved non-tool binding is `UNRESOLVED_RESOURCE_BINDING` (blocking). Its message has the field-diagnostic shape, `"<type> node '<id>': <field>: <kind> '<rid>' not found"`, and includes a remediation. The Studio renders it under the field with no mapping code. Tools keep `UNSUPPORTED_TOOL_BINDING`.
  - **Executors** (`nodes.py`): `_prompt_template`, `_system_prompt` and `_node_model` resolve through the release-aware `_resolve_resource`. A resource deleted mid-run raises instead of silently falling back to stale inline config.
  - **Snapshots** (`releases.py` `resolve_resource_snapshots`): every binding kind, including the tool → MCP server hop. Runtime, replay and simulate pick this up automatically.
  - **"Used by"** (`main.py`): `GET /api/{kind}/{id}/usages` → `ResourceUsage[]`, one per bound node across stored graphs. For MCP servers it also returns tool-bound nodes that reach the server through their tool (`via: "tools:<id>"`).

**SDK**

- `resourceUsageSchema` and `ResourceUsage`, plus `client.<kind>.usages(id)`.
- `bindings.ts`: `NODE_BINDING_FIELDS`, `nodeBindings()` and `RESOURCE_KIND_PATH`.
- `contract/node-bindings.json` is the cross-language contract. `bindings.test.ts` and `test_resource_bindings.py` both assert against it.

**Studio**

- **`ResourceBindingField`** (token-styled): an **Inline / Library** segmented switch per bindable field.
  - In Library mode: a registry combobox, a **Not found** flag, a read-only preview (a prompt shows `{var}` highlighting; a profile shows `model · provider`), and **Open**.
  - Switching back to Inline clears the reference. The inline value was never touched.
- **Open without leaving the canvas.** `onOpenResource` → `workbench.open(<panel>, { resourceId })`. `ResourceBrowserPanel` reads that context and opens the resource's editor directly.
- **Live updates.** Saving or deleting in `useResourceList` emits `agb:resource-changed` (`lib/resourceEvents.ts`). Binding pickers and node-card names refetch, so the node's preview shows the edit at once.
- **"Used by"** (`ResourceUsageList`, in the resource editor): a row in the open graph focuses its node through `graphContext.focusNode`; a row in another graph opens `/graphs/<id>?node=<nodeId>`.
- **Node cards.** A bound node is titled by its resource's name (unless the user named it), carries a library glyph, and reads "Library prompt" or "LLM profile" in its summary. `ResourceNamesProvider` is loaded only when the graph has library bindings. The inspector header uses the same title.

### Wave 4a acceptance criteria

- [x] **Nodes reference registry resources, validated by the backend.**
  - `test_resource_bindings.py`, 8 tests:
    - bound prompt, system prompt and profile are applied;
    - the run-level override wins;
    - a field-scoped missing-binding error;
    - inline nodes are unaffected;
    - a release freezes the resource while drafts follow edits;
    - an unresolved binding blocks the release;
    - usages, including MCP `via`;
    - the SDK contract.
  - Live: the bound prompt body and the profile model `stub-fast` reached the run trace.
- [x] **Every resource shows the graphs and nodes that use it.** Usages API plus `ResourceUsageList`. Live: "Used by · 1 — Classify & Route (demo), prompt_classify · prompt template".
- [x] **A bound resource can be inspected and edited from its node without leaving the canvas.**
  - `ResourceBrowserPanel.test.tsx` and `ResourceBindingField.test.tsx`.
  - Live: Open → the Edit prompt dialog opened over the canvas (URL stayed on the graph), Save updated the node preview immediately, and the next run used the edited body.
- [x] **One inspector framework handles all resource types, and the duplicated page shells are removed.** See Wave 4b below.

### Verification

- Backend: 443/443 (8 new).
- SDK: 100/100.
- Studio `vitest`: 228/228.
- `tsc` clean; `eslint` 0 errors (3 pre-existing warnings).
- Root build passes.
- Playwright on a live stub backend: bind, save, run, Open/edit/re-run, "Used by", the inline unresolved-binding error, and mobile.

**Not in 4a:**
- Pinning a binding to a specific resource version (the user chose live references).
- GenUI, which has no backend resource.
- Per-node provider from `LlmProfile.model_provider`. The provider is still chosen per run (`runtime.py`), as before.

### Wave 4b: resource inspector consolidation — shipped

**The problem it fixes**

- Five near-identical page shells, `app/{prompts,tools,agents,mcp,llm-profiles}/page.tsx`. Each was 240–290 lines of the same header, card list, Dialog form, delete confirm and version history.
- A second copy of every form in `components/workbench/resourceFormConfigs.tsx`, used by the workbench panels.
- "Used by" existed only in the panel.
- There was no way to deep-link to one resource.
- The panel's titles came out as "Edit mcp server" and "llm profile".

**What replaces it**

- **`components/studio/resource-kinds.tsx`** holds one `ResourceKindConfig` per registry. Each config contains:
  - client, route and panel id;
  - noun (singular, e.g. "prompt") and panel title (plural);
  - the page's existing title, description, dialog description, empty text and delete message, moved over word for word;
  - card header and body renderers;
  - `emptyForm`, `toForm`, `normalize` and `renderFields`.

  Field ids come from a per-editor `useId`, so a page editor and a panel editor can be on screen together without duplicate ids.
- **`components/studio/resource-editor-dialog.tsx`** is the one editor, with three tabs:
  - **Overview:** the fields, kept mounted so unsaved edits survive switching tabs.
  - **Usage:** Wave 4a's `ResourceUsageList`.
  - **History:** `ResourceVersionHistory`.

  A new resource shows Overview only.
- **`hooks/use-resource-editor.ts`** holds the editor and delete state shared by the page and the panel. It also covers:
  - `openEdit(item, tab)`;
  - a delete confirmation that now warns when graphs still use the resource ("Used by N nodes in M graphs; they will fail validation until rebound").
- **`components/studio/resource-page.tsx`** is the generic full page:
  - `?id=<id>` opens that resource's editor, and `&tab=usage|history` opens a tab.
  - It reads `window.location` rather than `useSearchParams`, so the pages stay statically rendered.
  - Each `app/*/page.tsx` is now a 3-line mount: `<ResourcePage kind={promptKind} />`.
- **`ResourceBrowserPanel`** now takes `kind` and reuses the same hook and editor.
  - Opening it from a bound node (`{ resourceId }`) still goes straight to that resource's editor.
  - "Open full page" deep-links to `?id=` for the resource being edited.
- **`studio-shell.tsx`** mounts the five drawers by mapping over `RESOURCE_KINDS`.
- **`resourceFormConfigs.tsx`** is deleted. Net effect: about 1,900 lines of page and form duplication removed.

**Behaviour changes**

- The panel's dialog titles read "Edit MCP server" / "Edit LLM profile".
- Every editor has Usage and History tabs.
- Editing a tool no longer drops its `mcp_server_id` / `mcp_tool_name`, which the form doesn't expose. Both old copies used to rebuild the tool from the visible fields only.
- `app/genui/page.tsx` is left as it was: a static showcase with no backend resource.

**Wave 4b acceptance criteria**

- [x] **One framework handles all five resource types, and the duplicated shells and forms are removed.**
  - `resource-kinds.test.tsx`: validation and round-trips, the tools' JSON leniency and kept MCP binding, agents' elements.
  - `resource-page.test.tsx`: 13 tests.
    - For every kind: the page copy, card content, "New {noun}", and the Overview/Usage/History editor.
    - `?id=&tab=`.
    - The delete-in-use warning.
    - The create flow.
  - `app/tools/page.test.tsx` passes unchanged.
- [x] **Every resource shows where it is used.** The Usage tab is on the pages and in the panels. Live: `/prompts?id=p_classify&tab=usage` listed the demo node.
- [x] **A bound resource is editable from its node without leaving the canvas.** Live check:
  1. Open, then the Usage tab.
  2. Clicking the row closed the editor and selected `prompt_classify` in place.
  3. "Open full page" pointed to `/prompts?id=p_classify`.

**Verification**

- Studio `vitest` 245/245, `tsc` clean, `eslint` 0 errors (3 pre-existing warnings).
- Backend 443/443 and SDK 100/100 (both unchanged).
- Root build passes.
- Playwright on a live stub backend covered:
  - all five pages, with the same headings and card content as before;
  - the deep link to the Usage tab;
  - the History and Overview tabs;
  - the delete warning;
  - the "Edit MCP server" title;
  - canvas → Open → Usage → focus the node;
  - mobile.

## Wave 5: Mobile tab bar — shipped ([STO-607](https://linear.app/stockwise-productions-prototypes/issue/STO-607))

One shared component, `components/navigation/mobile-tab-bar.tsx` (`MobileTabBar`).

- **Styling.** Plain Tailwind + lucide, with no shadcn imports, so the token-styled graph route can use it too.
- **Layout.** Fixed to the bottom, 64px (`MOBILE_TAB_BAR_HEIGHT`) plus the safe-area inset. Each tab is an icon over its label, with a pill behind the active icon. Targets are at least 44px.
- **Semantics.**
  - Link tabs set `aria-current="page"`.
  - Toggle tabs set `aria-pressed`.
  - Popup tabs set `aria-haspopup` / `aria-expanded`.
- **Global tabs** (`studio-shell.tsx`, below `md`, not on the canvas route): **Graphs · Resources · Analytics · Chat · More**.
  - The first three tabs derive from `STUDIO_RAIL_ITEMS` / `isRailItemActive`, so Resources is current on `/prompts`, `/tools` and the other resource pages.
  - Chat toggles the workbench chat drawer.
  - More opens the existing nav sheet. The top-bar hamburger is gone.
  - `main` gets bottom padding so the last item clears the bar.
  - The landmark is labelled "Studio tabs", distinct from the rail's "Studio".
- **Canvas tray** (`GraphEditor.tsx`, `workbench.isCompact` = below 1100px): **Graphs · Add · Run · Chat · More**.
  - Add and Run show as pressed while their drawers are open.
  - More opens a `NodeContextMenu` with Focus mode, Releases, Routing lab, Knowledge, and Shortcuts & gestures. It opens above the tray (the new `bottomReserve` prop).
  - The graph switcher stays in the graph header.
  - Drawers (z-50) and the selection dock (z-40) sit over the tray (z-30). The dock already reserves 96px at the bottom.

**Verification**

- Studio `vitest` 263/263 (new `mobile-tab-bar.test.tsx`), `tsc` clean, `eslint` 0 errors.
- Backend 444/444.
- Root build passes.
- Playwright on a live stub backend:
  - **390×844:**
    - Graphs, Resources and Analytics are current on their routes.
    - Chat shows as pressed and opens the drawer.
    - More opens the sheet.
    - There is no hamburger.
    - The last list item sits above the bar.
    - On the canvas, the global bar is absent and the tray is visible.
    - Add and Run show as pressed.
    - The More menu lists all five items. Its bottom is at 770 and the tray top at 779.
    - Focus mode toggles to checked.
    - The node dock sits over the tray.
  - **820×1180:** the global bar is hidden (the rail shows) and the canvas tray works.
  - **1440:** no bar and no tray; unchanged.

## Related docs

- [studio-ux-gap-remediation-plan.md](studio-ux-gap-remediation-plan.md): diagnostics, waterfall and Chat items from the same review.
- [studio-shell-ux-gap-analysis.md](studio-shell-ux-gap-analysis.md): Phase 10, the shell remediation this builds on.
- [roadmap.md](../roadmap.md): Phase 11.
