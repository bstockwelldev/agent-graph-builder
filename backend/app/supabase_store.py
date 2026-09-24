"""Supabase Storage JSON persistence for graphs and run snapshots
(studio-consolidation Phase 5 — see
docs/planning/features/studio-consolidation-plan.md). A peer of
`vercel_blob.py`/`object_store.py`, not a new abstraction: same
`put_json`/`get_json`/`delete_json`/`list_keys` contract, so it slots into
`storage.py`'s existing `_json_object_backend()` dispatch with one added
branch, and the same `save_graph`/`get_graph`/`list_graphs`/
`save_run_snapshot`/`get_run`/`get_run_traces` surface `storage.py`
already calls generically (run listing is generic in `storage.py`).

Uses Supabase's native Storage REST API (one JSON object per key in a
bucket), not S3 compatibility mode or a Postgres table — the smallest
faithful "durable JSON store keyed by path" port, matching the shape AGB
already has proven twice over (Vercel Blob, S3-compatible object store).
Authenticated with the service-role key, which — same as MUI's own
`lib/supabase/server.ts` comment — stays server-only; the anon key is for
`apps/studio`'s browser-side auth client, not this module.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

from .models import GraphDefinition, NodeTrace, RunSummary

_GRAPH_PREFIX = "graphs/"
_RUN_PREFIX = "runs/"
_TIMEOUT = 30.0


def _base_url() -> str:
    return os.environ["SUPABASE_URL"].strip().rstrip("/")


def _service_role_key() -> str:
    return os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()


def _bucket() -> str:
    return os.environ.get("SUPABASE_STORAGE_BUCKET", "").strip() or "agent-graph-builder"


def _headers() -> dict[str, str]:
    # SUPABASE_SERVICE_ROLE_KEY holds either a legacy service_role JWT or a
    # new-style secret key (``sb_secret_...``). Secret keys are not JWTs:
    # Supabase wants them on ``apikey`` only, and may reject them as
    # ``Invalid JWT`` on ``Authorization: Bearer``.
    key = _service_role_key()
    if key.startswith("sb_"):
        return {"apikey": key}
    return {"Authorization": f"Bearer {key}", "apikey": key}


def _object_url(key: str) -> str:
    return f"{_base_url()}/storage/v1/object/{_bucket()}/{key}"


def _graph_key(graph_id: str) -> str:
    return f"{_GRAPH_PREFIX}{graph_id}.json"


def _run_key(run_id: str) -> str:
    return f"{_RUN_PREFIX}{run_id}.json"


def _http_client() -> httpx.Client:
    return httpx.Client(timeout=_TIMEOUT)


def put_json(key: str, payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    headers = {**_headers(), "Content-Type": "application/json", "x-upsert": "true"}
    with _http_client() as client:
        response = client.post(_object_url(key), headers=headers, content=body)
    response.raise_for_status()


def get_json(key: str) -> dict[str, Any] | None:
    with _http_client() as client:
        response = client.get(_object_url(key), headers=_headers())
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return json.loads(response.content)


def delete_json(key: str) -> bool:
    if get_json(key) is None:
        return False
    with _http_client() as client:
        response = client.delete(_object_url(key), headers=_headers())
    if response.status_code == 404:
        return False
    response.raise_for_status()
    return True


def list_keys(prefix: str, *, newest_first: bool = False, limit: int | None = None) -> list[str]:
    """Lists ``.json`` keys under `prefix`. `newest_first` sorts server-side
    by ``created_at`` desc, so paging stops as soon as `limit` keys are
    found — callers then read only those objects.
    """
    url = f"{_base_url()}/storage/v1/object/list/{_bucket()}"
    sort_by = (
        {"column": "created_at", "order": "desc"}
        if newest_first
        else {"column": "name", "order": "asc"}
    )
    keys: list[str] = []
    offset = 0
    page_size = 1000
    with _http_client() as client:
        while limit is None or len(keys) < limit:
            response = client.post(
                url,
                headers={**_headers(), "Content-Type": "application/json"},
                json={
                    "prefix": prefix,
                    "limit": page_size,
                    "offset": offset,
                    "sortBy": sort_by,
                },
            )
            response.raise_for_status()
            items = response.json()
            if not items:
                break
            for item in items:
                name = item.get("name")
                if isinstance(name, str) and name.endswith(".json"):
                    keys.append(f"{prefix}{name}")
            if len(items) < page_size:
                break
            offset += page_size
    return keys if limit is None else keys[:limit]


def save_graph(graph: GraphDefinition) -> None:
    put_json(_graph_key(graph.id), graph.model_dump(mode="json"))


def get_graph(graph_id: str) -> GraphDefinition | None:
    payload = get_json(_graph_key(graph_id))
    if payload is None:
        return None
    return GraphDefinition.model_validate(payload)


def list_graphs() -> list[GraphDefinition]:
    graphs: list[GraphDefinition] = []
    for key in list_keys(_GRAPH_PREFIX):
        payload = get_json(key)
        if payload is None:
            continue
        graphs.append(GraphDefinition.model_validate(payload))
    graphs.sort(key=lambda graph: graph.updated_at or "", reverse=True)
    return graphs


def _run_blob(summary: RunSummary, traces: list[NodeTrace]) -> dict[str, Any]:
    # by_alias=True keeps route_decisions camelCase here too, matching the
    # SQLite/Turso/Blob paths (studio-consolidation Phase 1 hygiene fix).
    return {
        "summary": summary.model_dump(mode="json", by_alias=True),
        "traces": [trace.model_dump(mode="json") for trace in traces],
    }


def _summary_from_blob(payload: dict[str, Any]) -> RunSummary:
    return RunSummary.model_validate(payload["summary"])


def _traces_from_blob(payload: dict[str, Any]) -> list[NodeTrace]:
    traces = [NodeTrace.model_validate(item) for item in payload.get("traces") or []]
    traces.sort(key=lambda trace: trace.node_id)
    return traces


def save_run_snapshot(summary: RunSummary, traces: list[NodeTrace]) -> None:
    put_json(_run_key(summary.run_id), _run_blob(summary, traces))


def get_run(run_id: str) -> RunSummary | None:
    payload = get_json(_run_key(run_id))
    if payload is None:
        return None
    return _summary_from_blob(payload)


def get_run_traces(run_id: str) -> list[NodeTrace]:
    payload = get_json(_run_key(run_id))
    if payload is None:
        return []
    return _traces_from_blob(payload)
