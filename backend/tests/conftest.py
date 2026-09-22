"""Isolate storage backend env so local secrets cannot leak into tests."""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest

_OBJECT_STORE_ENV = (
    "OBJECT_STORE_BUCKET",
    "OBJECT_STORE_ENDPOINT",
    "OBJECT_STORE_ACCESS_KEY_ID",
    "OBJECT_STORE_SECRET_ACCESS_KEY",
    "OBJECT_STORE_REGION",
    "BLOB_READ_WRITE_TOKEN",
    "BLOB_STORE_ID",
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
