"""One-shot copy: Vercel Blob JSON objects -> Supabase Storage bucket.

Prod moved off Vercel Blob on 2026-09-24 after the Hobby-plan store was
suspended for exceeding its monthly operation limits (Blob stays locked for
30 days). Once the store is readable again, this copies every ``*.json`` key
(graphs, runs, resources, policy exceptions, knowledge lineage — all share
the same key layout across backends) into the Supabase bucket unchanged.

Dry run by default. Needs both backends' env vars at once::

    BLOB_READ_WRITE_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
        python -m scripts.copy_blob_to_supabase [--apply] [--overwrite]

Run from ``backend/``. Keys already present in Supabase are skipped unless
``--overwrite`` is passed, so re-running after a partial copy is safe.

Raw key copies bypass ``storage.save_graph``/``save_run_snapshot``, so an
applied copy then rebuilds Supabase's graph catalog, run index and
analytics daily usage.
"""

from __future__ import annotations

import argparse
import sys

from app import storage, supabase_store, vercel_blob
from app.analytics import rebuild_daily_usage


def copy_all(*, apply: bool, overwrite: bool) -> dict[str, int]:
    counts = {"found": 0, "copied": 0, "skipped_existing": 0, "missing_source": 0}
    for key in vercel_blob.list_keys(""):
        counts["found"] += 1
        if not overwrite and supabase_store.get_json(key) is not None:
            counts["skipped_existing"] += 1
            continue
        payload = vercel_blob.get_json(key)
        if payload is None:
            counts["missing_source"] += 1
            continue
        if apply:
            supabase_store.put_json(key, payload)
        counts["copied"] += 1
        print(f"{'copied' if apply else 'would copy'}: {key}")
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="write to Supabase (default: dry run)")
    parser.add_argument("--overwrite", action="store_true", help="replace keys already in Supabase")
    args = parser.parse_args(argv)

    counts = copy_all(apply=args.apply, overwrite=args.overwrite)
    if args.apply:
        counts["catalog_graphs"] = storage.rebuild_graph_catalog(supabase_store)
        counts["run_index_written"] = storage.backfill_run_index(supabase_store)
        counts["analytics_days"] = rebuild_daily_usage(supabase_store)
    mode = "applied" if args.apply else "dry run"
    print(f"[{mode}] " + ", ".join(f"{name}={value}" for name, value in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
