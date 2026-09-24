"""Node blast radius (large-graph complexity, Wave 7a / STO-610).

"What does changing this node reach?" -- downstream nodes and outputs,
routers whose decisions may shift, the registry resources it pulls in, how
often it has run, which published releases contain it (and whether the
draft has changed it since), and which saved datasets stub its output.
Read-only; computed against a draft graph so unsaved edits count.
"""

from __future__ import annotations

from collections import deque

from pydantic import BaseModel, Field

from . import storage
from .bindings import node_bindings
from .fingerprint import diff_graphs
from .models import GraphDefinition, GraphRelease, NodeType
from .node_analytics import get_node_history

_ROUTING = {NodeType.ROUTER, NodeType.BRANCH}


class ImpactBinding(BaseModel):
    field: str
    kind: str
    resource_id: str


class ImpactRuns(BaseModel):
    executions: int
    last_run_id: str | None = None
    last_run_at: str | None = None


class ImpactRelease(BaseModel):
    release_id: str
    created_at: str
    changed_since: bool


class ImpactDataset(BaseModel):
    dataset_id: str
    name: str


class ImpactGraph(BaseModel):
    graph_id: str
    name: str | None = None
    version: str


class NodeImpact(BaseModel):
    node_id: str
    downstream: list[str] = Field(default_factory=list)
    outputs_reached: list[str] = Field(default_factory=list)
    routers_downstream: list[str] = Field(default_factory=list)
    upstream_count: int = 0
    bindings: list[ImpactBinding] = Field(default_factory=list)
    runs: ImpactRuns
    releases: list[ImpactRelease] = Field(default_factory=list)
    datasets: list[ImpactDataset] = Field(default_factory=list)
    # Wave 7c: the graph a subgraph node runs ("Uses graph").
    uses_graph: ImpactGraph | None = None


def _uses_graph(node) -> ImpactGraph | None:
    if node.type != NodeType.SUBGRAPH or not node.config.get("graphId"):
        return None
    graph_id = str(node.config["graphId"])
    child = storage.get_graph(graph_id)
    return ImpactGraph(
        graph_id=graph_id,
        name=child.name if child else None,
        version=str(node.config.get("version") or "latest"),
    )


def _walk(graph: GraphDefinition, start: str, *, forward: bool) -> list[str]:
    adjacency: dict[str, list[str]] = {}
    for edge in graph.edges:
        a, b = (edge.source, edge.target) if forward else (edge.target, edge.source)
        adjacency.setdefault(a, []).append(b)
    seen = {start}
    order: list[str] = []
    queue = deque([start])
    while queue:
        for nxt in adjacency.get(queue.popleft(), []):
            if nxt not in seen:
                seen.add(nxt)
                order.append(nxt)
                queue.append(nxt)
    return order


def _release_changed(release: GraphRelease, draft: GraphDefinition, node_id: str) -> bool:
    deltas = diff_graphs(release.graph, draft)
    return any(change.get("id") == node_id for change in deltas["node_changes"])


def compute_node_impact(graph: GraphDefinition, node_id: str) -> NodeImpact:
    """Raises KeyError when `node_id` isn't in `graph`."""
    nodes = {n.id: n for n in graph.nodes}
    node = nodes[node_id]
    downstream = _walk(graph, node_id, forward=True)

    history = get_node_history(graph.id, node_id, limit=1000)
    runs = ImpactRuns(
        executions=len(history),
        last_run_id=history[0].run_id if history else None,
        last_run_at=history[0].started_at if history else None,
    )

    releases: list[ImpactRelease] = []
    for entry in storage.get_release_index(graph.id):
        payload = storage.get_release(entry["release_id"], graph.id)
        if payload is None:
            continue
        release = GraphRelease.model_validate(payload)
        if node_id not in {n.id for n in release.graph.nodes}:
            continue
        releases.append(
            ImpactRelease(
                release_id=release.id,
                created_at=release.created_at,
                changed_since=_release_changed(release, graph, node_id),
            )
        )
    releases.sort(key=lambda r: r.created_at, reverse=True)

    datasets = [
        ImpactDataset(dataset_id=str(item.get("id")), name=str(item.get("name") or item.get("id")))
        for item in storage.list_resources("datasets")
        if any(
            node_id in (fixture.get("node_outputs") or {}) for fixture in item.get("fixtures") or []
        )
    ]

    return NodeImpact(
        node_id=node_id,
        downstream=downstream,
        outputs_reached=[
            n for n in downstream if nodes.get(n) and nodes[n].type == NodeType.OUTPUT
        ],
        routers_downstream=[n for n in downstream if nodes.get(n) and nodes[n].type in _ROUTING],
        upstream_count=len(_walk(graph, node_id, forward=False)),
        bindings=[
            ImpactBinding(field=b.field, kind=b.kind, resource_id=b.resource_id)
            for b in node_bindings(node)
        ],
        runs=runs,
        releases=releases,
        datasets=datasets,
        uses_graph=_uses_graph(node),
    )


__all__ = ["NodeImpact", "compute_node_impact"]
