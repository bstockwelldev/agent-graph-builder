"""Scored evals: run a graph over a dataset's fixtures and score each run
against the fixture's `expected` fields.

An `EvalSuite` (resource_models.py) names the graph, the dataset and the
scorers. A suite run executes one graph run per fixture, the way the
Routing Lab does (routing_lab.py): on Stub through `simulate_graph` (never
a live call), or on a live provider through the normal runtime with the
fixture's `node_outputs` pre-seeded. Each case gets one score per scorer
that had something to check, and the stored `EvalRun` keeps them all so two
runs can be compared case by case.
"""

from __future__ import annotations

import json
import re
import time
import uuid
from typing import Any

from . import runtime, storage
from .analytics import estimate_run_tokens
from .events import now_iso
from .models import (
    EvalCaseDelta,
    EvalCaseResult,
    EvalComparison,
    EvalRun,
    EvalScore,
    Fixture,
    FixtureExpectation,
    GraphDefinition,
    RunSummary,
)
from .resource_models import EvalScorer, EvalSuite
from .rubric import analyze_prompt
from .simulate import SimulateBlocked, _validate_fixture_targets, simulate_graph

EVAL_RUN_KIND = "eval_runs"
MAX_CASES = 50
# Live runs stop early (and say so) to stay inside a serverless request.
LIVE_TIME_BUDGET_S = 45.0
RUBRIC_FINDING_LIMIT = 3


class EvalSuiteError(Exception):
    """A request the caller can fix; `status_code` is the HTTP mapping."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


# --- Scorers --------------------------------------------------------------
# Each returns None when the fixture gives it nothing to check, else a score.


def _as_text(output: Any) -> str:
    if output is None:
        return ""
    if isinstance(output, str):
        return output
    return json.dumps(output, sort_keys=True)


def _as_json(output: Any) -> Any:
    if isinstance(output, str):
        try:
            return json.loads(output)
        except ValueError:
            return None
    return output


def _resolve_pointer(document: Any, pointer: str) -> tuple[bool, Any]:
    """RFC 6901 JSON pointer lookup; (found, value)."""
    if pointer in ("", "/"):
        return True, document
    current = document
    for raw in pointer.lstrip("/").split("/"):
        part = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict) and part in current:
            current = current[part]
        elif isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        else:
            return False, None
    return True, current


def score_exact(expected: FixtureExpectation, output: Any, _run: RunSummary | None) -> EvalScore | None:
    if expected.output is None:
        return None
    if isinstance(expected.output, str):
        ok = _as_text(output).strip() == expected.output.strip()
    else:
        ok = _as_json(output) == expected.output
    return EvalScore(scorer="exact", score=1.0 if ok else 0.0, passed=ok, detail="" if ok else "output differs")


def score_contains(expected: FixtureExpectation, output: Any, _run: RunSummary | None) -> EvalScore | None:
    if not expected.contains:
        return None
    text = _as_text(output).lower()
    missing = [needle for needle in expected.contains if needle.lower() not in text]
    found = len(expected.contains) - len(missing)
    score = found / len(expected.contains)
    return EvalScore(
        scorer="contains",
        score=score,
        passed=not missing,
        detail=f"missing: {', '.join(missing)}" if missing else "",
    )


def score_regex(expected: FixtureExpectation, output: Any, _run: RunSummary | None) -> EvalScore | None:
    if not expected.regex:
        return None
    try:
        ok = re.search(expected.regex, _as_text(output)) is not None
    except re.error as exc:
        return EvalScore(scorer="regex", score=0.0, passed=False, detail=f"invalid pattern: {exc}")
    return EvalScore(scorer="regex", score=1.0 if ok else 0.0, passed=ok, detail="" if ok else "no match")


def score_json_field(expected: FixtureExpectation, output: Any, _run: RunSummary | None) -> EvalScore | None:
    if not expected.json_fields:
        return None
    document = _as_json(output)
    wrong: list[str] = []
    for pointer, value in expected.json_fields.items():
        found, actual = _resolve_pointer(document, pointer)
        if not found or actual != value:
            wrong.append(pointer)
    score = (len(expected.json_fields) - len(wrong)) / len(expected.json_fields)
    return EvalScore(
        scorer="json_field",
        score=score,
        passed=not wrong,
        detail=f"wrong or missing: {', '.join(wrong)}" if wrong else "",
    )


def score_route(expected: FixtureExpectation, _output: Any, run: RunSummary | None) -> EvalScore | None:
    if not expected.route:
        return None
    taken = {decision.node_id: decision.selected_target_node_id for decision in (run.route_decisions if run else [])}
    wrong = [
        f"{node_id} went to {taken.get(node_id) or 'nowhere'}, not {target}"
        for node_id, target in expected.route.items()
        if taken.get(node_id) != target
    ]
    score = (len(expected.route) - len(wrong)) / len(expected.route)
    return EvalScore(scorer="route", score=score, passed=not wrong, detail="; ".join(wrong))


def score_rubric(_expected: FixtureExpectation, output: Any, _run: RunSummary | None) -> EvalScore:
    """The static rubric (rubric.py) on the output text: empty output,
    leftover {placeholders} and TODO markers each cost a third."""
    findings = analyze_prompt(_as_text(output))
    score = max(0.0, 1.0 - len(findings) / RUBRIC_FINDING_LIMIT)
    return EvalScore(scorer="rubric", score=score, passed=not findings, detail="; ".join(findings))


SCORERS = {
    "exact": score_exact,
    "contains": score_contains,
    "regex": score_regex,
    "json_field": score_json_field,
    "route": score_route,
    "rubric": score_rubric,
}


def score_case(
    scorers: list[EvalScorer],
    expected: FixtureExpectation | None,
    output: Any,
    run: RunSummary | None,
    pass_threshold: float,
) -> tuple[list[EvalScore], float | None, bool | None]:
    """Scores, the weighted case score, and pass/fail (None when nothing was checked)."""
    expectation = expected or FixtureExpectation()
    scored: list[tuple[EvalScore, float]] = []
    for scorer in scorers:
        result = SCORERS[scorer.kind](expectation, output, run)
        if result is not None:
            scored.append((result, scorer.weight))
    total_weight = sum(weight for _score, weight in scored)
    if not scored or total_weight == 0:
        return [score for score, _weight in scored], None, None
    value = sum(score.score * weight for score, weight in scored) / total_weight
    return [score for score, _weight in scored], round(value, 4), value >= pass_threshold - 1e-9


# --- Running a suite -------------------------------------------------------


async def _run_fixture(
    graph: GraphDefinition,
    fixture: Fixture,
    *,
    provider: str,
    model: str | None,
    api_key: str | None,
    release_resource_snapshots: dict[str, dict[str, object]] | None,
    release_id: str | None,
) -> RunSummary:
    if provider == "stub":
        result = await simulate_graph(
            graph, fixture, release_resource_snapshots=release_resource_snapshots, release_id=release_id
        )
        return result.run
    # Live: the same fixture checks and compile as a simulation, then a real run.
    diagnostics = _validate_fixture_targets(graph, fixture)
    if diagnostics:
        raise SimulateBlocked(diagnostics)
    compiled = runtime.compile_workflow(graph)
    if not compiled.ok or compiled.compiled_workflow_id is None:
        raise SimulateBlocked(compiled.diagnostics)
    run_id, _bus = await runtime.start_run_inline(
        compiled.compiled_workflow_id,
        fixture.input,
        provider=provider,
        model=model,
        api_key=api_key,
        release_resource_snapshots=release_resource_snapshots,
        release_id=release_id,
        fixture_node_outputs=fixture.node_outputs or None,
    )
    summary = runtime.get_run_summary(run_id)
    if summary is None:
        raise RuntimeError(f"eval run {run_id!r} vanished after completion")
    return summary


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 4) if values else None


async def run_eval_suite(
    suite: EvalSuite,
    graph: GraphDefinition,
    fixtures: list[Fixture],
    *,
    provider: str = "stub",
    model: str | None = None,
    api_key: str | None = None,
    release_resource_snapshots: dict[str, dict[str, object]] | None = None,
    release_id: str | None = None,
    time_budget_s: float | None = None,
) -> EvalRun:
    """Runs and scores every fixture (up to MAX_CASES), stores the EvalRun and returns it."""
    started = time.monotonic()
    started_at = now_iso()
    budget = time_budget_s if time_budget_s is not None else (None if provider == "stub" else LIVE_TIME_BUDGET_S)
    partial = len(fixtures) > MAX_CASES
    cases: list[EvalCaseResult] = []
    for index, fixture in enumerate(fixtures[:MAX_CASES]):
        if budget is not None and time.monotonic() - started > budget:
            partial = True
            break
        try:
            run = await _run_fixture(
                graph,
                fixture,
                provider=provider,
                model=model,
                api_key=api_key,
                release_resource_snapshots=release_resource_snapshots,
                release_id=release_id,
            )
        except SimulateBlocked as exc:
            message = "; ".join(d.message for d in exc.diagnostics) or "blocked by diagnostics"
            cases.append(EvalCaseResult(fixture_index=index, status="blocked", error=message))
            continue
        scores, score, passed = score_case(suite.scorers, fixture.expected, run.result, run, suite.pass_threshold)
        cases.append(
            EvalCaseResult(
                fixture_index=index,
                run_id=run.run_id,
                status=run.status,
                output=run.result,
                scores=scores,
                score=score,
                passed=passed,
                estimated_usd=estimate_run_tokens(run).estimated_usd,
                error=run.error,
            )
        )

    scored = [case for case in cases if case.score is not None]
    eval_run = EvalRun(
        id=f"evr_{uuid.uuid4().hex[:12]}",
        suite_id=suite.id,
        graph_id=graph.id,
        release_id=release_id,
        provider=provider,
        model=model,
        started_at=started_at,
        completed_at=now_iso(),
        cases=cases,
        score=_mean([case.score for case in scored if case.score is not None]),
        pass_rate=_mean([1.0 if case.passed else 0.0 for case in scored]),
        estimated_usd=sum(case.estimated_usd for case in cases),
        duration_ms=round((time.monotonic() - started) * 1000),
        partial=partial,
    )
    storage.save_resource(EVAL_RUN_KIND, eval_run.id, eval_run.model_dump(mode="json"))
    return eval_run


def get_eval_run(run_id: str) -> EvalRun | None:
    payload = storage.get_resource(EVAL_RUN_KIND, run_id)
    return EvalRun.model_validate(payload) if payload is not None else None


def list_eval_runs(suite_id: str) -> list[EvalRun]:
    """A suite's runs, newest first."""
    runs = [
        EvalRun.model_validate(payload)
        for payload in storage.list_resources(EVAL_RUN_KIND)
        if payload.get("suite_id") == suite_id
    ]
    return sorted(runs, key=lambda run: (run.started_at, run.id), reverse=True)


def compare_eval_runs(baseline: EvalRun, candidate: EvalRun) -> EvalComparison:
    """Per-case score deltas (matched by fixture index) and the overall change."""

    def delta(a: float | None, b: float | None) -> float | None:
        return round(b - a, 4) if a is not None and b is not None else None

    before = {case.fixture_index: case for case in baseline.cases}
    after = {case.fixture_index: case for case in candidate.cases}
    cases = []
    for index in sorted(set(before) | set(after)):
        a, b = before.get(index), after.get(index)
        cases.append(
            EvalCaseDelta(
                fixture_index=index,
                baseline_score=a.score if a else None,
                candidate_score=b.score if b else None,
                delta=delta(a.score if a else None, b.score if b else None),
                baseline_passed=a.passed if a else None,
                candidate_passed=b.passed if b else None,
            )
        )
    return EvalComparison(
        baseline=baseline,
        candidate=candidate,
        score_delta=delta(baseline.score, candidate.score),
        pass_rate_delta=delta(baseline.pass_rate, candidate.pass_rate),
        cases=cases,
    )


__all__ = [
    "EVAL_RUN_KIND",
    "MAX_CASES",
    "EvalSuiteError",
    "compare_eval_runs",
    "get_eval_run",
    "list_eval_runs",
    "run_eval_suite",
    "score_case",
]
