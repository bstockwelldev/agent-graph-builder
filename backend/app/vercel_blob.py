"""Vercel Blob JSON persistence for graphs and run snapshots.

Uses the Blob REST API (not S3). Activated when ``BLOB_READ_WRITE_TOKEN`` is
set. Keys:

- ``graphs/{id}.json`` — graph definition
- ``runs/{id}.json`` — run summary plus node traces
"""

from __future__ import annotations

import json
import os
from typing import Any
from urllib.parse import quote

import httpx

from .models import GraphDefinition, NodeTrace, RunSummary

_API_BASE = "https://vercel.com/api/blob"
_API_VERSION = "12"
_GRAPH_PREFIX = "graphs/"
_RUN_PREFIX = "runs/"
_TIMEOUT = 30.0


def _token() -> str:
    return os.environ["BLOB_READ_WRITE_TOKEN"].strip()


def _store_id() -> str:
    explicit = os.environ.get("BLOB_STORE_ID", "").strip()
    if explicit:
        return explicit.removeprefix("store_")
    parts = _token().split("_")
    if len(parts) >= 4 and parts[0] == "vercel" and parts[1] == "blob":
        return parts[3]
    raise RuntimeError("Unable to resolve Blob store id from BLOB_READ_WRITE_TOKEN")


def _http_client() -> httpx.Client:
    return httpx.Client(timeout=_TIMEOUT, follow_redirects=True)


def _auth_headers(*, include_store: bool = True) -> dict[str, str]:
    headers = {
        "authorization": f"Bearer {_token()}",
        "x-api-version": _API_VERSION,
    }
    if include_store:
        headers["x-vercel-blob-store-id"] = _store_id()
    return headers


def _graph_key(graph_id: str) -> str:
    return f"{_GRAPH_PREFIX}{graph_id}.json"


def _run_key(run_id: str) -> str:
    return f"{_RUN_PREFIX}{run_id}.json"


def _blob_url(pathname: str) -> str:
    encoded = quote(pathname, safe="/")
    return f"https://{_store_id()}.private.blob.vercel-storage.com/{encoded}"


def put_json(key: str, payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    headers = {
        **_auth_headers(),
        "x-vercel-blob-access": "private",
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "1",
        "x-content-type": "application/json",
    }
    with _http_client() as client:
        response = client.put(
            f"{_API_BASE}/",
            params={"pathname": key},
            headers=headers,
            content=body,
        )
    response.raise_for_status()


def get_json(key: str) -> dict[str, Any] | None:
    headers = _auth_headers(include_store=False)
    with _http_client() as client:
        response = client.get(
            _blob_url(key),
            params={"cache": "0"},
            headers=headers,
        )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return json.loads(response.content)


def list_keys(prefix: str) -> list[str]:
    keys: list[str] = []
    cursor: str | None = None
    with _http_client() as client:
        while True:
            params: dict[str, str] = {"prefix": prefix, "limit": "1000"}
            if cursor:
                params["cursor"] = cursor
            response = client.get(
                f"{_API_BASE}/",
                params=params,
                headers=_auth_headers(),
            )
            response.raise_for_status()
            payload = response.json()
            for item in payload.get("blobs") or []:
                pathname = item.get("pathname")
                if isinstance(pathname, str) and pathname.endswith(".json"):
                    keys.append(pathname)
            if not payload.get("hasMore"):
                break
            cursor = payload.get("cursor")
            if not cursor:
                break
    return keys


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
    return {
        "summary": summary.model_dump(mode="json"),
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


def list_runs_for_graph(graph_id: str, *, limit: int = 50) -> list[RunSummary]:
    runs: list[RunSummary] = []
    for key in list_keys(_RUN_PREFIX):
        payload = get_json(key)
        if payload is None:
            continue
        summary = _summary_from_blob(payload)
        if summary.graph_id == graph_id:
            runs.append(summary)
    runs.sort(key=lambda item: item.started_at or "", reverse=True)
    return runs[:limit]


def get_run_traces(run_id: str) -> list[NodeTrace]:
    payload = get_json(_run_key(run_id))
    if payload is None:
        return []
    return _traces_from_blob(payload)
