"""One-shot Blob -> Supabase copy script (scripts/copy_blob_to_supabase.py)."""

from __future__ import annotations

import pytest

from app import supabase_store, vercel_blob
from scripts import copy_blob_to_supabase


@pytest.fixture
def stores(monkeypatch: pytest.MonkeyPatch) -> tuple[dict, dict]:
    blob = {"graphs/a.json": {"id": "a"}, "runs/r1.json": {"summary": {}}}
    supa = {"graphs/a.json": {"id": "a-old"}}
    monkeypatch.setattr(vercel_blob, "list_keys", lambda prefix: sorted(blob))
    monkeypatch.setattr(vercel_blob, "get_json", lambda key: blob.get(key))
    monkeypatch.setattr(supabase_store, "get_json", lambda key: supa.get(key))
    monkeypatch.setattr(
        supabase_store, "put_json", lambda key, payload: supa.__setitem__(key, payload)
    )
    return blob, supa


def test_dry_run_writes_nothing(stores) -> None:
    _, supa = stores
    counts = copy_blob_to_supabase.copy_all(apply=False, overwrite=False)
    assert counts == {"found": 2, "copied": 1, "skipped_existing": 1, "missing_source": 0}
    assert "runs/r1.json" not in supa


def test_apply_skips_existing_unless_overwrite(stores) -> None:
    _, supa = stores
    copy_blob_to_supabase.copy_all(apply=True, overwrite=False)
    assert supa["runs/r1.json"] == {"summary": {}}
    assert supa["graphs/a.json"] == {"id": "a-old"}

    copy_blob_to_supabase.copy_all(apply=True, overwrite=True)
    assert supa["graphs/a.json"] == {"id": "a"}
