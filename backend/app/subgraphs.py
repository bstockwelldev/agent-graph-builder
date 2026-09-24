"""Graph-as-node subgraphs (large-graph complexity, Wave 7c / STO-612).

A `subgraph` node runs another saved graph as a nested run. This module
holds everything about that reference that isn't the executor itself
(nodes.py `compute_subgraph`):

- the child's interface (its input variables);
- resolving which child graph/release a run uses;
- building the child's run input from the parent's state;
- reference-graph walking for cycle/depth diagnostics (compiler.py);
- "Extract selection to graph".

Imports only `storage` and `models` so compiler.py, releases.py and
nodes.py can all use it without an import cycle.
"""

from __future__ import annotations

import re
import uuid
from collections import deque
from dataclasses import dataclass
from typing import Any

from . import storage
from .models import (
    GraphDefinition,
    GraphEdge,
    GraphNode,
    GraphRelease,
    NodePosition,
    NodeType,
)

MAX_DEPTH = 4
SNAPSHOT_PREFIX = "subgraph:"
_TEMPLATE_VAR = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")


def snapshot_key(node_id: str) -> str:
    return f"{SNAPSHOT_PREFIX}{node_id}"


def subgraph_nodes(graph: GraphDefinition) -> list[GraphNode]:
    return [node for node in graph.nodes if node.type == NodeType.SUBGRAPH]


def target_graph_id(node: GraphNode) -> str:
    return str(node.config.get("graphId") or "")


def target_version(node: GraphNode) -> str:
    return str(node.config.get("version") or "latest")


def child_inputs(graph: GraphDefinition) -> list[str]:
    """The child's input variables: each input node's `variableName`
    (nodes.py `compute_input`), in node order -- mirrors Studio's
    `lib/runInputs.ts` `runInputVariables`, falling back to `question`."""
    names: list[str] = []
    for node in graph.nodes:
        if node.type != NodeType.INPUT:
            continue
        raw = node.config.get("variableName")
        name = raw.strip() if isinstance(raw, str) and raw.strip() else "question"
        if name not in names:
            names.append(name)
    return names or ["question"]


# ------------------------------------------------------------ releases


def _release(graph_id: str, release_id: str) -> GraphRelease | None:
    payload = storage.get_release(release_id, graph_id)
    return GraphRelease.model_validate(payload) if payload is not None else None


def latest_release(graph_id: str) -> GraphRelease | None:
    index = storage.get_release_index(graph_id)
    if not index:
        return None
    newest = max(index, key=lambda entry: entry.get("created_at", ""))
    return _release(graph_id, newest["release_id"])


def release_for(node: GraphNode) -> GraphRelease | None:
    """The concrete release a publish freezes: the pinned one, or the
    newest for `latest`. `None` for `draft` or an unpublished child."""
    version = target_version(node)
    if version == "draft":
        return None
    if version == "latest":
        return latest_release(target_graph_id(node))
    return _release(target_graph_id(node), version)


@dataclass
class ResolvedChild:
    graph: GraphDefinition
    release_id: str | None
    snapshots: dict[str, dict[str, Any]] | None


def resolve_child(
    node: GraphNode, release_snapshots: dict[str, dict[str, Any]] | None
) -> ResolvedChild:
    """Which child graph this run executes. A release-sourced parent run
    uses the child release frozen at publish; a draft run follows
    `version`: latest release (else the saved draft), the draft, or a
    pinned release. Raises ValueError when nothing resolves."""
    graph_id = target_graph_id(node)
    if release_snapshots is not None:
        frozen = release_snapshots.get(snapshot_key(node.id))
        if frozen is None:
            raise ValueError(f"release has no frozen child for subgraph node {node.id!r}")
        release = _release(frozen["graph_id"], frozen["release_id"])
        if release is None:
            raise ValueError(f"frozen child release {frozen['release_id']!r} not found")
        return ResolvedChild(release.graph, release.id, release.resource_snapshots)

    version = target_version(node)
    if version not in ("latest", "draft"):
        release = _release(graph_id, version)
        if release is None:
            raise ValueError(f"release {version!r} of graph {graph_id!r} not found")
        return ResolvedChild(release.graph, release.id, release.resource_snapshots)
    if version == "latest":
        release = latest_release(graph_id)
        if release is not None:
            return ResolvedChild(release.graph, release.id, release.resource_snapshots)
    draft = storage.get_graph(graph_id)
    if draft is None:
        raise ValueError(f"graph {graph_id!r} not found")
    return ResolvedChild(draft, None, None)


# ------------------------------------------------------------ child input


def _render(template: str, values: dict[str, Any]) -> str:
    try:
        return template.format(**values)
    except (KeyError, IndexError, ValueError):
        return template


def build_child_input(
    node: GraphNode, upstream: Any, variables: dict[str, Any], inputs: list[str]
) -> dict[str, Any]:
    """The child's run input. With `inputMapping`, each mapped variable is
    its template rendered over the parent's variables plus `{upstream}`;
    unmapped inputs fall back to a same-named parent variable. Without a
    mapping the upstream output feeds the child's first input."""
    parent_vars = {k: v for k, v in variables.items() if not k.startswith("__")}
    mapping = {k: v for k, v in (node.config.get("inputMapping") or {}).items() if v}
    upstream_text = upstream if isinstance(upstream, str) else str(upstream)
    values = {**parent_vars, "upstream": upstream_text}
    child_input: dict[str, Any] = {}
    for index, name in enumerate(inputs):
        if name in mapping:
            child_input[name] = _render(str(mapping[name]), values)
        elif not mapping and index == 0:
            child_input[name] = upstream_text
        elif name in parent_vars:
            child_input[name] = parent_vars[name]
    return child_input


# ------------------------------------------------------------ cycles/depth


def reference_problems(graph: GraphDefinition) -> dict[str, tuple[str, str]]:
    """`{node_id: (code, message)}` for subgraph nodes whose reference chain
    loops back (SUBGRAPH_CYCLE) or nests deeper than MAX_DEPTH
    (SUBGRAPH_DEPTH). Deeper levels follow each graph's saved draft."""
    memo: dict[str, int] = {}

    def depth_below(graph_id: str, path: tuple[str, ...]) -> int:
        """Nesting depth under `graph_id`; -1 when a cycle is reachable."""
        if graph_id in memo:
            return memo[graph_id]
        child = storage.get_graph(graph_id)
        best = 0
        for sub in subgraph_nodes(child) if child else []:
            target = target_graph_id(sub)
            if not target:
                continue
            if target in path:
                return -1
            below = depth_below(target, (*path, target))
            if below < 0:
                return -1
            best = max(best, below + 1)
        memo[graph_id] = best
        return best

    problems: dict[str, tuple[str, str]] = {}
    for node in subgraph_nodes(graph):
        target = target_graph_id(node)
        if not target or storage.get_graph(target) is None:
            continue
        below = -1 if target == graph.id else depth_below(target, (graph.id, target))
        if below < 0:
            problems[node.id] = (
                "SUBGRAPH_CYCLE",
                f"subgraph node {node.id!r}: graphId: {target!r} leads back to this graph",
            )
        elif below + 1 > MAX_DEPTH:
            problems[node.id] = (
                "SUBGRAPH_DEPTH",
                f"subgraph node {node.id!r}: graphId: nesting is {below + 1} levels deep "
                f"(max {MAX_DEPTH})",
            )
    return problems


def used_by(graph_id: str) -> list[dict[str, Any]]:
    """Saved graphs with a subgraph node pointing at `graph_id`."""
    parents: list[dict[str, Any]] = []
    for candidate in storage.list_graph_catalog():
        node_ids = [ref.node_id for ref in candidate.subgraphs if ref.graph_id == graph_id]
        if node_ids:
            parents.append({"graph_id": candidate.id, "name": candidate.name, "node_ids": node_ids})
    return parents


# ------------------------------------------------------------ extract


class ExtractError(ValueError):
    pass


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:32] or "subgraph"


def _unique_id(base: str, taken: set[str]) -> str:
    candidate, n = base, 1
    while candidate in taken:
        n += 1
        candidate = f"{base}_{n}"
    return candidate


def _referenced_variables(nodes: list[GraphNode]) -> list[str]:
    found: list[str] = []
    for node in nodes:
        for value in node.config.values():
            if not isinstance(value, str):
                continue
            for name in _TEMPLATE_VAR.findall(value):
                if name != "upstream" and name not in found:
                    found.append(name)
    return found


def extract_subgraph(
    parent: GraphDefinition, node_ids: list[str], name: str
) -> tuple[GraphDefinition, GraphDefinition]:
    """Move a connected selection into a new child graph. Returns
    `(child, proposed_parent)`; the caller saves the child and the Studio
    applies the proposed parent as one undoable edit.

    The selection needs at least one edge in and exactly one edge out (the
    child's single result), can't hold input/output nodes, and must be
    connected. The child gets one input node -- named after the first
    parent variable the selection's templates use -- and an output node;
    the parent gets one `subgraph` node wired in their place."""
    by_id = {node.id: node for node in parent.nodes}
    selected = [by_id[i] for i in dict.fromkeys(node_ids) if i in by_id]
    if not selected or len(selected) != len(set(node_ids)):
        raise ExtractError("Select existing nodes to extract.")
    chosen = {node.id for node in selected}
    if any(node.type in (NodeType.INPUT, NodeType.OUTPUT) for node in selected):
        raise ExtractError("Input and output nodes can't be extracted.")

    adjacency: dict[str, set[str]] = {node_id: set() for node_id in chosen}
    for edge in parent.edges:
        if edge.source in chosen and edge.target in chosen:
            adjacency[edge.source].add(edge.target)
            adjacency[edge.target].add(edge.source)
    start = next(iter(chosen))
    seen, queue = {start}, deque([start])
    while queue:
        for nxt in adjacency[queue.popleft()] - seen:
            seen.add(nxt)
            queue.append(nxt)
    if seen != chosen:
        raise ExtractError("The selection must be connected.")

    incoming = [e for e in parent.edges if e.source not in chosen and e.target in chosen]
    outgoing = [e for e in parent.edges if e.source in chosen and e.target not in chosen]
    internal = [e for e in parent.edges if e.source in chosen and e.target in chosen]
    if not incoming:
        raise ExtractError("The selection needs at least one incoming edge.")
    if len(outgoing) != 1:
        raise ExtractError(
            f"The selection needs exactly one outgoing edge (it has {len(outgoing)})."
        )

    parent_vars = child_inputs(parent)
    variable = next((v for v in _referenced_variables(selected) if v in parent_vars), "input")

    # Child: input -> (selection) -> output, laid out left to right.
    min_x = min(node.position.x for node in selected)
    min_y = min(node.position.y for node in selected)
    max_x = max(node.position.x for node in selected)
    mid_y = sum(node.position.y for node in selected) / len(selected) - min_y
    taken = set(chosen)
    input_id = _unique_id("input_1", taken)
    taken.add(input_id)
    output_id = _unique_id("output_1", taken)
    child_nodes = [
        GraphNode(
            id=input_id,
            type=NodeType.INPUT,
            position=NodePosition(x=0, y=mid_y),
            config={"variableName": variable},
        ),
        *[
            node.model_copy(
                update={
                    "position": NodePosition(
                        x=node.position.x - min_x + 300, y=node.position.y - min_y
                    )
                },
                deep=True,
            )
            for node in selected
        ],
        GraphNode(
            id=output_id,
            type=NodeType.OUTPUT,
            position=NodePosition(x=max_x - min_x + 600, y=mid_y),
        ),
    ]
    entry_targets = list(dict.fromkeys(edge.target for edge in incoming))
    exit_edge = outgoing[0]
    child_edges = [
        *[edge.model_copy(deep=True) for edge in internal],
        *[
            GraphEdge(id=f"e_{input_id}_{target}", source=input_id, target=target)
            for target in entry_targets
        ],
        GraphEdge(
            id=f"e_{exit_edge.source}_{output_id}", source=exit_edge.source, target=output_id
        ),
    ]
    child = GraphDefinition(
        id=f"{_slug(name)}_{uuid.uuid4().hex[:6]}",
        name=name.strip() or "Subgraph",
        entry_node_id=input_id,
        nodes=child_nodes,
        edges=child_edges,
        orientation=parent.orientation,
    )

    # Proposed parent: the selection becomes one subgraph node.
    parent_ids = {node.id for node in parent.nodes}
    sub_id = _unique_id("subgraph_1", parent_ids)
    center = NodePosition(
        x=sum(node.position.x for node in selected) / len(selected),
        y=sum(node.position.y for node in selected) / len(selected),
    )
    config: dict[str, Any] = {"graphId": child.id, "version": "latest"}
    if variable in parent_vars:
        config["inputMapping"] = {variable: "{" + variable + "}"}
    sub_node = GraphNode(id=sub_id, type=NodeType.SUBGRAPH, position=center, config=config)

    rewired: list[GraphEdge] = []
    seen_sources: set[str] = set()
    for edge in incoming:
        if edge.source in seen_sources:
            continue
        seen_sources.add(edge.source)
        rewired.append(edge.model_copy(update={"target": sub_id, "target_port": None}))
    rewired.append(exit_edge.model_copy(update={"source": sub_id, "source_port": None}))
    kept_edges = [
        edge for edge in parent.edges if edge.source not in chosen and edge.target not in chosen
    ]
    groups = None
    if parent.groups:
        pruned = [
            group.model_copy(update={"node_ids": [i for i in group.node_ids if i not in chosen]})
            for group in parent.groups
        ]
        groups = [group for group in pruned if group.node_ids] or None
    proposed = parent.model_copy(
        update={
            "nodes": [node for node in parent.nodes if node.id not in chosen] + [sub_node],
            "edges": kept_edges + rewired,
            "groups": groups,
        },
        deep=True,
    )
    return child, proposed


__all__ = [
    "MAX_DEPTH",
    "ExtractError",
    "ResolvedChild",
    "build_child_input",
    "child_inputs",
    "extract_subgraph",
    "latest_release",
    "reference_problems",
    "release_for",
    "resolve_child",
    "snapshot_key",
    "subgraph_nodes",
    "target_graph_id",
    "target_version",
    "used_by",
]
