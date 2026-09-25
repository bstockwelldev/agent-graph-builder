"""Graph and run persistence.

SQLite stands in for Supabase PostgreSQL in the POC (EDD section 29): the
platform still owns the canonical graph as its system of record, just via a
lighter-weight local store. Completed run snapshots (summary + node traces)
persist here; live SSE buses stay in memory until a run finishes.

Backends (first match wins):
- **Supabase Storage (production):** when ``SUPABASE_URL`` and
  ``SUPABASE_SERVICE_ROLE_KEY`` are set (studio-consolidation Phase 5, see
  docs/planning/features/studio-consolidation-plan.md and
  ``supabase_store.py``). JSON objects in a bucket.
- **S3-compatible object store:** when ``OBJECT_STORE_BUCKET``,
  ``OBJECT_STORE_ACCESS_KEY_ID``, and ``OBJECT_STORE_SECRET_ACCESS_KEY`` are
  set. Works with AWS S3, Cloudflare R2, MinIO, and Azure Blob S3 API.
- **Turso (optional):** when ``TURSO_DATABASE_URL`` and ``TURSO_AUTH_TOKEN``
  are both set and none of the above are.
- **File SQLite:** local / Docker / Vercel ``GRAPH_DB_PATH`` (or Vercel
  ``/tmp`` fallback). Isolate-local on serverless — not durable across GET
  after POST.
"""

from __future__ import annotations

import json
import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Protocol

from . import object_store, supabase_store
from .bindings import edge_bindings, node_bindings
from .graph_inputs import input_variables
from .models import (
    CatalogBinding,
    CatalogSubgraphRef,
    GraphCatalogEntry,
    GraphDefinition,
    GraphSummary,
    NodeTrace,
    NodeType,
    RouteDecision,
    RunSummary,
)

_DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "graphs.db"
_VERCEL_EPHEMERAL_DB = Path("/tmp/graphs.db")

_SCHEMA_STATEMENTS = (
    """
    create table if not exists graph (
        id text primary key,
        name text not null,
        definition text not null,
        updated_at text not null
    )
    """,
    """
    create table if not exists run (
        run_id text primary key,
        graph_id text not null,
        status text not null,
        input_json text not null,
        provider text,
        result_json text,
        error text,
        started_at text not null,
        completed_at text not null
    )
    """,
    """
    create index if not exists idx_run_graph_started
    on run (graph_id, started_at desc)
    """,
    """
    create table if not exists run_node_trace (
        run_id text not null,
        node_id text not null,
        trace_json text not null,
        primary key (run_id, node_id)
    )
    """,
    """
    create table if not exists resource (
        kind text not null,
        id text not null,
        payload_json text not null,
        primary key (kind, id)
    )
    """,
    # P0 graph foundation, Slice A (docs/planning/features/p0-graph-foundation-design-plan.md):
    # storage primitives for immutable graph releases. A dedicated
    # release-index + release-payload pair, not an unbounded array on
    # `graph`, so listing releases for a graph doesn't require loading every
    # release body. No route or publish workflow writes to these yet.
    """
    create table if not exists graph_release_index (
        graph_id text not null,
        release_id text not null,
        semantic_fingerprint text not null,
        document_fingerprint text not null,
        created_at text not null,
        primary key (graph_id, release_id)
    )
    """,
    """
    create index if not exists idx_release_index_semantic
    on graph_release_index (graph_id, semantic_fingerprint)
    """,
    """
    create table if not exists graph_release_payload (
        release_id text primary key,
        graph_id text not null,
        payload_json text not null,
        created_at text not null
    )
    """,
    # P0 graph foundation, Slice D (docs/planning/features/p0-graph-foundation-design-plan.md,
    # "Persistence and API"): one durable RunGraphSnapshot per run_id,
    # never deleted — including when the owning graph is deleted (delete_graph
    # only ever touches the `graph` table/key, never this one).
    """
    create table if not exists run_graph_snapshot (
        run_id text primary key,
        graph_id text not null,
        payload_json text not null,
        created_at text not null
    )
    """,
    # P1 rollout plan (docs/planning/features/p1-rollout-plan.md), parallel
    # track "Versioned reusable entity registry": storage primitives for an
    # immutable version/history table beside the mutable `resource` table
    # above, same version-index + version-payload pair shape as
    # graph_release_index/graph_release_payload.
    """
    create table if not exists resource_version_index (
        kind text not null,
        resource_id text not null,
        version_id text not null,
        fingerprint text not null,
        created_at text not null,
        primary key (kind, resource_id, version_id)
    )
    """,
    """
    create index if not exists idx_resource_version_index_fingerprint
    on resource_version_index (kind, resource_id, fingerprint)
    """,
    """
    create table if not exists resource_version_payload (
        version_id text primary key,
        kind text not null,
        resource_id text not null,
        payload_json text not null,
        created_at text not null
    )
    """,
    # P2, "Cross-cutting policy overlays": time-boxed waivers for a policy
    # diagnostic code, scoped to a graph (and optionally one node). See
    # policies.py.
    """
    create table if not exists policy_exception (
        id text primary key,
        graph_id text not null,
        policy_code text not null,
        node_id text,
        reason text,
        created_at text not null,
        expires_at text not null
    )
    """,
    """
    create index if not exists idx_policy_exception_graph
    on policy_exception (graph_id, policy_code)
    """,
    # Configurable policies (STO-608): one JSON settings document per scope
    # -- "workspace", or "graph:<graph_id>" for a graph's overrides.
    """
    create table if not exists policy_settings (
        scope text primary key,
        payload text not null,
        updated_at text not null
    )
    """,
    # P2, "Retrieval/document lineage graph": one row per knowledge chunk
    # actually retrieved and used during a run. See knowledge.py.
    """
    create table if not exists knowledge_lineage_entry (
        id text primary key,
        graph_id text not null,
        document_id text not null,
        document_name text not null,
        chunk_id text not null,
        run_id text not null,
        node_id text not null,
        score real not null,
        created_at text not null
    )
    """,
    """
    create index if not exists idx_knowledge_lineage_graph_document
    on knowledge_lineage_entry (graph_id, document_id)
    """,
)


class _DbCursor(Protocol):
    def fetchone(self) -> tuple[Any, ...] | None: ...

    def fetchall(self) -> list[tuple[Any, ...]]: ...


class _DbConnection(Protocol):
    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> _DbCursor: ...

    def executemany(self, sql: str, params: list[tuple[Any, ...]]) -> None: ...

    def commit(self) -> None: ...

    def close(self) -> None: ...


def resolve_db_path() -> Path:
    """Writable SQLite path for the current runtime.

    Vercel serverless mounts the deployment bundle read-only; only ``/tmp`` is
    writable. ``vercel.json`` sets ``GRAPH_DB_PATH=/tmp/graphs.db``, but if that
    env var is missing (dashboard drift, new project) we still default to ``/tmp``
    when ``VERCEL`` is set instead of ``backend/graphs.db`` in the bundle.
    """
    explicit = os.environ.get("GRAPH_DB_PATH", "").strip()
    if explicit:
        return Path(explicit)
    if os.environ.get("VERCEL"):
        return _VERCEL_EPHEMERAL_DB
    return _DEFAULT_DB_PATH


def use_supabase() -> bool:
    """True when Supabase project URL + service-role key are set
    (studio-consolidation Phase 5 — see
    docs/planning/features/studio-consolidation-plan.md). Checked before
    the generic S3-compatible object store.
    """
    url = os.environ.get("SUPABASE_URL", "").strip()
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    return bool(url and service_role_key)


def use_object_store() -> bool:
    """True when object-store bucket and credentials are set."""
    bucket = os.environ.get("OBJECT_STORE_BUCKET", "").strip()
    access_key = os.environ.get("OBJECT_STORE_ACCESS_KEY_ID", "").strip()
    secret_key = os.environ.get("OBJECT_STORE_SECRET_ACCESS_KEY", "").strip()
    return bool(bucket and access_key and secret_key)


def use_turso() -> bool:
    """True when both Turso env vars are set for remote libsql."""
    url = os.environ.get("TURSO_DATABASE_URL", "").strip()
    token = os.environ.get("TURSO_AUTH_TOKEN", "").strip()
    return bool(url and token)


def storage_backend() -> str:
    """Active persistence backend label (for diagnostics)."""
    if use_supabase():
        return "supabase"
    if use_object_store():
        return "object_store"
    if use_turso():
        return "turso"
    return "sqlite"


class StorageMisconfiguredError(RuntimeError):
    """Raised when Vercel runs without a durable persistence backend."""


STORAGE_MISCONFIGURED_DETAIL = (
    "Vercel requires durable storage. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, "
    "OBJECT_STORE_BUCKET + OBJECT_STORE_ACCESS_KEY_ID + "
    "OBJECT_STORE_SECRET_ACCESS_KEY, or TURSO_DATABASE_URL + TURSO_AUTH_TOKEN."
)


def is_vercel_runtime() -> bool:
    """True when running on Vercel serverless (``VERCEL`` env is set)."""
    return bool(os.environ.get("VERCEL"))


def is_durable_storage_configured() -> bool:
    """True when a shared store is configured (not isolate-local SQLite)."""
    return use_supabase() or use_object_store() or use_turso()


def storage_is_healthy() -> bool:
    """False on Vercel when only ephemeral SQLite would be used."""
    if is_vercel_runtime() and not is_durable_storage_configured():
        return False
    return True


def storage_health() -> dict[str, bool | str]:
    """Cheap diagnostics payload for health/ready probes."""
    backend = storage_backend()
    ok = storage_is_healthy()
    payload: dict[str, bool | str] = {"ok": ok, "storage_backend": backend}
    if not ok:
        payload["message"] = STORAGE_MISCONFIGURED_DETAIL
    if backend == "supabase":
        payload["supabase_key"] = supabase_store.key_kind()
    return payload


def _assert_storage_ready_for_sqlite() -> None:
    if not storage_is_healthy():
        raise StorageMisconfiguredError(STORAGE_MISCONFIGURED_DETAIL)


def _json_object_backend():
    if use_supabase():
        return supabase_store
    if use_object_store():
        return object_store
    return None


DB_PATH = resolve_db_path()


def _bootstrap_schema(conn: _DbConnection) -> None:
    for statement in _SCHEMA_STATEMENTS:
        conn.execute(statement)
    _ensure_run_schema(conn)


def _ensure_run_schema(conn: _DbConnection) -> None:
    columns = {row[1] for row in conn.execute("pragma table_info(run)").fetchall()}
    if "route_decisions_json" not in columns:
        conn.execute("alter table run add column route_decisions_json text not null default '[]'")
    # P0 graph foundation, Slice D (GraphRunIdentity fields on RunSummary):
    # added post-hoc, same migration pattern as route_decisions_json above
    # — nullable so existing rows don't need backfilling. The
    # object_store.py/supabase_store.py backends need no
    # equivalent migration: they round-trip the whole RunSummary via
    # model_dump()/model_validate(), so new optional fields are already
    # handled there for free — only this hand-unpacked SQL path needed it.
    identity_columns = (
        "graph_release_id",
        "graph_fingerprint",
        "source",
        "runtime_target",
        "compiler_version",
    )
    for column in identity_columns:
        if column not in columns:
            conn.execute(f"alter table run add column {column} text")


def _open_sqlite(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(path)


def _open_turso() -> Any:
    import libsql

    url = os.environ["TURSO_DATABASE_URL"].strip()
    token = os.environ["TURSO_AUTH_TOKEN"].strip()
    return libsql.connect(database=url, auth_token=token)


@contextmanager
def _connect() -> Iterator[_DbConnection]:
    if use_turso():
        conn = _open_turso()
        try:
            _bootstrap_schema(conn)
            yield conn
            conn.commit()
        finally:
            conn.close()
    else:
        _assert_storage_ready_for_sqlite()
        conn = _open_sqlite(resolve_db_path())
        try:
            _bootstrap_schema(conn)
            yield conn
            conn.commit()
        finally:
            conn.close()


def save_graph(graph: GraphDefinition) -> None:
    remote = _json_object_backend()
    if remote is not None:
        remote.save_graph(graph)
        _update_graph_catalog(remote, graph.id, graph_catalog_entry(graph))
        return
    with _connect() as conn:
        conn.execute(
            "insert into graph (id, name, definition, updated_at) values (?, ?, ?, ?) "
            "on conflict(id) do update set name = excluded.name, "
            "definition = excluded.definition, updated_at = excluded.updated_at",
            (graph.id, graph.name, graph.model_dump_json(), graph.updated_at or ""),
        )


def get_graph(graph_id: str) -> GraphDefinition | None:
    remote = _json_object_backend()
    if remote is not None:
        return remote.get_graph(graph_id)
    with _connect() as conn:
        row = conn.execute("select definition from graph where id = ?", (graph_id,)).fetchone()
    if row is None:
        return None
    return GraphDefinition.model_validate(json.loads(row[0]))


def list_graphs() -> list[GraphDefinition]:
    remote = _json_object_backend()
    if remote is not None:
        return remote.list_graphs()
    with _connect() as conn:
        rows = conn.execute("select definition from graph order by updated_at desc").fetchall()
    return [GraphDefinition.model_validate(json.loads(r[0])) for r in rows]


def list_graph_ids() -> list[str]:
    """Every graph id, ascending, without loading any graph — so a paged
    graph listing reads only the page it returns."""
    remote = _json_object_backend()
    if remote is not None:
        return sorted(
            key.removeprefix(_GRAPH_PREFIX).removesuffix(".json")
            for key in remote.list_keys(_GRAPH_PREFIX)
        )
    with _connect() as conn:
        rows = conn.execute("select id from graph order by id").fetchall()
    return [row[0] for row in rows]


# Graph catalog (remote object backends). One ``graph_catalog.json``
# document holding a GraphCatalogEntry per graph, so cross-graph readers
# (analytics names, resource "used by", subgraph parents) cost one read
# instead of one per graph — list_graphs() read every graph blob, the same
# shape that exhausted the Vercel Blob Hobby quota on 2026-09-24.
# Maintained on save/delete with read-modify-write, like the release index;
# concurrent saves can drop an entry, which rebuild_graph_catalog() repairs.
# A missing catalog -- or one written by an older _GRAPH_CATALOG_VERSION,
# whose entries lack newer fields -- is rebuilt from a full scan once, so
# no backfill step. Bump the version whenever GraphCatalogEntry gains a
# field derived from the graph.
_GRAPH_PREFIX = "graphs/"
_GRAPH_CATALOG_KEY = "graph_catalog.json"
_GRAPH_CATALOG_VERSION = 3


def graph_catalog_entry(graph: GraphDefinition) -> GraphCatalogEntry:
    return GraphCatalogEntry(
        id=graph.id,
        name=graph.name,
        updated_at=graph.updated_at,
        node_count=len(graph.nodes),
        edge_count=len(graph.edges),
        input_variables=input_variables(graph),
        bindings=[
            CatalogBinding(
                node_id=node.id,
                node_type=node.type.value,
                field=binding.field,
                kind=binding.kind,
                resource_id=binding.resource_id,
            )
            for node in graph.nodes
            for binding in node_bindings(node)
        ]
        + [
            CatalogBinding(
                node_id=edge.id,
                node_type="edge",
                field=binding.field,
                kind=binding.kind,
                resource_id=binding.resource_id,
            )
            for edge, binding in edge_bindings(graph)
        ],
        subgraphs=[
            CatalogSubgraphRef(node_id=node.id, graph_id=str(node.config.get("graphId") or ""))
            for node in graph.nodes
            if node.type == NodeType.SUBGRAPH
        ],
    )


def _write_graph_catalog(remote, entries: dict[str, GraphCatalogEntry]) -> None:
    remote.put_json(
        _GRAPH_CATALOG_KEY,
        {
            "version": _GRAPH_CATALOG_VERSION,
            "graphs": {
                graph_id: entry.model_dump(mode="json") for graph_id, entry in entries.items()
            },
        },
    )


def rebuild_graph_catalog(backend=None) -> int:
    """Rebuilds the catalog from every graph blob (one read per graph) —
    for repair, never per request. Returns the entry count; no-op on
    SQLite/Turso, which have no catalog. `backend` overrides the configured one."""
    remote = backend or _json_object_backend()
    if remote is None:
        return 0
    entries = _scan_graph_catalog(remote)
    _write_graph_catalog(remote, entries)
    return len(entries)


def _scan_graph_catalog(remote) -> dict[str, GraphCatalogEntry]:
    return {graph.id: graph_catalog_entry(graph) for graph in remote.list_graphs()}


def _read_graph_catalog(remote) -> dict[str, GraphCatalogEntry] | None:
    payload = remote.get_json(_GRAPH_CATALOG_KEY)
    if payload is None or payload.get("version") != _GRAPH_CATALOG_VERSION:
        return None
    return {
        graph_id: GraphCatalogEntry.model_validate(entry)
        for graph_id, entry in (payload.get("graphs") or {}).items()
    }


def _update_graph_catalog(remote, graph_id: str, entry: GraphCatalogEntry | None) -> None:
    # Runs after the graph blob write/delete, so a scan of a missing
    # catalog already reflects this change.
    entries = _read_graph_catalog(remote)
    if entries is None:
        entries = _scan_graph_catalog(remote)
    if entry is None:
        entries.pop(graph_id, None)
    else:
        entries[graph_id] = entry
    _write_graph_catalog(remote, entries)


def list_graph_catalog() -> list[GraphCatalogEntry]:
    """Every graph's catalog entry, newest-updated first. One object read on
    the remote backends; built from the graph table on SQLite/Turso."""
    remote = _json_object_backend()
    if remote is not None:
        catalog = _read_graph_catalog(remote)
        if catalog is None:
            catalog = _scan_graph_catalog(remote)
            _write_graph_catalog(remote, catalog)
        entries = list(catalog.values())
    else:
        entries = [graph_catalog_entry(graph) for graph in list_graphs()]
    entries.sort(key=lambda entry: entry.updated_at or "", reverse=True)
    return entries


def list_graph_summaries() -> list[GraphSummary]:
    """Every graph without its nodes/edges, newest-updated first — one
    catalog read on the remote backends (GET /api/graph-summaries)."""
    return [entry.summary() for entry in list_graph_catalog()]


def _row_to_run_summary(row: tuple) -> RunSummary:
    graph_release_id = graph_fingerprint = source = runtime_target = compiler_version = None
    if len(row) == 9:
        (
            run_id,
            graph_id,
            status,
            input_json,
            provider,
            result_json,
            error,
            started_at,
            completed_at,
        ) = row
        route_decisions_json = "[]"
    elif len(row) == 10:
        (
            run_id,
            graph_id,
            status,
            input_json,
            provider,
            result_json,
            error,
            started_at,
            completed_at,
            route_decisions_json,
        ) = row
    else:
        (
            run_id,
            graph_id,
            status,
            input_json,
            provider,
            result_json,
            error,
            started_at,
            completed_at,
            route_decisions_json,
            graph_release_id,
            graph_fingerprint,
            source,
            runtime_target,
            compiler_version,
        ) = row
    result = json.loads(result_json) if result_json else None
    route_decisions_raw = json.loads(route_decisions_json or "[]")
    route_decisions = [RouteDecision.model_validate(item) for item in route_decisions_raw]
    return RunSummary(
        run_id=run_id,
        graph_id=graph_id,
        status=status,  # type: ignore[arg-type]
        input=json.loads(input_json),
        provider=provider,
        result=result,
        error=error,
        started_at=started_at,
        completed_at=completed_at,
        route_decisions=route_decisions,
        graph_release_id=graph_release_id,
        graph_fingerprint=graph_fingerprint,
        source=source,  # type: ignore[arg-type]
        runtime_target=runtime_target,  # type: ignore[arg-type]
        compiler_version=compiler_version,
    )


def save_run_snapshot(summary: RunSummary, traces: list[NodeTrace]) -> None:
    remote = _json_object_backend()
    if remote is not None:
        remote.save_run_snapshot(summary, traces)
        # After the full snapshot, so an index entry never points at a run
        # whose blob failed to write.
        remote.put_json(
            _run_index_key(summary.graph_id, summary.run_id),
            {"summary": summary.model_dump(mode="json", by_alias=True)},
        )
        return
    result_json = json.dumps(summary.result) if summary.result is not None else None
    route_decisions_json = json.dumps(
        [decision.model_dump(by_alias=True) for decision in summary.route_decisions]
    )
    with _connect() as conn:
        conn.execute(
            """
            insert into run (
                run_id, graph_id, status, input_json, provider,
                result_json, error, started_at, completed_at, route_decisions_json,
                graph_release_id, graph_fingerprint, source, runtime_target, compiler_version
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(run_id) do update set
                status = excluded.status,
                result_json = excluded.result_json,
                error = excluded.error,
                completed_at = excluded.completed_at,
                route_decisions_json = excluded.route_decisions_json
            """,
            (
                summary.run_id,
                summary.graph_id,
                summary.status,
                json.dumps(summary.input),
                summary.provider,
                result_json,
                summary.error,
                summary.started_at or "",
                summary.completed_at or "",
                route_decisions_json,
                # P0 graph foundation, Slice D: identity fields, set once at
                # run creation and never updated (omitted from the
                # on-conflict clause above) — a run's identity doesn't
                # change over its lifetime, only its status/result do.
                summary.graph_release_id,
                summary.graph_fingerprint,
                summary.source,
                summary.runtime_target,
                summary.compiler_version,
            ),
        )
        conn.execute("delete from run_node_trace where run_id = ?", (summary.run_id,))
        conn.executemany(
            "insert into run_node_trace (run_id, node_id, trace_json) values (?, ?, ?)",
            [(summary.run_id, trace.node_id, trace.model_dump_json()) for trace in traces],
        )


def get_run(run_id: str) -> RunSummary | None:
    remote = _json_object_backend()
    if remote is not None:
        return remote.get_run(run_id)
    with _connect() as conn:
        row = conn.execute(
            """
            select run_id, graph_id, status, input_json, provider,
                   result_json, error, started_at, completed_at, route_decisions_json,
                   graph_release_id, graph_fingerprint, source, runtime_target, compiler_version
            from run where run_id = ?
            """,
            (run_id,),
        ).fetchone()
    if row is None:
        return None
    return _row_to_run_summary(row)


# Remote object run listing. Run blobs live flat at ``runs/{run_id}.json``
# (so get_run needs only the run id); ``run_index/{graph_id}/{run_id}.json``
# holds a summary-only copy so per-graph listing reads just that graph's
# runs. Both listings take the newest `limit` keys from list metadata and
# read only those — the old list-then-read-every-blob shape exhausted the
# Vercel Blob Hobby quota on 2026-09-24. Metadata order is upload time, so a
# run re-persisted after a pause can rank by its later write; results are
# re-sorted by started_at after the bounded read.
_RUN_PREFIX = "runs/"
_RUN_INDEX_PREFIX = "run_index/"


def _run_index_key(graph_id: str, run_id: str) -> str:
    return f"{_RUN_INDEX_PREFIX}{graph_id}/{run_id}.json"


def _read_run_summaries(remote, keys: list[str]) -> list[RunSummary]:
    runs: list[RunSummary] = []
    for key in keys:
        payload = remote.get_json(key)
        if payload is None:
            continue
        runs.append(RunSummary.model_validate(payload["summary"]))
    runs.sort(key=lambda item: item.started_at or "", reverse=True)
    return runs


def backfill_run_index(backend=None) -> int:
    """One-shot: writes ``run_index/`` entries for runs saved before the
    index existed (they are otherwise missing from list_runs_for_graph).
    Reads every run blob once — run it manually, never per request. Returns
    the number of entries written; no-op on SQLite/Turso. `backend` as in
    rebuild_graph_catalog.
    """
    remote = backend or _json_object_backend()
    if remote is None:
        return 0
    summaries: dict[str, list[dict[str, Any]]] = {}
    for key in remote.list_keys(_RUN_PREFIX):
        payload = remote.get_json(key)
        if payload is None:
            continue
        summary = payload["summary"]
        summaries.setdefault(summary["graph_id"], []).append(summary)
    written = 0
    # Listed per graph folder: Supabase Storage's list is not recursive.
    for graph_id, graph_summaries in summaries.items():
        indexed = set(remote.list_keys(f"{_RUN_INDEX_PREFIX}{graph_id}/"))
        for summary in graph_summaries:
            key = _run_index_key(graph_id, summary["run_id"])
            if key not in indexed:
                remote.put_json(key, {"summary": summary})
                written += 1
    return written


def list_all_runs(*, limit: int | None = 200) -> list[RunSummary]:
    """Cross-graph run history (studio-consolidation Phase 5 — see
    docs/planning/features/studio-consolidation-plan.md). On the remote
    backends this reads at most `limit` run blobs (newest by list
    metadata), not every run of every graph; `limit=None` (paged routes)
    reads every run.
    """
    remote = _json_object_backend()
    if remote is not None:
        keys = remote.list_keys(_RUN_PREFIX, newest_first=True, limit=limit)
        return _read_run_summaries(remote, keys)
    runs: list[RunSummary] = []
    for graph in list_graphs():
        runs.extend(list_runs_for_graph(graph.id, limit=limit))
    runs.sort(key=lambda item: item.started_at or "", reverse=True)
    return runs[:limit]


def list_runs_with_traces(
    *, graph_id: str | None = None, limit: int | None, backend=None
) -> list[tuple[RunSummary, list[NodeTrace]]]:
    """The newest `limit` runs (of one graph, or of every graph) with their
    node traces, newest first. On the remote backends each run's blob holds
    both, so this is one read per run -- analytics used to list runs and then
    re-read every blob through get_run_traces, doubling the reads.
    `limit=None` reads every run (analytics rebuilds only); `backend` as in
    rebuild_graph_catalog.
    """
    remote = backend or _json_object_backend()
    if remote is None:
        runs = (
            list_runs_for_graph(graph_id, limit=limit)
            if graph_id is not None
            else list_all_runs(limit=limit)
        )
        return [(run, get_run_traces(run.run_id)) for run in runs]
    if graph_id is not None:
        index_keys = remote.list_keys(
            f"{_RUN_INDEX_PREFIX}{graph_id}/", newest_first=True, limit=limit
        )
        keys = [f"{_RUN_PREFIX}{key.rsplit('/', 1)[-1]}" for key in index_keys]
    else:
        keys = remote.list_keys(_RUN_PREFIX, newest_first=True, limit=limit)
    pairs: list[tuple[RunSummary, list[NodeTrace]]] = []
    for key in keys:
        payload = remote.get_json(key)
        if payload is None:
            continue
        traces = [NodeTrace.model_validate(item) for item in payload.get("traces") or []]
        traces.sort(key=lambda trace: trace.node_id)
        pairs.append((RunSummary.model_validate(payload["summary"]), traces))
    pairs.sort(key=lambda pair: pair[0].started_at or "", reverse=True)
    return pairs


# Analytics daily usage (remote object backends): one
# ``analytics_daily/{YYYY-MM-DD}.json`` per day holding a usage entry per run
# (keyed by run id, so a paused run re-persisted on resume replaces its entry
# instead of double-counting). The dashboard reads one object per day in its
# window instead of every run -- analytics.py builds the entries. Updated with
# read-modify-write like the graph catalog, so concurrent completions on the
# same day can drop an entry; analytics.rebuild_daily_usage() repairs it.
# ``analytics_daily_built.json`` marks the files as complete; while it's
# missing (fresh deploy) analytics rebuilds them from the run blobs once.
_ANALYTICS_DAILY_PREFIX = "analytics_daily/"
_ANALYTICS_DAILY_MARKER_KEY = "analytics_daily_built.json"
_ANALYTICS_DAILY_VERSION = 1


def _analytics_daily_key(day: str) -> str:
    return f"{_ANALYTICS_DAILY_PREFIX}{day}.json"


def analytics_daily_supported() -> bool:
    """Whether daily usage files exist (remote backends); SQLite/Turso
    aggregate straight from their tables instead."""
    return _json_object_backend() is not None


def read_daily_usage(days: list[str]) -> dict[str, dict[str, dict[str, Any]]] | None:
    """Each day's run entries (`{day: {run_id: entry}}`), one read per day;
    None when the files were never built (or by an older version)."""
    remote = _json_object_backend()
    if remote is None:
        return None
    marker = remote.get_json(_ANALYTICS_DAILY_MARKER_KEY)
    if marker is None or marker.get("version") != _ANALYTICS_DAILY_VERSION:
        return None
    usage: dict[str, dict[str, dict[str, Any]]] = {}
    for day in days:
        payload = remote.get_json(_analytics_daily_key(day))
        usage[day] = (payload or {}).get("runs") or {}
    return usage


def record_daily_usage(day: str, run_id: str, entry: dict[str, Any]) -> None:
    remote = _json_object_backend()
    if remote is None:
        return
    key = _analytics_daily_key(day)
    payload = remote.get_json(key) or {"version": _ANALYTICS_DAILY_VERSION, "runs": {}}
    payload.setdefault("runs", {})[run_id] = entry
    remote.put_json(key, payload)


def write_daily_usage(usage: dict[str, dict[str, dict[str, Any]]], backend=None) -> None:
    """Replaces each given day's file, then marks the set as built."""
    remote = backend or _json_object_backend()
    if remote is None:
        return
    for day, runs in usage.items():
        remote.put_json(
            _analytics_daily_key(day), {"version": _ANALYTICS_DAILY_VERSION, "runs": runs}
        )
    remote.put_json(_ANALYTICS_DAILY_MARKER_KEY, {"version": _ANALYTICS_DAILY_VERSION})


def list_runs_for_graph(graph_id: str, *, limit: int | None = 50) -> list[RunSummary]:
    """Newest first; `limit=None` returns every run (paged routes)."""
    remote = _json_object_backend()
    if remote is not None:
        keys = remote.list_keys(f"{_RUN_INDEX_PREFIX}{graph_id}/", newest_first=True, limit=limit)
        return _read_run_summaries(remote, keys)
    with _connect() as conn:
        rows = conn.execute(
            """
            select run_id, graph_id, status, input_json, provider,
                   result_json, error, started_at, completed_at, route_decisions_json,
                   graph_release_id, graph_fingerprint, source, runtime_target, compiler_version
            from run
            where graph_id = ?
            order by started_at desc
            limit ?
            """,
            (graph_id, -1 if limit is None else limit),
        ).fetchall()
    return [_row_to_run_summary(row) for row in rows]


def get_run_traces(run_id: str) -> list[NodeTrace]:
    remote = _json_object_backend()
    if remote is not None:
        return remote.get_run_traces(run_id)
    with _connect() as conn:
        rows = conn.execute(
            "select trace_json from run_node_trace where run_id = ? order by node_id",
            (run_id,),
        ).fetchall()
    return [NodeTrace.model_validate(json.loads(row[0])) for row in rows]


def delete_graph(graph_id: str) -> bool:
    """Deletes a graph; returns whether it existed. Added for
    studio-consolidation Phase 3 — graphs were previously never deletable
    through this API."""
    remote = _json_object_backend()
    if remote is not None:
        # Matches _graph_key("graphs/{id}.json") in object_store.py /
        # supabase_store.py — not exposed as a shared helper, so inlined here.
        deleted = remote.delete_json(f"{_GRAPH_PREFIX}{graph_id}.json")
        if deleted:
            _update_graph_catalog(remote, graph_id, None)
        return deleted
    with _connect() as conn:
        row = conn.execute("select 1 from graph where id = ?", (graph_id,)).fetchone()
        if row is None:
            return False
        conn.execute("delete from graph where id = ?", (graph_id,))
    return True


# ---------------------------------------------------------------------------
# Generic resource CRUD (studio-consolidation Phase 3, see
# docs/planning/features/studio-consolidation-plan.md and
# resource_models.py). Prompts, tools, MCP servers, agents, and LLM
# profiles are all small, JSON-shaped, non-relational documents — same
# shape as `graph` — so one generic store serves all five kinds rather
# than duplicating the graph/run pattern five times across four backends.
# Remote object key convention: ``resources/{kind}/{id}.json``.
# ---------------------------------------------------------------------------

_RESOURCE_PREFIX = "resources/"


def _resource_key(kind: str, resource_id: str) -> str:
    return f"{_RESOURCE_PREFIX}{kind}/{resource_id}.json"


def save_resource(kind: str, resource_id: str, payload: dict[str, Any]) -> None:
    remote = _json_object_backend()
    if remote is not None:
        remote.put_json(_resource_key(kind, resource_id), payload)
        return
    with _connect() as conn:
        conn.execute(
            "insert into resource (kind, id, payload_json) values (?, ?, ?) "
            "on conflict(kind, id) do update set payload_json = excluded.payload_json",
            (kind, resource_id, json.dumps(payload)),
        )


def get_resource(kind: str, resource_id: str) -> dict[str, Any] | None:
    remote = _json_object_backend()
    if remote is not None:
        return remote.get_json(_resource_key(kind, resource_id))
    with _connect() as conn:
        row = conn.execute(
            "select payload_json from resource where kind = ? and id = ?", (kind, resource_id)
        ).fetchone()
    if row is None:
        return None
    return json.loads(row[0])


def list_resources(kind: str) -> list[dict[str, Any]]:
    remote = _json_object_backend()
    if remote is not None:
        items: list[dict[str, Any]] = []
        for key in remote.list_keys(f"{_RESOURCE_PREFIX}{kind}/"):
            payload = remote.get_json(key)
            if payload is not None:
                items.append(payload)
        items.sort(key=lambda item: item.get("id", ""))
        return items
    with _connect() as conn:
        rows = conn.execute(
            "select payload_json from resource where kind = ? order by id", (kind,)
        ).fetchall()
    return [json.loads(row[0]) for row in rows]


def delete_resource(kind: str, resource_id: str) -> bool:
    remote = _json_object_backend()
    if remote is not None:
        return remote.delete_json(_resource_key(kind, resource_id))
    with _connect() as conn:
        row = conn.execute(
            "select 1 from resource where kind = ? and id = ?", (kind, resource_id)
        ).fetchone()
        if row is None:
            return False
        conn.execute("delete from resource where kind = ? and id = ?", (kind, resource_id))
    return True


# ---------------------------------------------------------------------------
# Immutable graph releases (P0 graph foundation, Slice A — see
# docs/planning/features/p0-graph-foundation-design-plan.md). Storage
# primitives only: nothing calls these yet, since no publish route exists
# until Slice C. A dedicated release-index + release-payload pair (not an
# unbounded array on `graph`) so listing a graph's releases doesn't require
# loading every release body.
# ---------------------------------------------------------------------------

_RELEASE_PREFIX = "graph_releases/"
_RELEASE_INDEX_PREFIX = "graph_release_index/"
_RELEASE_OWNER_PREFIX = "graph_release_owner/"


def _release_key(graph_id: str, release_id: str) -> str:
    return f"{_RELEASE_PREFIX}{graph_id}/{release_id}.json"


def _release_index_key(graph_id: str) -> str:
    return f"{_RELEASE_INDEX_PREFIX}{graph_id}.json"


def _release_owner_key(release_id: str) -> str:
    return f"{_RELEASE_OWNER_PREFIX}{release_id}.json"


def save_release(
    release_id: str,
    graph_id: str,
    payload: dict[str, Any],
    *,
    semantic_fingerprint: str,
    document_fingerprint: str,
    created_at: str,
) -> None:
    remote = _json_object_backend()
    if remote is not None:
        remote.put_json(_release_key(graph_id, release_id), payload)
        # design doc's REST API is `/api/graph-releases/{release_id}/...`,
        # deliberately release_id-only (no graph_id in the path) — the
        # object-store backends key release bodies by graph_id too
        # (`graph_releases/{graph_id}/{release_id}.json`), so a release_id
        # alone can't be turned back into a key without this reverse
        # pointer. The SQL path needs no such pointer: graph_id is already a
        # column on the graph_release_payload row (see get_release_graph_id).
        remote.put_json(_release_owner_key(release_id), {"graph_id": graph_id})
        index = get_release_index(graph_id)
        index.append(
            {
                "release_id": release_id,
                "semantic_fingerprint": semantic_fingerprint,
                "document_fingerprint": document_fingerprint,
                "created_at": created_at,
            }
        )
        remote.put_json(_release_index_key(graph_id), {"releases": index})
        return
    with _connect() as conn:
        conn.execute(
            "insert into graph_release_payload (release_id, graph_id, payload_json, created_at) "
            "values (?, ?, ?, ?)",
            (release_id, graph_id, json.dumps(payload), created_at),
        )
        conn.execute(
            "insert into graph_release_index "
            "(graph_id, release_id, semantic_fingerprint, document_fingerprint, created_at) "
            "values (?, ?, ?, ?, ?)",
            (graph_id, release_id, semantic_fingerprint, document_fingerprint, created_at),
        )


def get_release(release_id: str, graph_id: str) -> dict[str, Any] | None:
    remote = _json_object_backend()
    if remote is not None:
        return remote.get_json(_release_key(graph_id, release_id))
    with _connect() as conn:
        row = conn.execute(
            "select payload_json from graph_release_payload where release_id = ?", (release_id,)
        ).fetchone()
    if row is None:
        return None
    return json.loads(row[0])


def get_release_index(graph_id: str) -> list[dict[str, Any]]:
    remote = _json_object_backend()
    if remote is not None:
        payload = remote.get_json(_release_index_key(graph_id))
        return list(payload.get("releases", [])) if payload else []
    with _connect() as conn:
        rows = conn.execute(
            "select release_id, semantic_fingerprint, document_fingerprint, created_at "
            "from graph_release_index where graph_id = ? order by created_at",
            (graph_id,),
        ).fetchall()
    return [
        {
            "release_id": row[0],
            "semantic_fingerprint": row[1],
            "document_fingerprint": row[2],
            "created_at": row[3],
        }
        for row in rows
    ]


def get_release_graph_id(release_id: str) -> str | None:
    """Reverse lookup: which graph a release_id belongs to, with no graph_id
    given — what `/api/graph-releases/{release_id}/...` routes need before
    they can call `get_release(release_id, graph_id)`."""
    remote = _json_object_backend()
    if remote is not None:
        payload = remote.get_json(_release_owner_key(release_id))
        return payload.get("graph_id") if payload else None
    with _connect() as conn:
        row = conn.execute(
            "select graph_id from graph_release_payload where release_id = ?", (release_id,)
        ).fetchone()
    return row[0] if row else None


# ---------------------------------------------------------------------------
# Run graph snapshots (P0 graph foundation, Slice D — see
# docs/planning/features/p0-graph-foundation-design-plan.md, "Persistence
# and API"). One durable record per run_id, written once at run creation,
# never updated or deleted — including by delete_graph (below), which only
# ever touches the `graph` table/key.
# ---------------------------------------------------------------------------

_RUN_GRAPH_SNAPSHOT_PREFIX = "run_graph_snapshots/"


def _run_graph_snapshot_key(run_id: str) -> str:
    return f"{_RUN_GRAPH_SNAPSHOT_PREFIX}{run_id}.json"


def save_run_graph_snapshot(
    run_id: str, graph_id: str, payload: dict[str, Any], *, created_at: str
) -> None:
    remote = _json_object_backend()
    if remote is not None:
        remote.put_json(_run_graph_snapshot_key(run_id), payload)
        return
    with _connect() as conn:
        conn.execute(
            "insert into run_graph_snapshot (run_id, graph_id, payload_json, created_at) "
            "values (?, ?, ?, ?) "
            "on conflict(run_id) do update set payload_json = excluded.payload_json",
            (run_id, graph_id, json.dumps(payload), created_at),
        )


def get_run_graph_snapshot(run_id: str) -> dict[str, Any] | None:
    remote = _json_object_backend()
    if remote is not None:
        return remote.get_json(_run_graph_snapshot_key(run_id))
    with _connect() as conn:
        row = conn.execute(
            "select payload_json from run_graph_snapshot where run_id = ?", (run_id,)
        ).fetchone()
    if row is None:
        return None
    return json.loads(row[0])


# ---------------------------------------------------------------------------
# Versioned reusable entity registry (P1 rollout plan, parallel track — see
# docs/planning/features/p1-rollout-plan.md). An immutable version/history
# table beside `resource` above, same version-index + version-payload pair
# shape as graph_release_index/graph_release_payload: listing a resource's
# versions doesn't require loading every version body. `save_resource`'s own
# destructive-overwrite behavior on the `resource` table is unchanged — this
# is a parallel audit trail, not a replacement for it.
# ---------------------------------------------------------------------------

_RESOURCE_VERSION_PREFIX = "resource_versions/"
_RESOURCE_VERSION_INDEX_PREFIX = "resource_version_index/"


def _resource_version_key(kind: str, resource_id: str, version_id: str) -> str:
    return f"{_RESOURCE_VERSION_PREFIX}{kind}/{resource_id}/{version_id}.json"


def _resource_version_index_key(kind: str, resource_id: str) -> str:
    return f"{_RESOURCE_VERSION_INDEX_PREFIX}{kind}/{resource_id}.json"


def save_resource_version(
    kind: str,
    resource_id: str,
    version_id: str,
    payload: dict[str, Any],
    *,
    fingerprint: str,
    created_at: str,
) -> None:
    remote = _json_object_backend()
    if remote is not None:
        remote.put_json(_resource_version_key(kind, resource_id, version_id), payload)
        index = get_resource_version_index(kind, resource_id)
        index.append(
            {"version_id": version_id, "fingerprint": fingerprint, "created_at": created_at}
        )
        remote.put_json(_resource_version_index_key(kind, resource_id), {"versions": index})
        return
    with _connect() as conn:
        conn.execute(
            "insert into resource_version_payload "
            "(version_id, kind, resource_id, payload_json, created_at) values (?, ?, ?, ?, ?)",
            (version_id, kind, resource_id, json.dumps(payload), created_at),
        )
        conn.execute(
            "insert into resource_version_index "
            "(kind, resource_id, version_id, fingerprint, created_at) values (?, ?, ?, ?, ?)",
            (kind, resource_id, version_id, fingerprint, created_at),
        )


def get_resource_version(kind: str, resource_id: str, version_id: str) -> dict[str, Any] | None:
    remote = _json_object_backend()
    if remote is not None:
        return remote.get_json(_resource_version_key(kind, resource_id, version_id))
    with _connect() as conn:
        row = conn.execute(
            "select payload_json from resource_version_payload where version_id = ?", (version_id,)
        ).fetchone()
    if row is None:
        return None
    return json.loads(row[0])


def get_resource_version_index(kind: str, resource_id: str) -> list[dict[str, Any]]:
    remote = _json_object_backend()
    if remote is not None:
        payload = remote.get_json(_resource_version_index_key(kind, resource_id))
        return list(payload.get("versions", [])) if payload else []
    with _connect() as conn:
        rows = conn.execute(
            "select version_id, fingerprint, created_at from resource_version_index "
            "where kind = ? and resource_id = ? order by created_at",
            (kind, resource_id),
        ).fetchall()
    return [{"version_id": row[0], "fingerprint": row[1], "created_at": row[2]} for row in rows]


# ---------------------------------------------------------------------------
# Policy exceptions (P2, "Cross-cutting policy overlays" — see
# docs/planning/roadmap.md's Strategic Roadmap Addendum and policies.py).
# Every route that touches one is graph-scoped (`/api/graphs/{graph_id}/
# policy-exceptions/...`), so — unlike graph releases' deliberately
# release_id-only routes — there's no need for a separate owner reverse
# index here.
# ---------------------------------------------------------------------------

_POLICY_EXCEPTION_PREFIX = "policy_exceptions/"


def _policy_exception_key(graph_id: str, exception_id: str) -> str:
    return f"{_POLICY_EXCEPTION_PREFIX}{graph_id}/{exception_id}.json"


def save_policy_exception(graph_id: str, exception_id: str, payload: dict[str, Any]) -> None:
    remote = _json_object_backend()
    if remote is not None:
        remote.put_json(_policy_exception_key(graph_id, exception_id), payload)
        return
    with _connect() as conn:
        conn.execute(
            "insert into policy_exception "
            "(id, graph_id, policy_code, node_id, reason, created_at, expires_at) "
            "values (?, ?, ?, ?, ?, ?, ?)",
            (
                exception_id,
                graph_id,
                payload["policy_code"],
                payload.get("node_id"),
                payload.get("reason"),
                payload["created_at"],
                payload["expires_at"],
            ),
        )


def list_policy_exceptions(graph_id: str) -> list[dict[str, Any]]:
    remote = _json_object_backend()
    if remote is not None:
        items: list[dict[str, Any]] = []
        for key in remote.list_keys(f"{_POLICY_EXCEPTION_PREFIX}{graph_id}/"):
            payload = remote.get_json(key)
            if payload is not None:
                items.append(payload)
        items.sort(key=lambda item: item.get("created_at", ""))
        return items
    with _connect() as conn:
        rows = conn.execute(
            "select id, graph_id, policy_code, node_id, reason, created_at, expires_at "
            "from policy_exception where graph_id = ? order by created_at",
            (graph_id,),
        ).fetchall()
    return [
        {
            "id": row[0],
            "graph_id": row[1],
            "policy_code": row[2],
            "node_id": row[3],
            "reason": row[4],
            "created_at": row[5],
            "expires_at": row[6],
        }
        for row in rows
    ]


def list_all_policy_exceptions() -> list[dict[str, Any]]:
    """Every graph's exceptions, oldest first -- the workspace Policies page."""
    remote = _json_object_backend()
    if remote is not None:
        items: list[dict[str, Any]] = []
        for key in remote.list_keys(_POLICY_EXCEPTION_PREFIX):
            payload = remote.get_json(key)
            if payload is not None:
                items.append(payload)
        items.sort(key=lambda item: item.get("created_at", ""))
        return items
    with _connect() as conn:
        rows = conn.execute(
            "select id, graph_id, policy_code, node_id, reason, created_at, expires_at "
            "from policy_exception order by created_at"
        ).fetchall()
    return [
        {
            "id": row[0],
            "graph_id": row[1],
            "policy_code": row[2],
            "node_id": row[3],
            "reason": row[4],
            "created_at": row[5],
            "expires_at": row[6],
        }
        for row in rows
    ]


def get_policy_exception(graph_id: str, exception_id: str) -> dict[str, Any] | None:
    for item in list_policy_exceptions(graph_id):
        if item.get("id") == exception_id:
            return item
    return None


def update_policy_exception(graph_id: str, exception_id: str, payload: dict[str, Any]) -> None:
    """Overwrites an existing exception's expiry/reason (the caller has
    already checked it exists)."""
    remote = _json_object_backend()
    if remote is not None:
        remote.put_json(_policy_exception_key(graph_id, exception_id), payload)
        return
    with _connect() as conn:
        conn.execute(
            "update policy_exception set reason = ?, expires_at = ? where id = ? and graph_id = ?",
            (payload.get("reason"), payload["expires_at"], exception_id, graph_id),
        )


def delete_policy_exception(graph_id: str, exception_id: str) -> bool:
    remote = _json_object_backend()
    if remote is not None:
        return remote.delete_json(_policy_exception_key(graph_id, exception_id))
    with _connect() as conn:
        row = conn.execute(
            "select 1 from policy_exception where id = ? and graph_id = ?",
            (exception_id, graph_id),
        ).fetchone()
        if row is None:
            return False
        conn.execute(
            "delete from policy_exception where id = ? and graph_id = ?", (exception_id, graph_id)
        )
    return True


_POLICY_SETTINGS_PREFIX = "policy_settings/"


def _policy_settings_key(scope: str) -> str:
    return f"{_POLICY_SETTINGS_PREFIX}{scope.replace(':', '/')}.json"


def get_policy_settings(scope: str) -> dict[str, Any] | None:
    """`scope` is "workspace" or "graph:<graph_id>"."""
    remote = _json_object_backend()
    if remote is not None:
        return remote.get_json(_policy_settings_key(scope))
    with _connect() as conn:
        row = conn.execute(
            "select payload from policy_settings where scope = ?", (scope,)
        ).fetchone()
    return json.loads(row[0]) if row else None


def save_policy_settings(scope: str, payload: dict[str, Any]) -> None:
    remote = _json_object_backend()
    if remote is not None:
        remote.put_json(_policy_settings_key(scope), payload)
        return
    with _connect() as conn:
        conn.execute("delete from policy_settings where scope = ?", (scope,))
        conn.execute(
            "insert into policy_settings (scope, payload, updated_at) values (?, ?, ?)",
            (scope, json.dumps(payload), payload.get("updated_at") or ""),
        )


# ---------------------------------------------------------------------------
# Knowledge retrieval lineage (P2, "Retrieval/document lineage graph" — see
# docs/planning/roadmap.md's Strategic Roadmap Addendum and knowledge.py).
# Graph-scoped like policy exceptions above: every route is
# `/api/graphs/{graph_id}/knowledge/...`, and the per-document filter
# (`list_knowledge_lineage`'s `document_id`) is applied in Python over a
# graph's entries rather than needing a second index — a graph's knowledge
# base is a handful of documents at most (see knowledge.py's
# MAX_UPLOAD_BYTES), so this never scans more than one graph's history.
# ---------------------------------------------------------------------------

_KNOWLEDGE_LINEAGE_PREFIX = "knowledge_lineage/"


def _knowledge_lineage_key(graph_id: str, entry_id: str) -> str:
    return f"{_KNOWLEDGE_LINEAGE_PREFIX}{graph_id}/{entry_id}.json"


def save_knowledge_lineage_entry(graph_id: str, entry_id: str, payload: dict[str, Any]) -> None:
    remote = _json_object_backend()
    if remote is not None:
        remote.put_json(_knowledge_lineage_key(graph_id, entry_id), payload)
        return
    with _connect() as conn:
        conn.execute(
            "insert into knowledge_lineage_entry "
            "(id, graph_id, document_id, document_name, chunk_id, run_id, node_id, score, "
            "created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                entry_id,
                graph_id,
                payload["document_id"],
                payload["document_name"],
                payload["chunk_id"],
                payload["run_id"],
                payload["node_id"],
                payload["score"],
                payload["created_at"],
            ),
        )


def list_knowledge_lineage(graph_id: str, document_id: str | None = None) -> list[dict[str, Any]]:
    remote = _json_object_backend()
    if remote is not None:
        items: list[dict[str, Any]] = []
        for key in remote.list_keys(f"{_KNOWLEDGE_LINEAGE_PREFIX}{graph_id}/"):
            payload = remote.get_json(key)
            if payload is not None:
                items.append(payload)
    else:
        with _connect() as conn:
            rows = conn.execute(
                "select id, graph_id, document_id, document_name, chunk_id, run_id, node_id, "
                "score, created_at from knowledge_lineage_entry where graph_id = ? "
                "order by created_at",
                (graph_id,),
            ).fetchall()
        items = [
            {
                "id": row[0],
                "graph_id": row[1],
                "document_id": row[2],
                "document_name": row[3],
                "chunk_id": row[4],
                "run_id": row[5],
                "node_id": row[6],
                "score": row[7],
                "created_at": row[8],
            }
            for row in rows
        ]
    if document_id is not None:
        items = [item for item in items if item["document_id"] == document_id]
    items.sort(key=lambda item: item.get("created_at", ""))
    return items
