"""resolve_requested_model: the shared model-resolution contract the studio mirrors."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.provider_defaults import (
    DEMO_LLM_MODEL,
    PLACEHOLDER_MODELS,
    resolve_model_for_provider,
    resolve_requested_model,
)

CONTRACT_PATH = (
    Path(__file__).resolve().parents[2] / "packages/agent-graph-sdk/contract/model-resolution.json"
)
CONTRACT = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def test_placeholders_match_the_contract() -> None:
    assert sorted(PLACEHOLDER_MODELS) == sorted(CONTRACT["placeholderModels"])


@pytest.mark.parametrize("case", CONTRACT["cases"], ids=lambda case: case["name"])
def test_resolve_requested_model_matches_the_contract(case: dict) -> None:
    requested, source = resolve_requested_model(
        case["run_model"], case["profile_model"], case["node_model"]
    )
    assert {"requested_model": requested, "source": source} == case["expect"]


def test_default_source_falls_through_to_the_provider_default() -> None:
    requested, source = resolve_requested_model(None, None, DEMO_LLM_MODEL)
    assert source == "default"
    assert resolve_model_for_provider("groq", requested) == "llama-3.3-70b-versatile"
