"""Slice 5 (resource-forms-consistency-plan): the backend's GenUI surface
schema agrees with the studio's, and human_gate configs are checked
against it."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.genui import surface_error
from app.node_configs import HumanGateConfig

FIXTURES = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "packages/agent-graph-sdk/contract/genui-surfaces.json"
    ).read_text()
)


@pytest.mark.parametrize("case", FIXTURES["valid"], ids=lambda case: case["name"])
def test_valid_surfaces(case: dict) -> None:
    assert surface_error(case["surface"]) is None


@pytest.mark.parametrize("case", FIXTURES["invalid"], ids=lambda case: case["name"])
def test_invalid_surfaces(case: dict) -> None:
    assert surface_error(case["surface"]) is not None


def test_human_gate_reports_where_a_surface_is_wrong() -> None:
    bad = {"root": {"type": "Select", "id": "s", "props": {"label": "S", "options": []}}}
    with pytest.raises(ValueError, match=r"isn't a GenUI surface: root\.props\.options"):
        HumanGateConfig(content="ok", genuiCheckpointSurfaceJson=json.dumps(bad))
    with pytest.raises(ValueError, match="must be valid JSON"):
        HumanGateConfig(content="ok", genuiCheckpointSurfaceJson="{")
    good = FIXTURES["valid"][0]["surface"]
    assert HumanGateConfig(content="ok", genuiCheckpointSurfaceJson=json.dumps(good))
    assert HumanGateConfig(content="ok", genuiCheckpointSurfaceJson="  ")
