# Configurable policy overlays — shipped ([STO-608](https://linear.app/stockwise-productions-prototypes/issue/STO-608))

Closes the named gap on roadmap P2 "Cross-cutting policy overlays". Before this, the rules in `policies.py` were hard-coded constants, and there were no configurable compile/deploy gates and no UI for exception expiry.

## Decisions (2026-09-23)

- **Where settings live:** workspace defaults, plus per-graph overrides.
- **PR split:** two PRs. This one covers policies; [STO-609](https://linear.app/stockwise-productions-prototypes/issue/STO-609) covers the P1 gaps (draft↔release diff, routing lab vs release, counterfactual replay).

## Model

- **Rule catalog.** `POLICY_CATALOG` in `backend/app/policies.py` lists each rule with:
  - code, category and title;
  - gate: `compile`, or `publish` for rules that only run at publish;
  - default enforcement;
  - parameter specs.

  Current rules:

  | Rule | Category | Default | Parameter |
  | --- | --- | --- | --- |
  | Sensitive data into a tool | security | block | `min_classification` |
  | LLM model not pinned | reliability | warn | — |
  | Too many model nodes | cost | warn | `max_model_nodes` |
  | Release governance metadata | governance | warn | — (publish-only) |

- **Enforcement levels:**

  | Level | Draft (compile / run) | Publish |
  | --- | --- | --- |
  | `off` | not evaluated | not evaluated |
  | `warn` | warning | warning |
  | `block_publish` | warning, noting that publishing is blocked | blocking error |
  | `block` | blocking error | blocking error |

- **Resolution.**
  - Enforcement and each parameter resolve separately, in this order: catalog default → workspace (`policy_settings` scope `workspace`) → graph (`graph:<id>`).
  - `effective_policies()` reports where each value came from.
  - Settings are validated on save: unknown rules or parameters, non-integers, values below the minimum, and invalid choices return 422.
- **Gates.**
  - `validate_graph(graph, policy_gate=...)` is the compile gate by default.
  - `publish_release` calls it with `policy_gate="publish"`.
- **Exceptions.**
  - Waivers are applied inside `_enforce`.
  - A waived diagnostic stays visible: it becomes non-blocking and carries a note.
  - `Diagnostic.blocks_publish` flags any policy diagnostic that will block publishing unless waived. That includes a `block_publish` warning on the draft, so Studio can offer Waive on it.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/policies/catalog` | Rule catalog |
| GET / PUT | `/api/policies/workspace` | Workspace defaults |
| GET | `/api/policies/effective` | Effective rules at workspace level |
| GET / PUT | `/api/graphs/{id}/policies` | Graph overrides |
| GET | `/api/graphs/{id}/policies/effective` | Effective rules for a graph |
| PATCH | `/api/graphs/{id}/policy-exceptions/{eid}` | Extend a waiver or restate its reason |
| GET | `/api/policy-exceptions` | Exceptions across all graphs |

The SDK has a matching client method for each route, and schemas for each type.

## Studio

- **`/policies` page** (Tailwind/shadcn). It is on the rail and in the More sheet, but kept out of the five-slot phone tab bar (`mobileTab: false`).
  - Rules are grouped by category. Each has an enforcement select (Default or a level) and parameter inputs with "Reset to default". Changes save immediately.
  - A cross-graph exceptions list shows each waiver's status (Active / Expiring soon ≤7d / Expired) and relative expiry. Actions: Extend or Renew by 30 days, and Revoke (with confirmation).
- **Graph Policies panel** (`components/graph/PolicyPanel.tsx`, token-styled).
  - Opened from the header ⋯ menu or the compact tray's More menu.
  - Each rule has Inherit (showing the inherited value and its source) or an override. Integer parameters use a stepper and choice parameters a select, each with a source label and Reset.
  - Shows this graph's exceptions, with Extend and Revoke.
  - Every change re-validates the canvas.
- **Run panel → Issues:** Waive for 7d / 30d / 90d, on any policy diagnostic that blocks runs or publishing.

## Verification

- Backend: pytest 462/462 (18 new in `test_policy_settings.py`; the 21 existing policy tests pass unchanged).
- SDK: vitest 105/105 (new `policies.test.ts`).
- Studio:
  - vitest 274/274, with new tests for `lib/policies`, `PolicyPanel` and the `/policies` page;
  - tsc clean;
  - eslint 0 errors.
- Playwright on a live stub backend, at 1440 and 390:
  - **Workspace settings:** on `/policies`, cost was set to Block publish and max model nodes to 1; both persisted.
  - **Publish gate:** before any waiver, publishing the demo graph returned 422.
  - **Graph panel:** it showed "Inherit (Block publish)".
  - **Waiver:** Issues showed Waive 7d/30d/90d. Waiving for 7 days cleared the block, and publishing then returned 200.
  - **Graph override:** setting the rule to Off in the graph panel persisted, and the panel showed "Effective: Off · This graph".
  - **Exceptions list:** it showed the waiver as Expiring soon; Extend moved it to Active, expiring in 37 days.
  - **Mobile:** the phone tab bar is unchanged, the More sheet lists Policies, and the tray's More → Policies opens the panel.
