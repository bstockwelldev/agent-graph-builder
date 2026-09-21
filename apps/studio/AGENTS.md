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
`CollapsibleSection`, `Tabs`, `fields`, …) — reach for those first, or
add to that kit, before reaching for `components/ui/*`.

**`components/ui/*`, `components/studio/*`, and everything under
`app/*`** (resource CRUD pages, dialogs, the studio shell/nav) is
Tailwind + shadcn, wrapping `@base-ui/react` primitives (`Dialog`,
`DropdownMenu`, `Table`, …).

**Never mix the two inside one component.** A `components/graph/*`
component should not import from `components/ui/*`, and vice versa.
When a `components/graph/*` component needs something a shadcn
primitive already provides, either build a small token-styled
equivalent in `components/graph/ui/` (`Tabs.tsx` did this instead of
using shadcn's `Tabs`) or reuse an existing token-styled component for
a new purpose (the Run split-button's dropdown in `RunPanel.tsx` reuses
`NodeContextMenu.tsx` — a cursor-anchored action list — anchored to a
trigger's bounding rect instead, rather than pulling in the unused
shadcn `DropdownMenu`).

The dividing line is the route, not the file's location on disk: a
component that only ever renders inside the graph canvas is
token-styled even if it's small; a full page or a dialog reachable from
the sidebar nav is Tailwind/shadcn even if it's graph-adjacent (e.g.
`/runs/[graphId]`).
