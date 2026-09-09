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
| Shell layout polish + wide-viewport flex fix | In flight | Branch `feat/shell-layout-polish` |
| Repo dev scripts + global `dev` CLI docs | In flight | Branch `feat/shell-layout-polish` · `scripts/` |

---

## Prioritized backlog

| Pri | Item | Impact | Utility | Notes / touch points |
| --- | ---- | ------ | ------- | -------------------- |
| **P0** | **QA + merge shell layout branch** | High | Unblocks all UI follow-ons | Manual pass at full monitor width (~1920px+): demo graph visible, run rail right, header/orientation separated. Merge `feat/shell-layout-polish` → `master`. |
| **P0** | **Configure git remote + CI on push** | Medium | Enables PR review and regression gates | Add `origin`, push branch, rely on `.github/workflows/ci.yml` pytest. |
| **P1** | **Canvas visual language — node color, shape, blueprint background** | **High** | **High** | Today all nodes use the same grayscale `surface.raised` card ([`GraphNodeView.tsx`](../../frontend/src/components/nodes/GraphNodeView.tsx)); only border/status tint differs. **Color-code by node type** (Input, Prompt, LLM, Tool, Router, Output) using semantic tokens from [`theme.ts`](../../frontend/src/theme.ts) — keep WCAG AA contrast on labels. **Shape variation** per type where it aids recognition (e.g. diamond Router, pill Output, rounded rect default) without breaking handle geometry. **Blueprint-style canvas background** (grid + subtle paper tone) via React Flow `Background` / CSS — reinforces “graph blueprint” vs flat `#111318`. Depends on stable canvas width (shell polish). |
| **P1** | **Empty states, loading shimmers, collapsible panels** | **High** | **High** | Partial today: event log placeholder, `EmptyGraphCoach`, load-failure banner. **Extend empty states** — graph list zero, run history zero, diagnostics idle copy, canvas “select a graph” when none loaded. **Loading shimmers** — graph fetch, compile, run start, provider model catalog (replace blank flashes / layout shift). **Collapsible panels** — library sections, run rail sections (Run / Diagnostics / Event log), optional inspector collapse; persist open/closed in `localStorage` per panel. Improves wide and compact shells; pairs with drawer model in [app-shell-resilience-plan.md](features/app-shell-resilience-plan.md). Touch: `App.tsx`, `RunPanel.tsx`, `GraphLibrary.tsx`, `FlowCanvas.tsx`, new `ui/Skeleton.tsx`. |
| **P2** | **Dev CLI Phase 2** (factory) | Medium | High for polyrepo daily use | `dev doctor`, `dev gate`, shell completion, register tabletop / ai-lab stacks. Canonical home: `agent-context-factory/packages/local-dev-cli`. |
| **P2** | **Ultra-wide layout tokens** | Medium | Medium | Optional `shell.canvasMinWidth`, inspector+run open at 1280px; only if QA still feels cramped after flex fix. |
| **P3** | **Frontend tests (Vitest + RTL)** | Medium | Medium | `FlowCanvas` fitView gating, `TaxonomyTooltip` layouts, shell flex regression. Spec follow-up in shell-layout-polish. |
| **P3** | **Repo `AGENTS.md`** | Low | Medium | Router doc for agents (commands, planning paths, dev CLI). |
| **P3** | **Canvas orientation Phase E** | Low | Low | elk fallback, dual layout positions — [canvas-orientation-plan.md](features/canvas-orientation-plan.md) follow-ons. |

---

## Recommended phases

### Phase 5 — Ship (P0)

1. QA shell layout branch at full resolution (Chrome + Comet).
2. Merge to `master`; add remote and push if publishing.

### Phase 6 — Canvas identity (P1, high impact)

1. **Node color + shape taxonomy** — map each `NodeType` to token set; update `GraphNodeView` and legend in palette tooltips.
2. **Blueprint background** — replace flat dark pane; ensure dots/grid readable with node colors.
3. Lock brief design spec (`docs/planning/features/canvas-visual-language-plan.md`) before implementation if scope grows.

### Phase 7 — Shell resilience UX (P1, high utility)

1. **Loading shimmers** for async surfaces (graph load, compile, run, model catalog).
2. **Empty states** audit — every list/log/preview region.
3. **Collapsible rails** — section headers with chevron + persisted state; respect `prefers-reduced-motion`.

### Phase 8 — Operator + depth (P2–P3)

Dev CLI Phase 2, optional layout tokens, Vitest harness, AGENTS.md.

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
