"""Run analytics / spend estimation (studio-consolidation Phase 5 — see
docs/planning/features/studio-consolidation-plan.md). Ported from
micro-ui-agent-builder's `lib/server/estimate-llm-spend.ts` +
`analytics-dashboard.ts`, reading from `storage.list_runs_with_traces()` (one read per run)
instead of MUI's own JSONL append log
(`run-analytics-store.ts` is not ported at all — AGB's durable run
snapshots already are the append log, and a JSONL side-file duplicating
that data was never necessary here, exactly per the plan's own call: "AGB's
durable run snapshots are a better source than MUI's JSONL").

One real gap, disclosed rather than worked around: MUI's token counts come
from the Vercel AI SDK's real `usage` metadata on every model call. AGB's
`ChatModel.generate()` returns a plain string with no usage data, and nodes
don't track it. `estimate_tokens_from_text` below is therefore a rough
chars/4 heuristic applied to each `llm`/`tool_loop` node trace's recorded
prompt/response text — an estimate on top of MUI's own already-labeled
"rough USD estimates ... not billing truth." Good enough for an
order-of-magnitude spend/usage dashboard, not a billing source.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from . import storage
from .models import NodeTrace, NodeType, RunSummary

_DEFAULT_MAX_DAILY_DAYS = 30
_DEFAULT_MAX_GRAPHS = 12
_TOKEN_NODE_TYPES = {NodeType.LLM, NodeType.TOOL_LOOP}


@dataclass(frozen=True)
class TokenRates:
    input_per_1m: float
    output_per_1m: float


_DEFAULT_RATES = TokenRates(input_per_1m=0.5, output_per_1m=1.5)


def rates_for_provider_and_model(provider_label: str, model_ref: str) -> TokenRates:
    p = provider_label.lower()
    m = model_ref.lower()

    if p.startswith("ollama") or p.startswith("stub"):
        return TokenRates(0.0, 0.0)
    if p.startswith("google"):
        if "flash-lite" in m or "flash_lite" in m:
            return TokenRates(0.075, 0.3)
        if "flash" in m:
            return TokenRates(0.15, 0.6)
        return TokenRates(0.5, 1.5)
    if p.startswith("openai"):
        if "mini" in m or "nano" in m:
            return TokenRates(0.15, 0.6)
        return TokenRates(2.5, 10.0)
    if p.startswith("groq"):
        return TokenRates(0.05, 0.08)
    if p.startswith("azure"):
        return TokenRates(2.5, 10.0)
    return _DEFAULT_RATES


def estimate_usd_from_usage(
    provider_label: str, model_ref: str, input_tokens: int, output_tokens: int
) -> float:
    rates = rates_for_provider_and_model(provider_label, model_ref)
    return (max(0, input_tokens) / 1_000_000) * rates.input_per_1m + (
        max(0, output_tokens) / 1_000_000
    ) * rates.output_per_1m


def estimate_tokens_from_text(text: str) -> int:
    """Rough chars/4 heuristic — see module docstring."""
    return max(0, round(len(text) / 4))


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _day_key(value: str | None) -> str | None:
    dt = _parse_iso(value)
    if dt is None:
        return value[:10] if value else None
    return dt.date().isoformat()


class RunTokenEstimate(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_usd: float


def estimate_run_tokens(run: RunSummary, traces: list[NodeTrace] | None = None) -> RunTokenEstimate:
    """`traces` when the caller already has them; otherwise one storage read."""
    input_tokens = 0
    output_tokens = 0
    estimated_usd = 0.0
    if traces is None:
        traces = storage.get_run_traces(run.run_id)
    for trace in traces:
        if trace.node_type not in _TOKEN_NODE_TYPES or trace.status != "succeeded":
            continue
        input_repr = trace.input if isinstance(trace.input, dict) else {}
        provider = str(input_repr.get("provider") or "unknown")
        model = str(input_repr.get("model") or "unknown")
        prompt_text = f"{input_repr.get('systemPrompt') or ''}{input_repr.get('userPrompt') or ''}"
        output_text = "" if trace.output is None else str(trace.output)
        node_input_tokens = estimate_tokens_from_text(prompt_text)
        node_output_tokens = estimate_tokens_from_text(output_text)
        input_tokens += node_input_tokens
        output_tokens += node_output_tokens
        estimated_usd += estimate_usd_from_usage(
            provider, model, node_input_tokens, node_output_tokens
        )
    return RunTokenEstimate(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        estimated_usd=estimated_usd,
    )


def _run_duration_ms(run: RunSummary) -> int | None:
    started = _parse_iso(run.started_at)
    completed = _parse_iso(run.completed_at)
    if started is None or completed is None:
        return None
    return max(0, round((completed - started).total_seconds() * 1000))


class AnalyticsDailyPoint(BaseModel):
    date: str
    invocations: int
    tokens: int
    estimated_usd: float


class AnalyticsGraphRow(BaseModel):
    graph_id: str
    name: str
    invocations: int
    tokens: int
    estimated_usd: float


class AnalyticsTotals(BaseModel):
    invocations: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_usd: float
    avg_duration_ms: int


class AnalyticsDashboardPayload(BaseModel):
    totals: AnalyticsTotals
    daily: list[AnalyticsDailyPoint]
    by_graph: list[AnalyticsGraphRow]


def build_analytics_dashboard(
    runs: list[RunSummary],
    graph_names: dict[str, str],
    *,
    max_daily_days: int = _DEFAULT_MAX_DAILY_DAYS,
    max_graphs: int = _DEFAULT_MAX_GRAPHS,
    traces_by_run: Mapping[str, list[NodeTrace]] | None = None,
) -> AnalyticsDashboardPayload:
    """`traces_by_run` avoids a trace read per run; runs missing from it
    fall back to storage."""
    input_tokens = 0
    output_tokens = 0
    estimated_usd = 0.0
    duration_sum = 0
    duration_count = 0

    daily: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"invocations": 0, "tokens": 0, "estimated_usd": 0.0}
    )
    by_graph: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"invocations": 0, "tokens": 0, "estimated_usd": 0.0}
    )

    for run in runs:
        estimate = estimate_run_tokens(
            run, traces_by_run.get(run.run_id) if traces_by_run is not None else None
        )
        input_tokens += estimate.input_tokens
        output_tokens += estimate.output_tokens
        estimated_usd += estimate.estimated_usd

        duration_ms = _run_duration_ms(run)
        if duration_ms is not None:
            duration_sum += duration_ms
            duration_count += 1

        day = _day_key(run.started_at)
        if day is not None:
            bucket = daily[day]
            bucket["invocations"] += 1
            bucket["tokens"] += estimate.total_tokens
            bucket["estimated_usd"] += estimate.estimated_usd

        graph_bucket = by_graph[run.graph_id]
        graph_bucket["invocations"] += 1
        graph_bucket["tokens"] += estimate.total_tokens
        graph_bucket["estimated_usd"] += estimate.estimated_usd

    invocations = len(runs)
    avg_duration_ms = round(duration_sum / duration_count) if duration_count else 0

    sorted_days = sorted(daily.keys())
    tail_days = sorted_days[-max_daily_days:] if max_daily_days else sorted_days
    daily_points = [
        AnalyticsDailyPoint(
            date=day,
            invocations=daily[day]["invocations"],
            tokens=daily[day]["tokens"],
            estimated_usd=daily[day]["estimated_usd"],
        )
        for day in tail_days
    ]

    graph_rows = sorted(
        (
            AnalyticsGraphRow(
                graph_id=graph_id,
                name=graph_names.get(graph_id, graph_id),
                invocations=v["invocations"],
                tokens=v["tokens"],
                estimated_usd=v["estimated_usd"],
            )
            for graph_id, v in by_graph.items()
        ),
        key=lambda row: row.invocations,
        reverse=True,
    )[:max_graphs]

    return AnalyticsDashboardPayload(
        totals=AnalyticsTotals(
            invocations=invocations,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            estimated_usd=estimated_usd,
            avg_duration_ms=avg_duration_ms,
        ),
        daily=daily_points,
        by_graph=graph_rows,
    )


def get_analytics_dashboard(*, run_limit: int = 500) -> AnalyticsDashboardPayload:
    pairs = storage.list_runs_with_traces(limit=run_limit)
    graph_names = {entry.id: entry.name for entry in storage.list_graph_catalog()}
    return build_analytics_dashboard(
        [run for run, _ in pairs],
        graph_names,
        traces_by_run={run.run_id: traces for run, traces in pairs},
    )
