---
title: Agent Graph Builder POC — product roadmap
last_updated: 2026-09-09
---

# Product roadmap

Prioritized backlog for the Agent Graph Builder POC **after** the next-set trilogy and shell layout polish. Ordering uses **priority** (when to do it), **impact** (user-visible payoff), and **utility** (why it earns a slot).

**Legend**

| Priority | Meaning |
| -------- | ------- |
| **P0** | Ship gate — block merge or release until done |
| **P1** | High payoff next slice — demo quality or core UX |
| **P2** | Operator / platform ergonomics |
| **P3** | Quality depth — tests, docs, nice-to-haves |

| Impact | Meaning |
| ------ | ------- |
| **High** | Changes first-impression usability or graph comprehension |
| **Medium** | Meaningful polish or power-user win |
| **Low** | Incremental; defer if schedule tight |

---

## Completed / in flight

| Item | Status | Spec / branch |
| ---- | ------ | --------------- |
| App shell resilience | Shipped | [app-shell-resilience-plan.md](features/app-shell-resilience-plan.md) |
| Canvas orientation (dagre, Auto/H/V) | Shipped | [canvas-orientation-plan.md](features/canvas-orientation-plan.md) |
| From-scratch authoring | Shipped | [from-scratch-authoring-plan.md](features/from-scratch-authoring-plan.md) |
| Shell layout polish + wide-viewport flex fix | Shipped | [shell-layout-polish-plan.md](features/shell-layout-polish-plan.md) |
| Repo dev scripts + global `dev` CLI docs | Shipped | `scripts/`, `README.md` |
| Canvas visual language (node color/shape, blueprint background) | Shipped | `feat/p1-canvas-and-shell-ux` — `theme.ts` `nodeType`/`canvas`, `GraphNodeView.tsx`, `FlowCanvas.tsx` |
| Empty states, loading shimmers, collapsible panels | Shipped | `feat/p1-canvas-and-shell-ux` — `ui/Skeleton.tsx`, `ui/CollapsibleSection.tsx`, `RunPanel.tsx`, `GraphLibrary.tsx` |
| Vercel full-stack deploy | Shipped | `master` — https://agent-graph-builder.vercel.app |
| Ultra-wide layout tokens | Shipped | `feat/p2-ultra-wide-layout-tokens` — `shell.breakpoint.wide` (1280), `shell.canvasMinWidth`, inspector drawer below wide |

---

## Prioritized backlog

| Pri | Item | Impact | Utility | Notes / touch points |
| --- | ---- | ------ | ------- | -------------------- |
| **P0** | ~~**QA + merge shell layout branch**~~ | High | Done 2026-09-09 | Merged `feat/shell-layout-polish` → `master`; run `npm run build` + `uv run pytest` before deploy. |
| **P0** | **Configure git remote + CI on push** | Medium | Enables PR review and regression gates | **Blocked locally:** no `origin` remote configured. Add remote and `git push -u origin master` to activate `.github/workflows/ci.yml`. |
| ~~**P1**~~ | ~~**Canvas visual language — node color, shape, blueprint background**~~ | High | High | **Shipped 2026-09-09** on `feat/p1-canvas-and-shell-ux`. Semantic `nodeType` tokens, per-type shapes, dual-line blueprint `Background`. |
| ~~**P1**~~ | ~~**Empty states, loading shimmers, collapsible panels**~~ | High | High | **Shipped 2026-09-09** on `feat/p1-canvas-and-shell-ux`. `Skeleton`, `CollapsibleSection`, empty states + `localStorage` panel persistence. |
| **P2** | **Dev CLI Phase 2** (factory) | Medium | High for polyrepo daily use | `dev doctor`, `dev gate`, shell completion, register tabletop / ai-lab stacks. Canonical home: `agent-context-factory/packages/local-dev-cli`. |
| ~~**P2**~~ | ~~**Ultra-wide layout tokens**~~ | Medium | Medium | **Shipped 2026-09-09** on `feat/p2-ultra-wide-layout-tokens`. `shell.canvasMinWidth` (420), `shell.breakpoint.wide` (1280); inspector rail only at wide+, drawer below. |
| **P3** | **Frontend tests (Vitest + RTL)** | Medium | Medium | `FlowCanvas` fitView gating, `TaxonomyTooltip` layouts, shell flex regression. Spec follow-up in shell-layout-polish. |
| **P3** | **Repo `AGENTS.md`** | Low | Medium | Router doc for agents (commands, planning paths, dev CLI). |
| **P3** | **Canvas orientation Phase E** | Low | Low | elk fallback, dual layout positions — [canvas-orientation-plan.md](features/canvas-orientation-plan.md) follow-ons. |

---

## Recommended phases

### Phase 5 — Ship (P0)

1. ~~QA shell layout branch at full resolution (Chrome + Comet).~~
2. ~~Merge to `master`.~~
3. Add `origin` remote and push to enable GitHub Actions CI.

### Phase 6 — Canvas identity (P1, high impact)

1. **Node color + shape taxonomy** — map each `NodeType` to token set; update `GraphNodeView` and legend in palette tooltips.
2. **Blueprint background** — replace flat dark pane; ensure dots/grid readable with node colors.
3. Lock brief design spec (`docs/planning/features/canvas-visual-language-plan.md`) before implementation if scope grows.

### Phase 7 — Shell resilience UX (P1, high utility)

1. **Loading shimmers** for async surfaces (graph load, compile, run, model catalog).
2. **Empty states** audit — every list/log/preview region.
3. **Collapsible rails** — section headers with chevron + persisted state; respect `prefers-reduced-motion`.

### Phase 8 — Operator + depth (P2–P3)

Dev CLI Phase 2, Vitest harness, AGENTS.md. Ultra-wide layout tokens shipped 2026-09-09.

---

## Scoring rationale (requested items)

### 1. Color-coded nodes, shape variation, blueprint background

| Dimension | Rating | Rationale |
| --------- | ------ | --------- |
| Priority | **P1** | Depends on canvas layout fix (P0); highest demo “wow” per engineering hour after ship. |
| Impact | **High** | Graph is the product surface; grayscale nodes hide the six-type taxonomy the POC proves. |
| Utility | **High** | Faster orientation for new users; aligns with palette/inspector copy; supports future node-type expansion. |

### 2. Empty states, loading shimmers, collapsible panels

| Dimension | Rating | Rationale |
| --------- | ------ | --------- |
| Priority | **P1** | Complements Phase 6 visually; can parallelize (shell vs canvas tracks). |
| Impact | **High** | Removes “broken app” feel during load and on first visit; collapsible rails reclaim canvas on laptops. |
| Utility | **High** | Reuses shell patterns already specified; shimmers cheaply improve perceived performance without backend changes. |

---

## Related docs

- [Planning index](README.md) — locked feature specs
- [README.md](../../README.md) — run instructions, CI, EDD scope boundary
