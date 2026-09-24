"""SDK 3/7 (STO-616): the committed OpenAPI contract and the version header."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.api_contract import API_VERSION, API_VERSION_HEADER, CONTRACT_PATH, render_contract
from app.main import app

client = TestClient(app)


def test_committed_contract_matches_the_app() -> None:
    """Changing a Pydantic model or route without regenerating fails here.
    Fix: `uv run python -m scripts.export_openapi`, then regenerate the SDK
    types (`pnpm --filter @bstockwelldev/agent-graph-sdk run generate`)."""
    assert CONTRACT_PATH.read_text() == render_contract(), (
        "packages/agent-graph-sdk/contract/openapi.json is stale -- "
        "run `uv run python -m scripts.export_openapi` in backend/"
    )


def test_contract_carries_the_api_version() -> None:
    assert app.openapi()["info"]["version"] == API_VERSION


def test_every_response_names_the_api_version() -> None:
    assert client.get("/api/health").headers[API_VERSION_HEADER] == API_VERSION
    assert client.get("/api/graphs/missing").headers[API_VERSION_HEADER] == API_VERSION
    preflight = client.options(
        "/api/graphs",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    exposed = client.get("/api/graphs", headers={"Origin": "http://localhost:3000"}).headers
    assert preflight.status_code == 200
    assert API_VERSION_HEADER.lower() in exposed.get("access-control-expose-headers", "").lower()
