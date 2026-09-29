"""Write limits for the anonymous public deploy (STO-626).

With ``PUBLIC_DEMO_MODE`` on there is no login, so anything a visitor can
write, every visitor can. This module keeps that bounded:

- Workspace-scoped policy settings are read-only, and stored workspace
  overrides are ignored (policies.py), so no visitor can switch a rule to
  ``block`` and break every run, the seeded demo's included.
- Each client IP gets a budget for creating stored objects (graphs,
  library resources, releases, datasets, policy exceptions) and a larger
  one for runs, over a rolling hour and day. Saving an object that
  already exists never counts.

Outside public mode every function here is a no-op.
"""

from __future__ import annotations

import hashlib
import os
import threading
import time
from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException, Request

from . import storage
from .env_config import public_demo_mode_enabled

WriteBucket = Literal["create", "run"]

_HOUR = 3600
_DAY = 86400


@dataclass(frozen=True)
class _Budget:
    per_hour: int
    per_day: int


_DEFAULTS: dict[WriteBucket, _Budget] = {
    "create": _Budget(per_hour=30, per_day=100),
    "run": _Budget(per_hour=120, per_day=500),
}

# SQLite/Turso deploys are one process; remote stores share the log instead.
_local_logs: dict[str, dict[str, list[float]]] = {}
_local_lock = threading.Lock()


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


def budget(bucket: WriteBucket) -> _Budget:
    """`PUBLIC_{CREATE,RUN}_LIMIT_PER_{HOUR,DAY}` override the defaults."""
    default = _DEFAULTS[bucket]
    prefix = f"PUBLIC_{bucket.upper()}_LIMIT"
    return _Budget(
        per_hour=_env_int(f"{prefix}_PER_HOUR", default.per_hour),
        per_day=_env_int(f"{prefix}_PER_DAY", default.per_day),
    )


def client_ip(request: Request) -> str:
    """The visitor's address. Vercel sets `x-vercel-forwarded-for` and
    `x-real-ip` itself (clients can't spoof them there); elsewhere the
    first `x-forwarded-for` hop, then the socket peer."""
    for header in ("x-vercel-forwarded-for", "x-real-ip"):
        value = request.headers.get(header, "").strip()
        if value:
            return value.split(",")[0].strip()
    forwarded = request.headers.get("x-forwarded-for", "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _client_key(ip: str) -> str:
    # Store a hash, never the address itself.
    return hashlib.sha256(f"agb-write-quota:{ip}".encode()).hexdigest()[:32]


def _load(key: str) -> dict[str, list[float]]:
    if storage.write_quotas_shared():
        payload = storage.get_write_quota(key) or {}
        return {bucket: [float(t) for t in payload.get(bucket, [])] for bucket in _DEFAULTS}
    return {bucket: list(times) for bucket, times in _local_logs.get(key, {}).items()}


def _save(key: str, log: dict[str, list[float]]) -> None:
    if storage.write_quotas_shared():
        storage.save_write_quota(key, log)
    else:
        _local_logs[key] = log


def charge(request: Request, bucket: WriteBucket) -> None:
    """Counts one write for the caller, or raises 429 once a budget is
    spent. Checked and recorded in one step; on a shared store two
    concurrent requests can both pass, which is fine for a soft limit."""
    if not public_demo_mode_enabled():
        return
    limits = budget(bucket)
    now = time.time()
    key = _client_key(client_ip(request))
    with _local_lock:
        log = _load(key)
        times = [t for t in log.get(bucket, []) if now - t < _DAY]
        last_hour = [t for t in times if now - t < _HOUR]
        if len(last_hour) >= limits.per_hour:
            _reject(bucket, retry_after=int(_HOUR - (now - min(last_hour))) + 1)
        if len(times) >= limits.per_day:
            _reject(bucket, retry_after=int(_DAY - (now - min(times))) + 1)
        times.append(now)
        log[bucket] = times
        _save(key, log)


def _reject(bucket: WriteBucket, *, retry_after: int) -> None:
    what = "runs" if bucket == "run" else "new graphs and library items"
    raise HTTPException(
        status_code=429,
        detail={
            "code": "write_rate_limited",
            "message": (
                f"The public demo limits how many {what} each visitor can create. Try again later."
            ),
            "retry_after": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
    )


def require_workspace_writable() -> None:
    """403 for workspace-scoped writes on the public deploy."""
    if public_demo_mode_enabled():
        raise HTTPException(
            status_code=403,
            detail={
                "code": "workspace_read_only",
                "message": (
                    "Workspace policies are read-only on the public demo. Override a rule "
                    "from your graph's own Policies panel instead."
                ),
            },
        )


def reset_local_quotas() -> None:
    """Tests only."""
    with _local_lock:
        _local_logs.clear()
