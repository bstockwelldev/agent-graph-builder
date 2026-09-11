"""SPA cache header policy — prevent stale index.html after deploy."""

from __future__ import annotations

from starlette.responses import Response

from app.spa_cache import apply_spa_cache_headers


def test_hashed_assets_are_immutable() -> None:
    response = Response()
    apply_spa_cache_headers("/assets/index-C7PqBk-K.js", "", response)
    assert response.headers["Cache-Control"] == "public, max-age=31536000, immutable"


def test_index_html_must_revalidate() -> None:
    response = Response()
    apply_spa_cache_headers("/", "text/html", response)
    assert response.headers["Cache-Control"] == "no-cache, must-revalidate"

    response = Response()
    apply_spa_cache_headers("/index.html", "text/html", response)
    assert response.headers["Cache-Control"] == "no-cache, must-revalidate"


def test_api_routes_are_untouched() -> None:
    response = Response()
    apply_spa_cache_headers("/api/graphs", "application/json", response)
    assert "Cache-Control" not in response.headers
