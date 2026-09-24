"""The API's published contract (SDK 3/7 -- docs/planning/features/
sdk-hardening-plan.md, Phase 3, STO-616).

FastAPI's OpenAPI document is committed to
`packages/agent-graph-sdk/contract/openapi.json`, and the SDK generates its
types from that file. Two drift checks keep them honest: this repo's pytest
fails when the committed document is stale (tests/test_openapi_contract.py),
and the SDK's vitest fails when its generated types are stale. Regenerate
with `uv run python -m scripts.export_openapi` (backend/), then
`pnpm --filter @bstockwelldev/agent-graph-sdk run generate`.

`API_VERSION` is sent on every response as `X-AGB-API-Version`; the SDK
warns when the server is ahead of the contract it was generated from.
Bump the minor version for additive API changes, the major for breaking
ones.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

API_VERSION = "0.3.0"
API_VERSION_HEADER = "X-AGB-API-Version"

CONTRACT_PATH = (
    Path(__file__).resolve().parents[2]
    / "packages"
    / "agent-graph-sdk"
    / "contract"
    / "openapi.json"
)


def openapi_document() -> dict[str, Any]:
    from .main import app  # the app imports this module for API_VERSION

    return app.openapi()


def render_contract(document: dict[str, Any] | None = None) -> str:
    """Deterministic JSON: sorted keys, 2-space indent, trailing newline."""
    return json.dumps(document or openapi_document(), indent=2, sort_keys=True) + "\n"


__all__ = [
    "API_VERSION",
    "API_VERSION_HEADER",
    "CONTRACT_PATH",
    "openapi_document",
    "render_contract",
]
