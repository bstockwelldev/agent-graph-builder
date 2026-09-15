"""S3-compatible JSON object persistence for graphs and run snapshots.

Works with AWS S3, Cloudflare R2, MinIO, and Azure Blob S3 API. Keys:

- ``graphs/{id}.json`` — graph definition
- ``runs/{id}.json`` — run summary plus node traces
"""

from __future__ import annotations

import json
import os
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from .models import GraphDefinition, NodeTrace, RunSummary

_GRAPH_PREFIX = "graphs/"
_RUN_PREFIX = "runs/"


def _bucket() -> str:
    return os.environ["OBJECT_STORE_BUCKET"].strip()


def _endpoint() -> str | None:
    value = os.environ.get("OBJECT_STORE_ENDPOINT", "").strip()
    return value or None


def _region(endpoint: str | None) -> str:
    explicit = os.environ.get("OBJECT_STORE_REGION", "").strip()
    if explicit:
        return explicit
    return "auto" if endpoint else "us-east-1"


def s3_client():
    """Build a sync boto3 S3 client from OBJECT_STORE_* env vars."""
    endpoint = _endpoint()
    kwargs: dict[str, Any] = {
        "aws_access_key_id": os.environ["OBJECT_STORE_ACCESS_KEY_ID"].strip(),
        "aws_secret_access_key": os.environ["OBJECT_STORE_SECRET_ACCESS_KEY"].strip(),
        "region_name": _region(endpoint),
    }
    if endpoint:
        kwargs["endpoint_url"] = endpoint
        kwargs["config"] = Config(s3={"addressing_style": "path"})
    return boto3.client("s3", **kwargs)


def _is_missing(exc: ClientError) -> bool:
    error = exc.response.get("Error") or {}
    code = str(error.get("Code", ""))
    if code in {"NoSuchKey", "404", "NotFound"}:
        return True
    status = (exc.response.get("ResponseMetadata") or {}).get("HTTPStatusCode")
    return status == 404


def _graph_key(graph_id: str) -> str:
    return f"{_GRAPH_PREFIX}{graph_id}.json"


def _run_key(run_id: str) -> str:
    return f"{_RUN_PREFIX}{run_id}.json"


def put_json(key: str, payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    s3_client().put_object(
        Bucket=_bucket(),
        Key=key,
        Body=body,
        ContentType="application/json",
    )


def get_json(key: str) -> dict[str, Any] | None:
    try:
        response = s3_client().get_object(Bucket=_bucket(), Key=key)
    except ClientError as exc:
        if _is_missing(exc):
            return None
        raise
    raw = response["Body"].read()
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    return json.loads(raw)


def list_keys(prefix: str) -> list[str]:
    client = s3_client()
    bucket = _bucket()
    keys: list[str] = []
    token: str | None = None
    while True:
        kwargs: dict[str, Any] = {"Bucket": bucket, "Prefix": prefix}
        if token:
            kwargs["ContinuationToken"] = token
        response = client.list_objects_v2(**kwargs)
        for item in response.get("Contents") or []:
            key = item.get("Key")
            if isinstance(key, str) and key.endswith(".json"):
                keys.append(key)
        if not response.get("IsTruncated"):
            break
        token = response.get("NextContinuationToken")
        if not token:
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
    # by_alias=True keeps route_decisions camelCase here too, matching the
    # SQLite/Turso path in storage.py (studio-consolidation Phase 1 hygiene
    # fix) — RunSummary.model_validate() below tolerates either casing on
    # read regardless, since RouteDecision sets populate_by_name=True.
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
