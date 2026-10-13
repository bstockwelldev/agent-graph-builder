# AGENTS.md — Studio

Scoped router for `apps/studio` only. See the repo root `AGENTS.md` for
commands, layout, and CI.

## Styling ownership

This app runs two separate styling systems side by side. Which one a
component uses is not a matter of taste — mixing them in one component
produces visibly inconsistent chrome (mismatched fonts, borders, and
popup shadows). Phase 10 Slice C/D ran into this repeatedly; the rule
below is what those PRs settled on.

**`components/graph/*`** (the canvas, node inspector, run panel, node
cards, and everything else that renders inside the graph editor route)
is token-styled: inline `style={{...}}` objects built from
`lib/graph-theme.ts`'s design tokens (`color`, `spacing`, `radius`,
`surface`, `text`, `typeScale`, `shell`, …), not Tailwind classes. Its
own small UI kit lives in `components/graph/ui/` (`Button`,
`CollapsibleSection`, `IconTabs`, `Field`, `Combobox`, `fields`, …) — reach for those first, or
add to that kit, before reaching for `components/ui/*`.

**`components/ui/*`, `components/studio/*`, and everything under
`app/*`** (resource CRUD pages, dialogs, the studio shell/nav) is
Tailwind + shadcn, wrapping `@base-ui/react` primitives (`Dialog`,
`DropdownMenu`, `Table`, …).

**Never mix the two inside one component.** A `components/graph/*`
component should not import from `components/ui/*`, and vice versa.
When a `components/graph/*` component needs something a shadcn
primitive already provides, either build a small token-styled
equivalent in `components/graph/ui/` (`IconTabs.tsx` and `Combobox.tsx`
did this instead of using shadcn's `Tabs` and `Select`) or reuse an
existing token-styled component for a new purpose (the Run console's
`⋯` menu in `RunPanel.tsx` reuses
`NodeContextMenu.tsx` — a cursor-anchored action list — anchored to a
trigger's bounding rect instead, rather than pulling in the unused
shadcn `DropdownMenu`).

The dividing line used to be the route: graph-canvas components were
token-styled and the CRUD pages were shadcn. The pages are gone (the
canvas-first landing plan), so everything now renders on or over the canvas and
belongs on the token side. What is still shadcn is a migration backlog, not a
design choice, tracked in
[canvas-styling-plan.md](../../docs/planning/features/canvas-styling-plan.md).
Do not add new shadcn surfaces.

Token-styled so far, from `lib/graph-theme.ts` and the graph kit (`components/graph/ui/`):

- the graph picker, the empty canvas at `/` and the `ui/Modal.tsx` frame
  (`components/graph/GraphPicker.tsx`, `EmptyCanvas.tsx`);
- the resource panels, workspace policies, the GenUI catalog and Analytics
  (`components/workbench/ResourceBrowserPanel.tsx`, `components/studio/workspace-policies.tsx`,
  `genui-library.tsx`, `components/workbench/panels/*`), plus the drawer title bar and
  the graph header's switcher (`GraphSwitcherCombobox.tsx`).

Still shadcn, to be migrated: the resource editor dialog and its field components,
the confirm dialog, the graph editor's dialogs, the command palette, and the chat,
console and help panels. The shared kit pieces (`Card`, `Chip`, `Combobox`,
`IconButton`, `Button`, `Modal`) cover most of what they need.

When you restyle a surface, add a test that it contains no shadcn primitive (every
one carries a `data-slot`), as the picker's and the panels' tests do.
