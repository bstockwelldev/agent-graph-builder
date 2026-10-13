# Canvas styling: plan

Status: **Approved 2026-10-13, §8 defaults accepted as written. Nothing is built; PR 2 (the panels) is first.** Follow-up to [canvas-first-landing-plan.md](canvas-first-landing-plan.md) (§11), which removed the CRUD pages but left the shadcn surfaces that carried their look.

## 1. Goal

Nothing the user opens from the canvas should look like the CRUD pages that were removed. The graph picker and the empty canvas already use the canvas's own tokens (`lib/graph-theme.ts` and the graph UI kit in `components/graph/ui/`); this plan does the same for the surfaces that still use shadcn (Tailwind + `@base-ui/react`): the resource panels and their editors, workspace policies, the GenUI catalog, the Analytics cards, the command palette and the shared drawer chrome.

The rule this enforces is already in `apps/studio/AGENTS.md`: a component is token-styled or shadcn, never both, and the dividing line is the route. After #176–#178 the pages are gone, so every remaining surface renders on or over the canvas, and belongs on the token side.

## 2. What is still shadcn

A survey of `origin/master` after #179 found 29 non-test files that import `components/ui/*` (`GraphHeader.tsx` only names it in a comment). Counted by primitive: `Button` 21 files, `Select` 10, `Input` 9, `Label` 5, `Dialog` 5, `Card` 4, `Badge` 4, `Textarea` 3, `Tabs` 2, `Command` 2, `Table` 1, `ScrollArea` 1, `Collapsible` 1.

| Tier | Files | Lines | Surfaces |
| --- | --- | --- | --- |
| **A. The CRUD look** | ~18 | ~3.2k | `ResourceBrowserPanel`, `resource-editor-dialog`, `resource-kinds`, `resource-fields`, `agent-fields`, `mcp-server-fields`, `tool-source-fields`, `provider-model-fields`, `resource-version-history`, `scope-select`, `workspace-policies`, `genui-library` + `GenuiPanel`, `AnalyticsPanel` (its cards), `CommandPalette`, `WorkbenchDrawer`'s title bar, `PanelHelpButton`, `GraphSwitcherCombobox` |
| **B. Other shadcn panels** | ~9 | ~1.7k | `ChatPanel`, `ConsolePanel`, `HelpOverlay`, `ChatRunPicker`, `studio-confirm-dialog`, and the graph editor's dialogs (`capture-dataset`, `manage-layers`, `extract-subgraph`) |
| **Out of scope** | 3 | ~370 | `/login` (`login-oauth-buttons`) and `ai-elements/*`: separate surfaces, unrelated to the removed pages |

Tier B was never a CRUD page. It is out of scope (decision 1).

**Leverage.** Most of Tier A is a few base pieces, not 18 independent files. `resource-fields.tsx` (244 lines) is the field primitive that `dataset-fields`, `eval-suite-fields` and the others compose, so restyling it carries them. `studio-confirm-dialog` (64) and `scope-select` (40) are the same story. The risk is in the call sites, not the primitives.

## 3. What the canvas kit has, and what it lacks

Has: `Button` (primary / secondary / ghost / destructive), `IconButton`, `TextInput` / `TextArea` / native `Select` / `PasswordInput`, `Field`, `Combobox` (searchable, portaled, grouped, keyboard), `IconTabs`, `Toggle`, `SegmentedControl`, `CollapsibleSection`, `PanelFrame` / `PanelHeader`, `Skeleton`, `HoverTooltip`, and `Modal` (added with the picker).

Lacks, and what to do about each:

| Missing | Used by | Plan |
| --- | --- | --- |
| Card | Analytics, GenUI catalog, policies | Add `ui/Card.tsx` once PR 1 and PR 2 both need it |
| Chip / Badge | policies, GenUI, MCP fields | Promote the picker's local chip to `ui/Chip.tsx` |
| Confirm dialog | resource delete, the three editor dialogs | `ui/ConfirmDialog.tsx` on `Modal`, or inline like the picker's delete |
| Table | GenUI catalog only | **Keep local to the catalog.** One use is not a primitive |
| Command list | palette | Style `cmdk` directly with tokens; it is headless underneath |
| Checkbox | MCP, tool and agent fields | Check `Toggle` first |

A primitive joins the kit only when two surfaces need it.

## 4. Approach and phases (one PR each)

| PR | Scope | Notes |
| --- | --- | --- |
| **1. Kit + dialogs + forms** | The primitives from §3, `ResourceEditorDialog` onto `Modal` + `IconTabs`, `resource-fields` and every field file that composes it, `provider-model-fields`, `studio-confirm-dialog`, `resource-version-history`, `scope-select` | Most of the `Select` → `Combobox` churn lands here (§6) |
| **2. Panels** | `ResourceBrowserPanel`, `workspace-policies`, `genui-library` + `GenuiPanel`, the Analytics cards, `WorkbenchDrawer`'s title bar, `PanelHelpButton`, `GraphSwitcherCombobox` | The surfaces the user actually looks at |
| **3. Palette + chrome** | `CommandPalette` (Tier B is out of scope, decision 1) | `cmdk` is restyled in place |

PR 2 is the one that fixes what the user sees day to day. If only one ships soon, it is that one, with just the kit pieces it needs.

## 5. Where the files end up

Under the styling rule these become canvas-side, so they belong in `components/graph/`. Two options (decision 3): restyle in place first, then one mechanical "move to `components/graph/`" PR; or move as part of each PR. Moving mixes renames into a diff reviewers need to read as a restyle.

## 6. Risks

- **`Select` → `Combobox`.** shadcn's `Select` is compound children (`SelectItem`); the kit's `Combobox` takes an `options[]` array, so every call site changes shape. 18 e2e option-click steps and 16 unit files that assert shadcn roles change with it. The kit's e2e helper selects on `mousedown`; confirm a plain click also works before converting, or those specs will flake. Decision 2.
- **Visual regressions are invisible to unit tests.** Each PR needs a browser check at desktop and phone width, as the picker had.
- **a11y.** The picker restyle passed the a11y scan, but form controls are where contrast and focus bugs live. The a11y spec scans every panel and must stay green with no new `KNOWN` entries.
- **Drift.** A restyle that adds primitives nobody else needs is how a design system gets built by accident. §3's "two surfaces" rule is the guard.

## 7. Acceptance criteria

1. No file under `components/graph/` imports `components/ui/*`, and no restyled surface imports it from outside the graph kit. `GraphSwitcherCombobox`'s existing violation is closed.
2. A unit test per restyled surface asserts it has no shadcn primitive (every one carries a `data-slot`), as the picker's does.
3. The resource panels, workspace policies, GenUI catalog, Analytics, the editor dialogs and the palette read as the same system as the graph header, the Run panel and the picker: same surfaces, borders, primary colour, focus ring and type scale.
4. The a11y spec passes with no new serious violations and an empty `KNOWN`.
5. Every e2e spec that touched a changed control still passes; none is deleted to get there.
6. A browser check at 1440 px and 390 px for each PR, in the PR description.

## 8. Decisions (accepted 2026-10-13)

| Question | Decision | Why |
| --- | --- | --- |
| 1. Tier A only, or A + B? | **A only.** B follows only if it still bothers anyone | Tier B was never a CRUD page, and nothing there is broken. Revisit only if it still bothers anyone after PR 3 |
| 2. `Select` → kit `Combobox` everywhere, or native `<select>` for short fixed lists? | **`Combobox` everywhere** | Native is far less churn but looks different from the rest of the kit, which is what this plan is removing |
| 3. Move files into `components/graph/` as part of this? | **Restyle in place, then one mechanical move PR** | Keeps each diff reviewable as one kind of change |

## 9. Out of scope

- `/login` and `ai-elements/*`.
- A light theme or any change to the token values in `lib/graph-theme.ts`.
- New features or copy changes in the restyled surfaces.
- Replacing `cmdk`, `@base-ui/react` or the shadcn primitives themselves; they stay in `components/ui/` for anything still on the other side of the line.
