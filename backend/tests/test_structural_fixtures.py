"""SDK 5/7 (STO-620): the backend compiler and the SDK's local
`validateStructure` agree on a shared fixture set.

`packages/agent-graph-sdk/contract/structural-fixtures.json` lists graphs
and the structural diagnostics each should produce. This test checks the
backend against it; the SDK's src/graph/validate.test.ts checks the SDK
against the same file, so the two implementations can't drift apart.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.compiler import validate_graph
from app.demo_graph import build_demo_graph
from app.models import GraphDefinition

FIXTURES = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "packages/agent-graph-sdk/contract/structural-fixtures.json"
    ).read_text()
)
STRUCTURAL_CODES = set(FIXTURES["codes"])


def _key(diagnostic: dict) -> tuple:
    return (
        diagnostic["code"],
        diagnostic["severity"],
        diagnostic.get("node_id") or "",
        diagnostic.get("edge_id") or "",
    )


@pytest.mark.parametrize("case", FIXTURES["cases"], ids=lambda case: case["name"])
def test_backend_structural_diagnostics_match_the_shared_fixture(case):
    graph = GraphDefinition.model_validate(case["graph"])
    actual = [
        diagnostic.model_dump()
        for diagnostic in validate_graph(graph)
        if diagnostic.code in STRUCTURAL_CODES
    ]
    assert sorted(map(_key, actual)) == sorted(map(_key, case["expected"]))


def test_the_demo_case_is_the_backend_demo_graph():
    demo = next(case for case in FIXTURES["cases"] if case["name"] == "demo graph")
    assert demo["graph"] == build_demo_graph().model_dump(mode="json", exclude_none=True)
