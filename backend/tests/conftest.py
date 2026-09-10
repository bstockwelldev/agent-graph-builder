"""Isolate storage backend env so local secrets cannot leak into tests."""

from __future__ import annotations

import pytest

_OBJECT_STORE_ENV = (
    "OBJECT_STORE_BUCKET",
    "OBJECT_STORE_ENDPOINT",
    "OBJECT_STORE_ACCESS_KEY_ID",
    "OBJECT_STORE_SECRET_ACCESS_KEY",
    "OBJECT_STORE_REGION",
)


@pytest.fixture(autouse=True)
def _clear_object_store_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in _OBJECT_STORE_ENV:
        monkeypatch.delenv(key, raising=False)
