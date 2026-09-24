"""Opt-in cursor pagination for list routes (SDK 4/7 -- docs/planning/
features/sdk-hardening-plan.md, Phase 2, STO-617).

Non-breaking by design: a list route called without `limit` or `cursor`
returns exactly what it always did. With `?limit=N` it returns at most N
items, in the route's documented page order, and sets `X-Next-Cursor` when
more remain; pass that value back as `?cursor=` for the next page. The body
stays a plain JSON array, so the response schema (and every existing
client) is unchanged.

A cursor is the opaque, base64url-encoded sort key of the last item on the
previous page, and the next page is every item strictly after it -- so an
item deleted between pages never shifts or repeats the rest.
"""

from __future__ import annotations

import base64
import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Annotated, TypeVar

from fastapi import Depends, HTTPException, Query, Response

NEXT_CURSOR_HEADER = "X-Next-Cursor"
MAX_PAGE_SIZE = 500

T = TypeVar("T")
SortKey = tuple[str, ...]


@dataclass(frozen=True)
class PageParams:
    limit: int | None
    cursor: str | None
    response: Response

    @property
    def requested(self) -> bool:
        return self.limit is not None or self.cursor is not None


def page_params(
    response: Response,
    limit: int | None = Query(
        None, ge=1, le=MAX_PAGE_SIZE, description="Page size. Omit for the full list."
    ),
    cursor: str | None = Query(
        None, description="`X-Next-Cursor` from the previous page."
    ),
) -> PageParams:
    return PageParams(limit=limit, cursor=cursor, response=response)


Page = Annotated[PageParams, Depends(page_params)]


def paginate(
    items: Sequence[T],
    page: PageParams,
    *,
    key: Callable[[T], SortKey],
    descending: bool = False,
) -> list[T]:
    if not page.requested:
        return list(items)
    ordered = sorted(items, key=key, reverse=descending)
    if page.cursor is not None:
        after = decode_cursor(page.cursor)
        ordered = [
            item for item in ordered if (key(item) < after if descending else key(item) > after)
        ]
    size = page.limit or MAX_PAGE_SIZE
    result = ordered[:size]
    if len(ordered) > size:
        page.response.headers[NEXT_CURSOR_HEADER] = encode_cursor(key(result[-1]))
    return result


def encode_cursor(key: SortKey) -> str:
    raw = json.dumps(list(key), separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str) -> SortKey:
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        value = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="invalid cursor") from exc
    if not isinstance(value, list) or not all(isinstance(part, str) for part in value):
        raise HTTPException(status_code=400, detail="invalid cursor")
    return tuple(value)


def field_key(*fields: str) -> Callable[[object], SortKey]:
    """A sort key over dict keys or model attributes; missing/None -> ""."""

    def key(item: object) -> SortKey:
        values = []
        for name in fields:
            value = item.get(name) if isinstance(item, dict) else getattr(item, name, None)
            values.append("" if value is None else str(value))
        return tuple(values)

    return key


__all__ = [
    "MAX_PAGE_SIZE",
    "NEXT_CURSOR_HEADER",
    "Page",
    "PageParams",
    "decode_cursor",
    "encode_cursor",
    "field_key",
    "page_params",
    "paginate",
]
