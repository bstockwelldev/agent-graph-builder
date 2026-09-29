"""MCP server request headers (resource-forms-consistency-plan, slice 3).

Most real MCP servers want an `Authorization` or API-key header. Those are
secrets, so they are kept apart from the `McpServerConfig` resource: the
resource document is returned by the API, versioned, and embedded in
release snapshots and fingerprints, and none of that should carry a
credential. Headers live under their own storage kind, keyed by server id,
and the API only ever returns their names. Runs read the current values,
so rotating a key doesn't need a new release.
"""

from __future__ import annotations

import re

from .. import storage

_KIND = "mcp_server_secrets"
# RFC 9110 token characters.
_HEADER_NAME = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")


class InvalidHeaders(ValueError):
    """A header name or value that can't be sent."""


def load_headers(server_id: str) -> dict[str, str]:
    payload = storage.get_resource(_KIND, server_id) or {}
    headers = payload.get("headers") or {}
    return {str(name): str(value) for name, value in headers.items()}


def header_names(server_id: str) -> list[str]:
    return sorted(load_headers(server_id), key=str.lower)


def update_headers(server_id: str, updates: dict[str, str | None]) -> list[str]:
    """Replaces the server's headers with `updates`. A `None` value keeps
    the stored value for that name (the studio never sees it); a name left
    out is removed. Returns the resulting names."""
    stored = load_headers(server_id)
    headers: dict[str, str] = {}
    for raw_name, value in updates.items():
        name = raw_name.strip()
        if not _HEADER_NAME.match(name):
            raise InvalidHeaders(f"{raw_name!r} isn't a valid header name")
        if any(existing.lower() == name.lower() for existing in headers):
            raise InvalidHeaders(f"header {name!r} is listed twice")
        if value is None:
            if name not in stored:
                raise InvalidHeaders(f"header {name!r} has no stored value; enter one")
            headers[name] = stored[name]
            continue
        if "\r" in value or "\n" in value:
            raise InvalidHeaders(f"header {name!r} can't contain line breaks")
        if not value.strip():
            raise InvalidHeaders(f"header {name!r} needs a value")
        headers[name] = value
    if headers:
        storage.save_resource(_KIND, server_id, {"id": server_id, "headers": headers})
    else:
        storage.delete_resource(_KIND, server_id)
    return sorted(headers, key=str.lower)


def delete_headers(server_id: str) -> None:
    storage.delete_resource(_KIND, server_id)
