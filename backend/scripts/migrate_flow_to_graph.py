"""One-shot migration: micro-ui-agent-builder `FlowDocument` JSON ->
this repo's `GraphDefinition` JSON.

Part of the studio-consolidation program
(docs/planning/features/studio-consolidation-plan.md, Phase 2). The source
shape is `packages/shared/src/schemas.ts:flowDocumentSchema` in the
`micro-ui-agent-builder` repo — a flat, ordered `steps[]` list with optional
`edges[]` (MUI's own comment: "when omitted, the UI derives a linear chain
from step order"). This script performs that same derivation once, up
front, producing a real `GraphDefinition` for this repo's graph-driven
engine instead.

This is a **lossy, best-effort** migration, not a lossless round-trip:

- `system`/`user` steps become `prompt` nodes. MUI's own `promptTemplate`
  rows (referenced by `refId`) are not resolved here — only `content` is
  carried over. A step with a `refId` and no inline `content` produces a
  placeholder template and a warning.
- `branch` steps become real `branch` nodes (see nodes.py compute_branch),
  but MUI's `branch` step has no alternate target — it is a whole-run
  precondition, not a graph fork. The migrated node has no outgoing edges
  of its own; the compiler's `BRANCH_MISSING_FALLBACK` diagnostic will
  correctly flag this until conditional + default edges are added by hand
  to take advantage of the upgrade.
- An `llm` step with `maxToolIterations >= 2` set (MUI's optional "enable
  tool loops without a dedicated node" convenience) is migrated to a
  `tool_loop` node instead of `llm`, since that is the node type that
  actually implements the behavior in this repo.
- A `tool` step's `refId` is carried into `config.toolName` verbatim; only
  `lookup_topic` has a runtime binding today (nodes.py), so anything else
  will be flagged by the compiler's existing `UNSUPPORTED_TOOL_BINDING`
  diagnostic rather than duplicated here.
- MUI edges carry no `kind` (sequence/conditional/default) at all — every
  migrated edge becomes `sequence`; edge `label` is dropped (cosmetic only).
- `output` step `content` (a free-text output contract) has no equivalent
  field on this repo's `output` node and is dropped, with a warning.

Usage:
    uv run python scripts/migrate_flow_to_graph.py path/to/flow.json
    uv run python scripts/migrate_flow_to_graph.py path/to/flow.json -o path/to/graph.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models import EdgeKind, GraphDefinition, GraphEdge, GraphNode, NodePosition, NodeType  # noqa: E402

_STEP_TYPE_TO_NODE_TYPE: dict[str, NodeType] = {
    "system": NodeType.PROMPT,
    "user": NodeType.PROMPT,
    "llm": NodeType.LLM,
    "tool": NodeType.TOOL,
    "human_gate": NodeType.HUMAN_GATE,
    "output": NodeType.OUTPUT,
    "guardrail": NodeType.GUARDRAIL,
    "rubric": NodeType.RUBRIC,
    "branch": NodeType.BRANCH,
    "tool_loop": NodeType.TOOL_LOOP,
    "code_exec": NodeType.CODE_EXEC,
}

_TOOL_LOOP_PROMOTION_THRESHOLD = 2


def _node_config_for_step(step: dict[str, Any], node_type: NodeType, warnings: list[str]) -> dict[str, Any]:
    step_id = step.get("id", "?")
    step_type = step.get("type")
    content = step.get("content")
    ref_id = step.get("refId")

    if step_type in ("system", "user"):
        if content:
            return {"template": content}
        if ref_id:
            warnings.append(
                f"step {step_id!r} ({step_type}) references prompt template {ref_id!r}; "
                "resolve its body manually — promptTemplate rows are not migrated"
            )
            return {"template": f"[unresolved prompt template: {ref_id}]"}
        return {"template": ""}

    # Branch on the (possibly-promoted) node_type here, not step_type — an
    # `llm` step with enough maxToolIterations is promoted to `tool_loop`
    # by the caller (migrate_flow_document), and needs the tool_loop config
    # shape even though the source step's own `type` field still says "llm".
    if node_type in (NodeType.LLM, NodeType.TOOL_LOOP):
        config: dict[str, Any] = {"model": step.get("model") or ""}
        if node_type == NodeType.TOOL_LOOP:
            config["maxToolIterations"] = step.get("maxToolIterations", 1)
        if step.get("modelProvider"):
            config["modelProvider"] = step["modelProvider"]
        if content:
            config["systemPrompt"] = content
        return config

    if step_type == "tool":
        if ref_id and ref_id != "lookup_topic":
            warnings.append(
                f"step {step_id!r} (tool) references tool {ref_id!r}; only 'lookup_topic' has a "
                "runtime binding today (see nodes.py) — the compiler will flag this as "
                "UNSUPPORTED_TOOL_BINDING until studio-consolidation Phase 3's tool registry lands"
            )
        return {"toolName": ref_id or "lookup_topic", "inputVariable": "question"}

    if step_type == "human_gate":
        config = {"content": content or ""}
        if step.get("genuiCheckpointSurfaceJson"):
            config["genuiCheckpointSurfaceJson"] = step["genuiCheckpointSurfaceJson"]
        return config

    if step_type == "output":
        if content:
            warnings.append(
                f"step {step_id!r} (output) has a free-text output contract in `content`; this "
                "repo's output node has no equivalent field — dropped"
            )
        return {}

    if step_type == "guardrail":
        return {"allowUrls": bool(step.get("allowUrls", False))}

    if step_type == "rubric":
        return {"rubricFailOnFindings": bool(step.get("rubricFailOnFindings", False))}

    if step_type == "branch":
        warnings.append(
            f"step {step_id!r} (branch) has no alternate target in the source FlowDocument — "
            "this repo's branch node needs a conditional + default outgoing edge added by hand "
            "to take advantage of real branching; the compiler will flag BRANCH_MISSING_FALLBACK "
            "until then"
        )
        return {"content": content or ""}

    if step_type == "code_exec":
        config = {"content": content or ""}
        if step.get("codeExecLanguage"):
            config["codeExecLanguage"] = step["codeExecLanguage"]
        if ref_id:
            config["toolName"] = ref_id
        return config

    warnings.append(f"step {step_id!r} has unrecognized type {step_type!r}; produced an empty config")
    return {}


def migrate_flow_document(flow: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Converts a MUI `FlowDocument` dict into a `GraphDefinition` dict.

    Returns `(graph_dict, warnings)`. Raises `ValueError` if `flow` has no
    steps (nothing to migrate) or a step has an unmapped `type`.
    """
    warnings: list[str] = []
    steps = sorted(flow.get("steps", []), key=lambda s: s.get("order", 0))
    if not steps:
        raise ValueError("flow document has no steps to migrate")

    nodes: list[GraphNode] = []
    for index, step in enumerate(steps):
        step_type = step.get("type")
        node_type = _STEP_TYPE_TO_NODE_TYPE.get(step_type)
        if node_type is None:
            raise ValueError(f"step {step.get('id')!r} has unmapped type {step_type!r}")

        if node_type == NodeType.LLM and (step.get("maxToolIterations") or 0) >= _TOOL_LOOP_PROMOTION_THRESHOLD:
            warnings.append(
                f"step {step.get('id')!r} (llm) has maxToolIterations="
                f"{step['maxToolIterations']}; promoted to a tool_loop node, since that is what "
                "implements the behavior in this repo (see nodes.py compute_tool_loop)"
            )
            node_type = NodeType.TOOL_LOOP

        config = _node_config_for_step(step, node_type, warnings)
        position = step.get("position") or {"x": index * 260, "y": 200}
        nodes.append(
            GraphNode(
                id=step["id"],
                type=node_type,
                position=NodePosition(x=position["x"], y=position["y"]),
                config=config,
            )
        )

    source_edges = flow.get("edges") or []
    if source_edges:
        edges = [
            GraphEdge(id=e["id"], source=e["source"], target=e["target"], kind=EdgeKind.SEQUENCE)
            for e in source_edges
        ]
    else:
        edges = [
            GraphEdge(id=f"e_{steps[i]['id']}_{steps[i + 1]['id']}", source=steps[i]["id"], target=steps[i + 1]["id"])
            for i in range(len(steps) - 1)
        ]

    graph = GraphDefinition(
        id=flow.get("id", "migrated_flow"),
        name=flow.get("name", "Migrated flow"),
        entry_node_id=steps[0]["id"],
        nodes=nodes,
        edges=edges,
        orientation="auto",
        updated_at=flow.get("updatedAt"),
    )
    return graph.model_dump(mode="json"), warnings


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("flow_json", type=Path, help="Path to a micro-ui-agent-builder FlowDocument JSON file")
    parser.add_argument("-o", "--output", type=Path, default=None, help="Write the GraphDefinition JSON here (default: stdout)")
    args = parser.parse_args()

    flow = json.loads(args.flow_json.read_text())
    graph, warnings = migrate_flow_document(flow)

    if args.output:
        args.output.write_text(json.dumps(graph, indent=2))
        print(f"Wrote {args.output}", file=sys.stderr)
    else:
        print(json.dumps(graph, indent=2))

    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)


if __name__ == "__main__":
    main()
