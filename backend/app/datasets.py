"""Fixture datasets captured from historical runs.

Follow-on to the Routing Lab (docs/planning/features/p1-rollout-plan.md,
Slice D) and `graph-native-control-plane-plan.md`'s "historical runs should
become engineering datasets": turns selected past runs into a saved
`FixtureDataset` so a router change can be tested against what users really
sent instead of hand-written JSON.

Each run becomes one `Fixture`: its recorded `input`, plus (optionally) the
run's succeeded non-routing node outputs frozen via `replay.frozen_node_outputs`
— the same freezing `replay_run` uses, so routers see the real upstream
classifications rather than the stub provider's.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from . import runtime, storage
from .models import Fixture
from .replay import ReplayNotFound, _resolve_replay_graph, frozen_node_outputs
from .resource_models import FixtureDataset

MAX_RUNS_PER_DATASET = 100
_DATASETS_KIND = "datasets"


class DatasetBuildError(Exception):
    """A request the caller can fix; `status_code` is the HTTP mapping."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def build_dataset_from_runs(
    *,
    name: str,
    description: str | None,
    run_ids: list[str],
    include_node_outputs: bool,
) -> FixtureDataset:
    """Captures `run_ids` (deduplicated, order preserved) into a new stored
    dataset and returns it. All runs must belong to one graph. With
    `include_node_outputs`, every run must have `succeeded` (only then is its
    set of node outputs complete) and still have its graph snapshot; without
    it, only each run's input is captured and any status is accepted.
    """
    unique_ids = list(dict.fromkeys(run_ids))
    if not unique_ids:
        raise DatasetBuildError(422, "Select at least one run.")
    if len(unique_ids) > MAX_RUNS_PER_DATASET:
        raise DatasetBuildError(
            422, f"A dataset holds at most {MAX_RUNS_PER_DATASET} runs (got {len(unique_ids)})."
        )

    summaries = []
    for run_id in unique_ids:
        summary = runtime.get_run_summary(run_id)
        if summary is None:
            raise DatasetBuildError(404, f"Run {run_id!r} not found.")
        summaries.append(summary)

    graph_ids = {summary.graph_id for summary in summaries}
    if len(graph_ids) > 1:
        raise DatasetBuildError(
            422, "Runs span multiple graphs; a dataset's frozen node outputs belong to one graph."
        )

    fixtures: list[Fixture] = []
    for summary in summaries:
        node_outputs: dict[str, object] = {}
        if include_node_outputs:
            if summary.status != "succeeded":
                raise DatasetBuildError(
                    422,
                    f"Run {summary.run_id!r} is {summary.status!r}; only a succeeded run has "
                    "complete node outputs to freeze. Deselect it, or capture inputs only.",
                )
            try:
                graph, _snapshots, _release_id = _resolve_replay_graph(summary.run_id)
            except ReplayNotFound as exc:
                raise DatasetBuildError(422, str(exc)) from exc
            node_outputs = frozen_node_outputs(graph, runtime.get_run_node_traces(summary.run_id))
        fixtures.append(Fixture(input=summary.input, node_outputs=node_outputs))

    now = datetime.now(UTC)
    dataset = FixtureDataset(
        id=f"ds_{uuid4().hex[:12]}",
        name=name,
        description=description,
        graph_id=next(iter(graph_ids)),
        fixtures=fixtures,
        source="runs",
        source_run_ids=unique_ids,
        created_at=now,
        updated_at=now,
    )
    storage.save_resource(_DATASETS_KIND, dataset.id, dataset.model_dump(mode="json"))
    return dataset
