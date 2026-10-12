# Canvas-first landing: plan

Status: **Approved 2026-10-12, §9 defaults accepted as written. Phase 1 next.** Builds on #173 (panel close, `/graphs` scroll, demo de-duplication).
Supersedes the navigation parts of [studio-graph-workbench-redesign-plan.md](studio-graph-workbench-redesign-plan.md) Wave 2 (the 72px rail and the `/resources` hub). Everything else in that plan stands.

## 1. Goal

The canvas is the app. `/` opens a graph, not a list. Pages that duplicate a workbench panel are removed, and their URLs redirect to the panel. Choosing a graph happens in a modal over the canvas, as in Figma's file browser.

This plan is mostly a list of deletions and redirects. Most of the replacements already exist:

| Already shipped | Where |
| --- | --- |
| A panel for each of the 8 resource registries, using the same editor as the pages | `RESOURCE_KINDS` → `ResourceBrowserPanel` + `ResourceEditorDialog` (Wave 4b) |
| A global Analytics panel with graph and workspace scopes | `components/workbench/panels/AnalyticsPanel.tsx` |
| A graph-level Policies panel | `components/graph/PolicyPanel.tsx` |
| Quick graph switching in the header | `components/graph/GraphSwitcherCombobox.tsx` |
| Run history moved off its own page | `/runs` and `/runs/:id` already redirect (STO-603) |
| Panel deep links | `?panel=` on the graph route (`lib/graphUrlState.ts`) |

## 2. What each route becomes

| Route | Today | Becomes | Missing before it can go |
| --- | --- | --- | --- |
| `/` | Redirects to `/graphs` | **Landing page**: reopens the last graph, or shows the empty canvas with the picker open (§3) | Picker modal |
| `/graphs` | Card list + demo gallery | Redirects to `/?open=picker` | Picker modal |
| `/graphs/:id` | Canvas | Unchanged. This stays the canonical, shareable URL | none |
| `/agents` `/prompts` `/tools` `/mcp` `/llm-profiles` `/transforms` `/datasets` `/eval-suites` | 3–11-line `ResourcePage` mounts | Redirect to `/?panel=<kind>[&id=…&tab=…]` | Panel parity check (§4) |
| `/resources` | Hub of discovery cards | Redirects to `/?panel=prompts`. The panels' kind tabs replace the hub | A kind switcher in the resource panel (§4) |
| `/analytics` | 252-line page | Redirects to `/?panel=analytics&scope=workspace` | `scope` query support in the panel |
| `/policies` | 433-line page: workspace defaults + all exceptions | Redirects to `/?panel=workspacePolicies` | New global panel (§4) |
| `/genui` | Read-only catalog of GenUI surfaces (`genui-library.tsx`) | Redirects to `/?panel=genui` | New global panel (§4) |
| `/runs`, `/runs/:id` | Redirects | Redirect to `/` and to `/graphs/:id?panel=run…` (the latter unchanged) | none |
| `/login`, `/auth/callback` | Auth | Unchanged | none |

Redirects stay in place permanently. They cost a few lines each, and links to these pages exist in old KB articles, chat transcripts and bookmarks.

## 3. Landing page and graph picker

**Landing (`/`):**
1. If `localStorage["agb:last-graph"]` names a graph that still exists, go to `/graphs/:id`, keeping any `?panel=` and related query params.
2. Otherwise, show the empty canvas with the picker open.
3. On the public demo, a first visit has no last graph, so it lands on the picker's Demos section.
- `GraphEditor` writes `agb:last-graph` whenever a graph loads. Wrap every storage read and write in try/catch, and fall back to step 2 when storage is unavailable.

**Picker modal ("Open graph"):**
- **Sections:** Recent (your graphs, newest first, searchable), Demos (the gallery, with tagline and node types), and **New blank graph**. Forking a demo on save covers "new from template", so there is no separate template entry.
- **Ways to open it:** the header's graph-name control (the combobox gains a **Browse all…** item); ⌘O; the mobile action bar's **Graphs** button; the empty canvas's call to action.
- **Closing:** Escape and click-outside close it. With no graph open, the empty canvas shows a centred **Open or create a graph** button, never a blank screen.
- **Delete:** only on your own graphs, behind the existing confirm dialog. Errors show inline (the behaviour from #173).
- **Styling:** shadcn `Dialog` + `Command`, like the command palette. Both are global dialogs rendered once by the shell, so this follows the "dialog reachable from the shell is shadcn" side of `apps/studio/AGENTS.md`. That file gains one line saying so.
- **Data:** the `/api/graph-summaries` + `/api/demos` loading and demo filtering from #173 move into a `useGraphLibrary()` hook shared by the picker and the combobox.

## 4. Panel gaps to close before any page is deleted

1. **Resource panel parity.** Check each `ResourcePage` feature against `ResourceBrowserPanel`:
   - scope narrowing ("narrows the list to the graph in scope, and remembers it")
   - `?id=&tab=` deep links
   - the warning when deleting a resource that graphs still use
   - create flow
   - the dataset and eval-suite case tables (`a11y.spec.ts` opens these)

   Port any gaps into the panel, then remove the panel's **Open full page →** link. Add a kind switcher (a select listing the 8 kinds) so one panel replaces the `/resources` hub.
2. **Resource panels dock on the canvas.** They float at `w-80` today. On the graph route they should reserve their column, the same as chat does after #173. The floating version is kept only for the empty-canvas landing.
3. **`workspacePolicies` panel (global).** Move the body of `app/policies/page.tsx` (workspace defaults + the exceptions list) into a component, used by the panel. The graph `PolicyPanel`'s "workspace policies" link opens it.
4. **`genui` panel (global).** Wraps the existing `genui-library.tsx`.
5. **Analytics scope from the URL:** `?scope=workspace`.
6. **New panel ids** need a `PANEL_ARTICLE` entry and a KB article (`lib/kb.test.ts` enforces this), plus a command-palette entry (automatic for `scope: "global"`).

## 5. Navigation after the rail

- **Remove** the 72px `StudioRail`, the mobile `ResourceTabs` strip, and the `MobileTabBar` on non-canvas routes. Once this ships, only `/login` is a non-canvas route.
- **Header app menu:** the graph header's existing `⋯` menu gains an **App** group: Open graph… (⌘O), Resources ▸ (the 8 kinds), Analytics, Workspace policies, GenUI catalog, Help, and the account menu (moved from `StudioAuthSection compact`).
- **Command palette:** "Jump to a page" entries become "Open panel" entries. Remove the route entries.
- **Mobile:** the canvas's compact action bar (Run · Chat · More) gains **Graphs**, and More lists the App group.

## 6. Phases (one PR each)

| Phase | Scope | Deletes nothing? |
| --- | --- | --- |
| 1. Landing + picker | `/` landing, `agb:last-graph`, picker modal, ⌘O, combobox "Browse all…", `useGraphLibrary()`. `/graphs` still exists | Yes |
| 2. Panel parity | §4 items 1–6 | Yes |
| 3. Redirect + delete | §2 redirects. Delete the page bodies, `resource-page.tsx` (if no longer used), `/resources`, rail, `ResourceTabs`, `MobileTabBar`'s non-canvas use, `studio-shell.tsx` page-layout branches | No: this is the deletion PR |
| 4. Tests + docs | e2e specs and a11y `PAGES` moved to panels; KB articles (`pnpm kb`); README/AGENTS route mentions; roadmap row | — |

Phases 1–2 can ship with no visible regression. Phase 3 is the only one that removes anything.

## 7. Acceptance criteria

1. Visiting `/` with a valid last graph opens `/graphs/<id>` with no visible intermediate list.
2. Visiting `/` with no last graph, or a deleted one, shows the canvas with the picker open. Seeded demos appear once each, in Demos.
3. From any graph, ⌘O or the header opens the picker; choosing a graph changes the route; Escape closes it.
4. Every removed route redirects to a panel showing the same data. Covered by one parameterized e2e spec over the §2 table.
5. With a resource panel open on the canvas, no node lies under it (the same check as #173's chat verification).
6. Workspace policies and the GenUI catalog are reachable from the header app menu and the command palette.
7. The a11y spec checks the picker and every new panel with no new serious violations. Its `PAGES` list contains only `/`, `/graphs/:id` and `/login`.
8. The production smoke test (`e2e/smoke/`, which opens `/graphs/demo_classify_and_route`) passes unchanged.

## 8. Tests that change

- **e2e:** 21 direct `page.goto` calls to resource, policies, analytics and genui pages (plus the a11y `PAGES` loop over nine more), across `a11y`, `agents`, `datasets`, `demo` (the `/policies` read-only check), `genui`, `mcp`, `panels`, `resource-forms`, `scope` and `transforms`. Each moves to `/?panel=…` or to opening the panel from the canvas.
- **Unit:** `resource-page.test.tsx` moves to the panel; `studio-nav.test.tsx` and `mobile-tab-bar.test.tsx` shrink or go; `policies/page.test.tsx` and `tools/page.test.tsx` move to their panels; `graphs/page.mock-api.test.tsx` becomes the picker test.

## 9. Decisions (accepted 2026-10-12)

| Question | Default | Why |
| --- | --- | --- |
| Reopen the last graph, or always show the picker on `/`? | Reopen last graph | Figma and VS Code reopen where you were. The picker is one ⌘O away |
| Canonical graph URL `/graphs/:id` or `/:id`? | Keep `/graphs/:id` | Shared links, the smoke test and every deep link already use it |
| Can the picker be dismissed with no graph open? | Yes, to an empty canvas with a call to action | Trapping users in a modal is worse than an empty state |
| Keep `/graphs` as a list for power users? | No, redirect | The picker's Recent section is the list. Two lists mean two places to fix bugs (see #173) |
| Do seeded demos stay out of Recent? | Yes, they're in Demos only | Same rule as #173 |

## 10. Out of scope

- Multi-graph tabs.
- Folders or tags in the picker.
- Thumbnails of graphs in the picker (possible later, rendered from the stored node layout).
- Changes to backend routes. `/api/graph-summaries` keeps returning demos, because subgraph pickers need them.
