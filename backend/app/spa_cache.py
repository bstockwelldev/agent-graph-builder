"""Cache-Control helpers for the Vite SPA shell vs hashed build assets."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


def apply_spa_cache_headers(path: str, accept: str, response: Response) -> None:
    """Hashed assets are immutable; the HTML shell must revalidate after deploy."""
    if path.startswith("/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return

    if path in ("/", "/index.html") or _is_html_navigation(path, accept):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"


def _is_html_navigation(path: str, accept: str) -> bool:
    if "text/html" not in accept and "application/xhtml+xml" not in accept:
        return False
    last_segment = path.rsplit("/", 1)[-1]
    return "." not in last_segment


class SpaCacheControlMiddleware(BaseHTTPMiddleware):
    """Set SPA-friendly Cache-Control on frontend responses."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        apply_spa_cache_headers(request.url.path, request.headers.get("accept", ""), response)
        return response
