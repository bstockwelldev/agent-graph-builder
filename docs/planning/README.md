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
| [canvas-authoring-literacy-plan.md](features/canvas-authoring-literacy-plan.md) | Canvas authoring literacy | In-flow coach, edge glossary, handles/snap, honest Tool/LLM copy; **Phase F closed 2026-09-11** (`212b0cb`) |
| [studio-consolidation-plan.md](features/studio-consolidation-plan.md) | Studio consolidation (micro-ui-agent-builder → agent-graph-builder) | 6-phase program: absorb MUI's node vocabulary + studio UX + resource registries + telemetry/RAG/auth into this repo's engine, then sunset MUI. **Locked 2026-09-15.** |
| [graph-native-control-plane-plan.md](features/graph-native-control-plane-plan.md) | Graph-native control plane | Strategic product plan: canonical typed graph IR, graph SDLC, contracts, simulation, replay, routing lab, policy overlays, runtime portability. **Locked 2026-09-19.** |
| [studio-ux-revision-plan.md](features/studio-ux-revision-plan.md) | Studio UX revision | Selection-driven workflow IDE direction: rail + drawers, contextual selection dock, typed ports, scoped runs, graph-linked diagnostics. **Locked 2026-09-19.** |
| [p0-graph-foundation-design-plan.md](features/p0-graph-foundation-design-plan.md) | P0 graph foundation | Implementation design for a versioned typed graph IR, graph validation, LangGraph adapter boundary, and release-pinned run timeline. **Proposed 2026-09-19.** |

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

6. **Studio consolidation** — [`studio-consolidation-plan.md`](features/studio-consolidation-plan.md)  
   Separate program, not part of the next-set sequence above. Absorbs micro-ui-agent-builder's node vocabulary, studio UX, and resource/runtime capabilities into this repo's Python engine across 6 phases, then sunsets that repo. **Locked 2026-09-15.**

7. **Strategic product direction** — [`graph-native-control-plane-plan.md`](features/graph-native-control-plane-plan.md) + [`studio-ux-revision-plan.md`](features/studio-ux-revision-plan.md)
   These supersede the playground-era UX framing for new planning. Build reliability-studio capabilities first, while preserving the long-term graph-native control-plane architecture.

## Roadmap

Prioritized backlog (P0–P3) with **priority, impact, and utility** scoring:

→ **[roadmap.md](roadmap.md)**

Highlights after the next-set:

- **P2** — Dev CLI Phase 2 (factory; not this repo)
- **P3** — Canvas orientation Phase E (elk fallback)
- **Strategic P0/P1** — Typed graph IR/versioning, contract validation, semantic diffs, simulation, replay, routing lab
- ~~P3 frontend Vitest/RTL~~ — shipped 2026-09-12

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
- [strategic-design.md](strategic-design.md) — graph-native product and studio UX direction
- Workspace skill: `feature-change-plan` (11-section template)
