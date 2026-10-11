"""Per-graph extraction document uploads.

`POST /api/graphs/{graph_id}/extract` stores the raw upload bytes (base64
in the JSON resource payload, so they ride the same durable backend as
every other resource: Supabase / object store / SQLite / Turso) and
records file metadata. Extract nodes bind to these documents at run time:
`source="upload"` picks the run input's `documentId` key (falling back to
the graph's latest upload); `source="variable"` reads a run variable
holding a documentId.
"""

from __future__ import annotations

import asyncio
import base64
import io
import os
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel

from .. import storage
from ..env_config import public_demo_mode_enabled
from .base import SUPPORTED_MIMES

# DoS surface on the public demo (see the extraction-node plan's open
# question 2): env-overridable, read once at import like knowledge.py's
# MAX_UPLOAD_BYTES.
EXTRACT_MAX_UPLOAD_BYTES = int(
    os.environ.get("EXTRACT_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024))
)

_RESOURCE_KIND = "extract_documents"


class ExtractUploadError(Exception):
    """Upload rejected: carries the HTTP status the route should return."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


class ExtractDocument(BaseModel):
    id: str
    graph_id: str
    file_name: str
    mime: str
    size_bytes: int
    page_count: int
    uploaded_at: str
    content_b64: str

    def content_bytes(self) -> bytes:
        return base64.b64decode(self.content_b64)


def _probe_page_count(content: bytes, mime: str) -> int:
    """Best-effort page count for the upload response. Never raises: a
    probing failure records 0 rather than rejecting the upload (extraction
    itself reports honest errors later)."""
    try:
        if mime == "application/pdf":
            try:
                import pdfplumber

                with pdfplumber.open(io.BytesIO(content)) as pdf:
                    return len(pdf.pages)
            except ImportError:
                from pypdf import PdfReader

                return len(PdfReader(io.BytesIO(content)).pages)
        if mime in {"image/png", "image/jpeg", "image/tiff"}:
            return 1
    except Exception:
        pass
    return 0


def get_document(document_id: str) -> ExtractDocument | None:
    payload = storage.get_resource(_RESOURCE_KIND, document_id)
    if payload is None:
        return None
    return ExtractDocument.model_validate(payload)


def list_documents(graph_id: str) -> list[ExtractDocument]:
    """Every upload for `graph_id`, oldest first."""
    docs = [
        ExtractDocument.model_validate(item)
        for item in storage.list_resources(_RESOURCE_KIND)
        if item.get("graph_id") == graph_id
    ]
    docs.sort(key=lambda d: d.uploaded_at)
    return docs


def latest_document(graph_id: str) -> ExtractDocument | None:
    docs = list_documents(graph_id)
    return docs[-1] if docs else None


async def store_upload(
    graph_id: str, file_name: str, mime_type: str, content: bytes
) -> dict[str, Any]:
    """Validate and persist one uploaded document for `graph_id`. Returns
    the route's 200 payload. Raises ExtractUploadError (403 demo mode,
    400 bad input, 413 over the size cap)."""
    if public_demo_mode_enabled():
        raise ExtractUploadError(403, "Document uploads are disabled on this public demo.")
    if len(content) > EXTRACT_MAX_UPLOAD_BYTES:
        raise ExtractUploadError(
            413, f"File too large (max {EXTRACT_MAX_UPLOAD_BYTES} bytes)"
        )

    name = file_name or "upload.pdf"
    mime = (mime_type or "application/octet-stream").lower()
    if mime not in SUPPORTED_MIMES:
        raise ExtractUploadError(
            400,
            f"Unsupported file type {mime!r}. Upload a PDF or a "
            "PNG/JPEG/TIFF image.",
        )
    if not content:
        raise ExtractUploadError(400, "Empty file")

    page_count = await asyncio.to_thread(_probe_page_count, content, mime)
    doc = ExtractDocument(
        id=uuid4().hex,
        graph_id=graph_id,
        file_name=name,
        mime=mime,
        size_bytes=len(content),
        page_count=page_count,
        uploaded_at=datetime.now(UTC).isoformat(),
        content_b64=base64.b64encode(content).decode("ascii"),
    )
    storage.save_resource(_RESOURCE_KIND, doc.id, doc.model_dump())
    return {
        "documentId": doc.id,
        "graphId": graph_id,
        "fileName": doc.file_name,
        "mime": doc.mime,
        "sizeBytes": doc.size_bytes,
        "pageCount": doc.page_count,
    }
