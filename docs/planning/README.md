# Planning specs

Locked feature-change plans for the Agent Graph Builder POC next-set. Each SPEC uses the 11-section `feature-change-plan` template (`status: locked`, `linear_issue: none`).

## Feature specs

| Spec | Capability | Summary |
| ---- | ---------- | ------- |
| [app-shell-resilience-plan.md](features/app-shell-resilience-plan.md) | App shell resilience | Error boundaries, taxonomy tooltips, responsive drawers (~1100px), a11y polish |
| [canvas-orientation-plan.md](features/canvas-orientation-plan.md) | Canvas orientation (rank-1) | Pane-aspect Auto + dagre + Auto/H/V pin; ResizeObserver-driven layout |
| [from-scratch-authoring-plan.md](features/from-scratch-authoring-plan.md) | From-scratch authoring | Edge kind at connect, router inspector edge list, Save/dirty/undo/Delete, empty-state coaching |
| [shell-layout-polish-plan.md](features/shell-layout-polish-plan.md) | Shell layout polish | Canvas fitView timing, header/run collision, Run panel polish, section hierarchy, empty states |
| [playground-shell-panels-plan.md](features/playground-shell-panels-plan.md) | Playground shell panels | Execute vs Observe rail IA; **Phase F closed 2026-09-10** (`c6b5467`) |

## Suggested implement order

Implement in this sequence — later specs assume earlier seams exist:

1. **Shell** — [`app-shell-resilience-plan.md`](features/app-shell-resilience-plan.md)  
   The flow pane must be able to go tall (drawer shell under ~1100px). Orientation and authoring both depend on a stable, resizable canvas region.

2. **Orientation** — [`canvas-orientation-plan.md`](features/canvas-orientation-plan.md)  
   Requires a real pane dimension signal from the shell. Adds `orientation` on graph JSON, dagre relayout, and handle swapping.

3. **Authoring** — [`from-scratch-authoring-plan.md`](features/from-scratch-authoring-plan.md)  
   Can overlap once shell chrome exists. Improves connect-time edge kinds, router inspector, explicit Save, and blank-graph coaching.

4. **Shell layout polish** — [`shell-layout-polish-plan.md`](features/shell-layout-polish-plan.md)  
   Post–next-set UX fixes: canvas `fitView` timing, header/run-rail collision, Run panel polish, section hierarchy, empty states. **Locked 2026-09-09.**

5. **Playground shell panels** — [`playground-shell-panels-plan.md`](features/playground-shell-panels-plan.md)  
   Execute vs Observe rail IA, accordion-one-open, shared Observe scroller, canvas-first inspector. **Locked 2026-09-10; Phase F closed 2026-09-10** (`c6b5467`).

## Roadmap

Prioritized backlog (P0–P3) with **priority, impact, and utility** scoring:

→ **[roadmap.md](roadmap.md)**

Highlights after the next-set:

- **P1** — Canvas visual language (node color + shape taxonomy, blueprint background)
- **P1** — Empty states, loading shimmers, collapsible panels
- **P2** — Dev CLI Phase 2 (factory)

## Conventions

- SPECs are **planning-only** in this slice — no product implementation is implied by the lock date.
- Locked decisions tables are authoritative; do not reopen without a new SPEC revision.
- Code paths in section 10 of each SPEC list verified repo-relative paths only.

## Incidents

| Doc | Summary |
| --- | ------- |
| [prod-run-queue-limbo-2026-09-09.md](incidents/prod-run-queue-limbo-2026-09-09.md) | Production Run stuck `queued` + validate storm on Vercel serverless — RCA + PTR |
| [prod-sqlite-startup-2026-09-10.md](incidents/prod-sqlite-startup-2026-09-10.md) | Production startup `unable to open database file` — RCA + PTR |
| [prod-run-isolate-404-2026-09-10.md](incidents/prod-run-isolate-404-2026-09-10.md) | Groq POST succeeded; follow-up GET run 404 across isolates — RCA + PTR |

## Related docs

- [README.md](../../README.md) — POC overview, run instructions, CI
- Workspace skill: `feature-change-plan` (11-section template)
