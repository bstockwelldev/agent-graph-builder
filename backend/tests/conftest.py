"""Isolate storage backend env so local secrets cannot leak into tests."""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

# Point file SQLite at a per-session tmp DB and drop any durable-store env so
# fixture graphs never land in the dev ``backend/graphs.db``. ``storage`` reads
# these at call time; setting them at conftest import precedes the per-test
# env snapshot below, so every test inherits them.
for _key in (
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_BUCKET",
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
    "VERCEL",
):
    os.environ.pop(_key, None)
os.environ["GRAPH_DB_PATH"] = str(
    Path(tempfile.mkdtemp(prefix="agb-tests-")) / "graphs.db"
)

_OBJECT_STORE_ENV = (
    "OBJECT_STORE_BUCKET",
    "OBJECT_STORE_ENDPOINT",
    "OBJECT_STORE_ACCESS_KEY_ID",
    "OBJECT_STORE_SECRET_ACCESS_KEY",
    "OBJECT_STORE_REGION",
    # Removed Blob backend: cleared so a stale local token can't mask a regression.
    "BLOB_READ_WRITE_TOKEN",
)


@pytest.fixture(autouse=True)
def _clear_object_store_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in _OBJECT_STORE_ENV:
        monkeypatch.delenv(key, raising=False)


@pytest.fixture(autouse=True)
def _isolate_process_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Keep dotenv loading from leaking developer secrets across tests.

    ``TestClient(app)`` runs the FastAPI lifespan, which calls
    ``load_app_env()``; with ``BSTOCKWELL_DEV_ROOT`` set that copies a sibling
    repo's ``.env.local`` (e.g. ``SUPABASE_STORAGE_BUCKET``) into
    ``os.environ`` for the rest of the process, breaking later tests that
    assume a clean environment. Neutralize the lifespan loader and restore
    ``os.environ`` after every test as a safety net for anything else that
    mutates it directly.
    """
    from app import main

    monkeypatch.setattr(main, "load_app_env", lambda **_kwargs: None)
    snapshot = dict(os.environ)
    yield
    os.environ.clear()
    os.environ.update(snapshot)
