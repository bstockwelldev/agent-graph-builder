"""Canonical graph schema for the POC.

This is a deliberately trimmed slice of the platform's canonical graph schema
(EDD section 7): no ports/schemaRef objects, no entity version references, no
weighted/parallel/approval edges. Enough to prove the graph-authoring and
graph-driven-execution thesis.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


class NodeType(StrEnum):
    INPUT = "input"
    PROMPT = "prompt"
    LLM = "llm"
    TOOL = "tool"
    ROUTER = "router"
    OUTPUT = "output"


class EdgeKind(StrEnum):
    SEQUENCE = "sequence"
    CONDITIONAL = "conditional"
    DEFAULT = "default"


class NodePosition(BaseModel):
    x: float
    y: float


class GraphNode(BaseModel):
    id: str
    type: NodeType
    position: NodePosition = NodePosition(x=0, y=0)
    config: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    kind: EdgeKind = EdgeKind.SEQUENCE
    # For conditional edges: matched against the nearest upstream router's
    # classification output using simple substring matching, e.g. "technical".
    condition: str | None = None


class GraphDefinition(BaseModel):
    id: str
    name: str
    entry_node_id: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    updated_at: str | None = None


class Diagnostic(BaseModel):
    severity: Literal["error", "warning"]
    code: str
    node_id: str | None = None
    message: str
    blocking: bool = False


class CompileResult(BaseModel):
    graph_id: str
    compiled_workflow_id: str | None
    diagnostics: list[Diagnostic]
    ok: bool


class RunRequest(BaseModel):
    graph_id: str
    input: dict[str, Any] = Field(default_factory=dict)


class RunSummary(BaseModel):
    run_id: str
    graph_id: str
    status: Literal["queued", "running", "succeeded", "failed"]
    result: Any | None = None


class NodeTrace(BaseModel):
    node_id: str
    node_type: NodeType
    status: Literal["running", "succeeded", "failed"]
    input: Any = None
    output: Any = None
    started_at: str
    completed_at: str | None = None
    error: str | None = None
