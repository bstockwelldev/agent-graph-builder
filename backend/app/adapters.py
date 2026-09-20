"""The `RuntimeAdapter` boundary and its sole P0 implementation.

Part of the P0 graph foundation program
(docs/planning/features/p0-graph-foundation-design-plan.md), Slice C:
"LangGraph adapter boundary". `LangGraphAdapter` is a thin facade over
`compiler.py`/`runtime.py` rather than a full logic migration: those
modules' internals are untouched here and stay covered by the existing
backend test suite (286 tests as of Slice B) that already proves their
behavior-preservation guarantees — re-deriving that proof under a Slice-C-
scoped refactor would be needless risk for no behavior change. The adapter
exists so a second runtime target (P1+) has a real interface to implement
against, and so `GET /api/runtime-targets/{target_id}/capabilities` has a
single source of truth for what LangGraph does and doesn't support.
"""

from __future__ import annotations

from typing import Protocol

from .compiler import validate_graph
from .models import CapabilityEntry, CapabilityMatrix, CompileResult, Diagnostic, GraphDefinition
from .runtime import compile_workflow


class RuntimeAdapter(Protocol):
    target_id: str

    def capabilities(self) -> CapabilityMatrix: ...

    def validate(self, graph: GraphDefinition) -> list[Diagnostic]: ...

    def compile(self, graph: GraphDefinition) -> CompileResult: ...


# Mirrors the design doc's "LangGraph adapter boundary" table verbatim —
# feature ids are stable strings, not free text, so a future capability
# diagnostic (`LANGGRAPH_CAPABILITY_UNSUPPORTED`) can reference one by id.
_LANGGRAPH_CAPABILITY_MATRIX = CapabilityMatrix(
    target_id="langgraph",
    capabilities=[
        CapabilityEntry(
            feature="sequence_conditional_default_edges",
            supported=True,
            notes="Retains current router/branch behavior.",
        ),
        CapabilityEntry(
            feature="default_ports_and_contract_validation",
            supported=True,
            notes="Enforced at graph boundaries and before executor dispatch.",
        ),
        CapabilityEntry(
            feature="deterministic_transforms",
            supported=True,
            notes="Applied by generated adapter wrappers.",
        ),
        CapabilityEntry(
            feature="current_12_executors", supported=True, notes="Uses existing executor registry."
        ),
        CapabilityEntry(
            feature="human_gate_pause_resume",
            supported=True,
            notes=(
                "Process-local pause state emits DURABLE_CHECKPOINT_UNAVAILABLE "
                "until persistence exists."
            ),
        ),
        CapabilityEntry(
            feature="cycles_unbounded_loops_parallel_fanout",
            supported=False,
            notes="Capability or existing structural error.",
        ),
        CapabilityEntry(
            feature="target_specific_extension_nodes",
            supported=False,
            notes="Explicit capability error.",
        ),
    ],
)


class LangGraphAdapter:
    """The only P0 `RuntimeAdapter` implementation."""

    target_id = "langgraph"

    def capabilities(self) -> CapabilityMatrix:
        return _LANGGRAPH_CAPABILITY_MATRIX

    def validate(self, graph: GraphDefinition) -> list[Diagnostic]:
        return validate_graph(graph)

    def compile(self, graph: GraphDefinition) -> CompileResult:
        return compile_workflow(graph)


_ADAPTERS: dict[str, RuntimeAdapter] = {"langgraph": LangGraphAdapter()}


def get_adapter(target_id: str) -> RuntimeAdapter | None:
    return _ADAPTERS.get(target_id)


__all__ = ["RuntimeAdapter", "LangGraphAdapter", "get_adapter"]
