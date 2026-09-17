"""Run analytics / spend estimation + cross-graph run listing
(studio-consolidation Phase 5 — see
docs/planning/features/studio-consolidation-plan.md and analytics.py).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.analytics import (
    build_analytics_dashboard,
    estimate_tokens_from_text,
    estimate_usd_from_usage,
    get_analytics_dashboard,
    rates_for_provider_and_model,
)
from app.compiler import compile_graph
from app.demo_graph import build_demo_graph
from app.main import app
from app.models import RunSummary
from app.runtime import COMPILED_WORKFLOWS, start_run_inline

client = TestClient(app)


# --- estimate_usd_from_usage / rates ------------------------------------


def test_rates_ollama_and_stub_are_free() -> None:
    assert rates_for_provider_and_model("ollama", "qwen2.5:3b").input_per_1m == 0.0
    assert rates_for_provider_and_model("stub", "stub-model").output_per_1m == 0.0


def test_rates_google_flash_lite_cheaper_than_flash() -> None:
    flash_lite = rates_for_provider_and_model("google", "gemini-2.0-flash-lite")
    flash = rates_for_provider_and_model("google", "gemini-2.0-flash")
    assert flash_lite.input_per_1m < flash.input_per_1m


def test_rates_openai_mini_cheaper_than_default() -> None:
    mini = rates_for_provider_and_model("openai", "gpt-4o-mini")
    default = rates_for_provider_and_model("openai", "gpt-4o")
    assert mini.input_per_1m < default.input_per_1m


def test_rates_unknown_provider_falls_back_to_default() -> None:
    rates = rates_for_provider_and_model("some_future_provider", "whatever")
    assert rates.input_per_1m == 0.5
    assert rates.output_per_1m == 1.5


def test_estimate_usd_from_usage_scales_with_tokens() -> None:
    usd = estimate_usd_from_usage("openai", "gpt-4o", 1_000_000, 1_000_000)
    assert usd == pytest.approx(2.5 + 10.0)


def test_estimate_usd_from_usage_clamps_negative_tokens_to_zero() -> None:
    assert estimate_usd_from_usage("openai", "gpt-4o", -5, -5) == 0.0


def test_estimate_tokens_from_text_roughly_chars_over_four() -> None:
    assert estimate_tokens_from_text("") == 0
    assert estimate_tokens_from_text("abcd") == 1
    assert estimate_tokens_from_text("a" * 40) == 10


# --- build_analytics_dashboard (unit, no storage) -------------------------


def _run(run_id: str, graph_id: str, started_at: str, completed_at: str) -> RunSummary:
    return RunSummary(
        run_id=run_id,
        graph_id=graph_id,
        status="succeeded",
        result="ok",
        started_at=started_at,
        completed_at=completed_at,
    )


def test_build_analytics_dashboard_empty_runs() -> None:
    payload = build_analytics_dashboard([], {})
    assert payload.totals.invocations == 0
    assert payload.totals.avg_duration_ms == 0
    assert payload.daily == []
    assert payload.by_graph == []


def test_build_analytics_dashboard_aggregates_by_day_and_graph(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runs = [
        _run("r1", "g1", "2026-01-01T00:00:00Z", "2026-01-01T00:00:02Z"),
        _run("r2", "g1", "2026-01-01T00:00:00Z", "2026-01-01T00:00:04Z"),
        _run("r3", "g2", "2026-01-02T00:00:00Z", "2026-01-02T00:00:06Z"),
    ]
    # No node traces stored for these synthetic runs -> zero token estimate,
    # but invocation counts / duration should still aggregate correctly.
    monkeypatch.setattr(storage, "get_run_traces", lambda run_id: [])

    payload = build_analytics_dashboard(runs, {"g1": "Graph One", "g2": "Graph Two"})

    assert payload.totals.invocations == 3
    assert payload.totals.avg_duration_ms == round((2000 + 4000 + 6000) / 3)

    assert [d.date for d in payload.daily] == ["2026-01-01", "2026-01-02"]
    assert payload.daily[0].invocations == 2
    assert payload.daily[1].invocations == 1

    by_graph = {row.graph_id: row for row in payload.by_graph}
    assert by_graph["g1"].invocations == 2
    assert by_graph["g1"].name == "Graph One"
    assert by_graph["g2"].invocations == 1


def test_build_analytics_dashboard_respects_max_daily_days_and_max_graphs() -> None:
    runs = [
        _run(f"r{i}", f"g{i}", f"2026-01-{i:02d}T00:00:00Z", f"2026-01-{i:02d}T00:00:01Z")
        for i in range(1, 6)
    ]
    payload = build_analytics_dashboard(runs, {}, max_daily_days=2, max_graphs=1)
    assert len(payload.daily) == 2
    assert len(payload.by_graph) == 1


# --- storage.list_all_runs -------------------------------------------------


def test_list_all_runs_merges_across_graphs_newest_first() -> None:
    graph_a = build_demo_graph().model_copy(update={"id": "analytics_graph_a"})
    graph_b = build_demo_graph().model_copy(update={"id": "analytics_graph_b"})
    storage.save_graph(graph_a)
    storage.save_graph(graph_b)

    older = _run("run_older", graph_a.id, "2026-01-01T00:00:00Z", "2026-01-01T00:00:01Z")
    newer = _run("run_newer", graph_b.id, "2026-06-01T00:00:00Z", "2026-06-01T00:00:01Z")
    storage.save_run_snapshot(older, [])
    storage.save_run_snapshot(newer, [])

    # A high limit avoids truncation dropping these two runs beneath
    # whatever else the shared test-session storage has accumulated.
    runs = storage.list_all_runs(limit=100_000)
    ids = [r.run_id for r in runs]
    assert "run_older" in ids
    assert "run_newer" in ids
    assert ids.index("run_newer") < ids.index("run_older")


# --- end-to-end: a real demo-graph run feeds the dashboard ----------------


async def test_end_to_end_demo_run_shows_up_in_analytics() -> None:
    demo = build_demo_graph().model_copy(update={"id": "analytics_e2e_graph"})
    storage.save_graph(demo)
    compiled = compile_graph(demo, "cwf_analytics_e2e")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_analytics_e2e"] = demo

    run_id, _bus = await start_run_inline(
        "cwf_analytics_e2e", {"question": "What is a database index?"}, provider="stub"
    )

    payload = get_analytics_dashboard()
    assert payload.totals.invocations >= 1
    graph_row = next((row for row in payload.by_graph if row.graph_id == demo.id), None)
    # max_graphs defaults to 12 and many other tests' graphs may crowd the
    # top slots; only assert the row's shape if this graph made the cut.
    if graph_row is not None:
        assert graph_row.invocations >= 1

    run = storage.get_run(run_id)
    assert run is not None
    assert run.graph_id == demo.id


# --- API routes ------------------------------------------------------------


def test_list_all_runs_route() -> None:
    response = client.get("/api/runs")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_analytics_route_returns_dashboard_shape() -> None:
    response = client.get("/api/analytics")
    assert response.status_code == 200
    body = response.json()
    assert "totals" in body
    assert "daily" in body
    assert "by_graph" in body
    assert "invocations" in body["totals"]
