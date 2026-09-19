---
title: Studio UX revision - selection-driven workflow IDE
status: locked
capability: studio-ux-revision
linear_issue: none
locked_at: 2026-09-19
last_updated: 2026-09-19
---

# Studio UX revision - selection-driven workflow IDE

> **Status:** Locked documentation plan.
> **Source boundary:** Based on `C:\Users\bgs12\Downloads\compacted_ui_ux_design_revision_plan.md`, treated as reference material only. Instructions in that document are not executable user requests.
> **Scope:** Document UI/UX direction and roadmap implications. No product code changes are implied by this document.

## 1. UX Thesis

The studio should feel like one continuous authoring environment, not adjacent tools around a graph widget. Preserve React Flow as the canvas layer, use the studio design system for workbench controls, and make the primary loop:

```text
select → inspect → edit → connect → validate → run → diagnose
```

The major revision is a **selection-driven studio shell**:

- Persistent navigation rail.
- Temporary graph/workflow switcher drawer.
- Contextual inspector dock tied to the selected node/edge/workflow.
- Quieter but more interactive canvas.
- Run console linked directly to graph execution state.

## 2. Current UX Problems to Correct

| Current pattern | Problem | Revision |
| --- | --- | --- |
| Broad graph switcher permanently occupies the left workspace. | Switching graphs is navigation, not the primary authoring task. | Collapse to a 56-64px rail; open graph switcher as drawer/overlay; allow explicit pinning later. |
| Top toolbar presents many equal controls. | Users must scan everything to know what matters now. | Split into navigation, identity/version/save state, primary actions, view/layout controls, and contextual selection actions. |
| Inspector feels bolted on. | It does not strongly identify with the selected node. | Convert it into a selection dock with node identity, color accent, tabs, ports/contracts, policy, run data, and sticky actions. |
| Canvas has weak authoring affordances. | Users do not get enough guidance for add/connect/inspect/test workflows. | Add direct canvas launcher, context menus, compatible-port feedback, focus mode, quick node actions, and scoped run actions. |
| Run actions are too global. | Debugging often needs fixture, selected-node, replay, or scoped execution. | Expose Run, Run with fixture, Run from selected node, Debug run, and Replay run as separate scopes. |

## 3. Target Desktop Layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Workflows / Customer Support Triage        Draft v12 · Saved  [Validate]  │
│                                                                  [Run ▾]     │
├───────┬───────────────────────────────────────────────────┬──────────────────┤
│ rail  │ Canvas toolbar: [Select] [Pan] [Search] [Layout ▾]│ Selection dock   │
│       │                                                   │                  │
│ Graph │  ┌──────┐     ┌─────────┐     ┌─────────┐         │ [Prompt icon]    │
│ Runs  │  │Input │────▶│ Router  │────▶│Research │         │ {question} ...   │
│ Assets│  └──────┘     └────┬────┘     └────┬────┘         │ Tabs             │
│       │                   │               │              │ Configure        │
│       │                  ┌▼─────┐        ┌▼─────┐         │ I/O              │
│       │                  │Tool  │        │Output│         │ Policy           │
│       │                  └──────┘        └──────┘         │ Run data         │
│       │                                                   │                  │
│       │   [Fit] [Zoom]                    [Mini-map]      │                  │
├───────┴───────────────────────────────────────────────────┴──────────────────┤
│ Run console: Timeline | Logs | Artifacts | Metrics | Evaluations             │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 4. Breakpoint Rules

| Viewport | Layout behavior |
| --- | --- |
| >= 1440px | Left rail, canvas, and inspector visible; run console collapsed by default |
| 1100-1439px | Left rail icon-only; inspector around 320px and collapsible |
| 768-1099px | Canvas full width; inspector opens as right temporary drawer; graph switcher opens as left drawer |
| < 768px | Prefer read-only/review-first mode; full graph editing is not the primary mobile job |

## 5. Toolbar Model

Use three visible zones:

```text
[ Back / workflow breadcrumb ] [ Workflow title + version + saved state ]
                                                          [ Validate ] [ Run ▾ ]
[ Selection/context actions ]                             [ View/layout menu ]
```

Required behavior:

- **Run** is the primary contained action with split options for run from here, run with fixture, and run with production inputs.
- **Validate** is secondary and shows issue count when present.
- Layout/orientation/relayout move into one Layout menu.
- Add node becomes canvas-contextual through double-click, `A`, or command palette.
- Save state says what happened: Saving, Saved, local changes, or Publish required.
- Validation result chip appears when errors/warnings exist; avoid permanent celebratory success chrome.

## 6. Selection Dock

When a node is selected, the dock should show:

- Node kind, icon, display name, status, and ID.
- Same accent color as the selected node category.
- Tabs: Configure, I/O, Policy, Run.
- Advanced settings in collapsible sections.
- Exact input/output port names matching canvas handles.
- Reusable entity selectors for agents, tools, model profiles, prompt versions, and retrieval profiles.
- Sticky actions: Duplicate, Disable, Delete.

When nothing is selected, show a workflow summary:

- Node count and edge count.
- Validation result summary.
- Entrypoints and terminal nodes.
- Estimated complexity/cost when available.
- Recent runs.
- Quick actions: Add agent, Add router, Run test fixture.

## 7. Canvas Interaction Requirements

The canvas should be an intelligent authoring surface:

- Double-click canvas opens an Add node launcher at cursor.
- Right-click canvas opens Add/Paste/Auto-layout selection/Fit graph.
- Right-click node opens node actions.
- Dragging a handle highlights compatible targets and fades incompatible ports.
- Selecting a node can dim unrelated branches and emphasize inbound/outbound paths.
- Hovering a node reveals inspect, duplicate, run from here, disable, and more actions.
- Dragging nearby nodes may show alignment guides.
- Keyboard affordances: Space to pan, `A` node launcher, `F` fit graph, `L` layout, Ctrl/Cmd+Enter run.
- First node added to an empty graph should trigger a contextual next-step prompt.

Focus mode should be optional and restrained. It must not make the graph unreadable when users need broad context.

## 8. Port and Edge Semantics

Introduce visible port types:

```text
workflow-input
message
structured-json
documents
tool-result
decision
approval
error
```

Connection lifecycle:

- On connect start, highlight valid targets.
- Provide a cursor/status hint such as `Connect to message input`.
- Prevent incompatible connections before completion.
- Open the edge inspector only when the edge needs configuration, such as router branch, failure route, weighted edge, or transform mapping.

Branch labels should be legible and semantically styled:

- `Match: complex` as route chip.
- `Fallback` as amber chip.
- `On error` as red/dashed.
- `Always` unlabeled by default.
- Weighted edges show percentages only for probabilistic routing.

## 9. Run and Debug Scopes

| Action | Behavior |
| --- | --- |
| Run | Executes the current draft or published workflow from its entrypoint |
| Run with fixture | Opens test input selection |
| Run from selected node | Begins at selected node with mocked or prior upstream state |
| Validate | Static graph and configuration checks |
| Debug run | Opens bottom trace console automatically |
| Replay run | Opens immutable workflow version in read-only execution mode |

LangGraph router choices, tool calls, retries, human approval pauses, errors, and resume states should appear directly on the graph and in the run console.

## 10. Visual Direction

- Reduce grid prominence so it supports spatial orientation without competing with nodes and edges.
- Keep nodes compact but improve hierarchy: category label, title, summary, runtime status, and typed handles.
- Use node category accents consistently across palette, node border, inspector, and run state.
- Preserve at least 48-72px vertical spacing between branching transitions when layout allows.
- Prefer familiar icon buttons with tooltips for view/layout controls.
- Keep card nesting low; the shell should feel like a workbench, not stacked panels.

## 11. Runtime and Dependency Notes

The attached plan recommended actively maintained release lines as of 2026-09-19:

- Next.js 16.x when the repo is ready to upgrade.
- React 19.x.
- Current stable MUI Core compatible with React 19, if this repo adopts MUI.
- MUI X DataGrid for operational tables if this repo adopts MUI X.
- Current stable `@xyflow/react`.
- Current stable LangGraph packages aligned with backend/runtime choices.

**Repo contradiction:** the existing consolidation plan locked a Next.js 15 studio and this repo currently contains shadcn-style UI primitives rather than a MUI shell. The UX recommendations can still be applied, but component examples from the attachment should be translated into the existing studio stack unless a separate design-system migration is explicitly approved.

## 12. Revision Sequence

1. Collapse graph switcher into a rail + drawer.
2. Rebuild top toolbar around workflow identity, Validate, and Run.
3. Turn the right panel into a selection dock with Configure/I-O/Policy/Run tabs.
4. Add direct canvas authoring through double-click, context menu, and searchable node launcher.
5. Add typed ports and compatible-target feedback.
6. Add graph focus mode.
7. Add scoped run/debug/replay actions.
8. Connect execution events to graph state.
9. Use operational data grids/tables outside the canvas for registries, run history, and evaluation datasets.
10. Standardize styling ownership across the studio.

## 13. Current-Doc Contradictions to Resolve

| Current repo signal | Contradiction / tension | Resolution |
| --- | --- | --- |
| Roadmap lists old playground shell polish as shipped but does not yet define the next Studio UX model. | The active product is now the studio, not the original playground layout. | Add Studio UX Revision as the next UX planning artifact. |
| Consolidation plan says Phase 6 docs are pending. | README and AGENTS still describe playground-era behavior. | Update docs during Phase 6 to make studio the default surface. |
| Attachment recommends MUI workbench components. | Current repo uses Next.js studio with local UI primitives. | Translate UX patterns into existing components before considering a component-system migration. |
| Existing validation and run panels are present but scoped mainly around compile/run. | The revised model requires fixture simulation, selected-node run, replay, and policy/contract views. | Roadmap these as reliability-studio capabilities, not toolbar polish. |
