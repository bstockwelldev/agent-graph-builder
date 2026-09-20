"""Versioned reusable entity registry.

Part of the P1 rollout plan (docs/planning/features/p1-rollout-plan.md),
parallel track: "Versioned reusable entity registry". Prompts, tools, MCP
servers, agents, and LLM profiles today live in `storage.py`'s single
`resource(kind, id, payload_json)` table — `save_resource` is a plain
upsert, so editing one destructively overwrites its prior content with no
history. This module adds an immutable version/history table beside it,
mirroring `releases.py`'s publish/fingerprint/dedupe shape:
`publish_resource_version` snapshots the resource's current stored payload,
fingerprints it, and only creates a new version when no existing version
already has that fingerprint — the same idempotency `publish_release`
already has for graphs.

Deliberately narrower than a full entity registry: no branching, no
approvals, no "current version" pointer distinct from `resource`'s own CRUD
row (that table stays the mutable draft; versions are a pure audit trail
beside it), and no blast-radius analysis of which graphs reference a given
version — those are further-out P1/P2 scope this track doesn't claim.

Credential caveat (P0 doc, "Resource reproducibility" — restated here since
it applies just as directly to this table): if a future resource model
gains an auth/secret field, it must be excluded from the versioned payload
here (or encrypted separately) before that kind is added to
`VERSIONABLE_RESOURCE_KINDS`. None of the five kinds below has one today.
`chat_sessions` is deliberately excluded — it's a runtime scratchpad
(studio-consolidation Phase 8), not a reusable authored asset.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from . import storage
from .events import now_iso
from .fingerprint import fingerprint_payload
from .models import PublishResourceVersionResponse, ResourceVersion

VERSIONABLE_RESOURCE_KINDS = frozenset(
    {"prompts", "tools", "mcp_servers", "agents", "llm_profiles"}
)


class UnversionableResourceKind(Exception):
    def __init__(self, kind: str) -> None:
        self.kind = kind
        super().__init__(f"resource kind {kind!r} is not versionable")


class ResourceNotFound(Exception):
    def __init__(self, kind: str, resource_id: str) -> None:
        self.kind = kind
        self.resource_id = resource_id
        super().__init__(f"{kind} {resource_id!r} not found")


def _require_versionable(kind: str) -> None:
    if kind not in VERSIONABLE_RESOURCE_KINDS:
        raise UnversionableResourceKind(kind)


def publish_resource_version(kind: str, resource_id: str) -> PublishResourceVersionResponse:
    """Snapshots `resource_id`'s current stored payload (`storage.get_resource`)
    as an immutable version. `created=False` when an existing version for
    this resource already has the candidate's fingerprint — publish is
    idempotent on that value alone, matching `releases.publish_release`, so
    re-publishing an unchanged resource never creates a duplicate."""
    _require_versionable(kind)
    payload = storage.get_resource(kind, resource_id)
    if payload is None:
        raise ResourceNotFound(kind, resource_id)

    fp = fingerprint_payload(payload)
    for entry in storage.get_resource_version_index(kind, resource_id):
        if entry["fingerprint"] != fp:
            continue
        existing_payload = storage.get_resource_version(kind, resource_id, entry["version_id"])
        if existing_payload is not None:
            return PublishResourceVersionResponse(
                version=ResourceVersion.model_validate(existing_payload), created=False
            )

    version_id = f"rver_{uuid4().hex[:12]}"
    created_at = now_iso()
    version = ResourceVersion(
        version_id=version_id,
        kind=kind,
        resource_id=resource_id,
        payload=payload,
        fingerprint=fp,
        created_at=created_at,
    )
    storage.save_resource_version(
        kind,
        resource_id,
        version_id,
        version.model_dump(mode="json"),
        fingerprint=fp,
        created_at=created_at,
    )
    return PublishResourceVersionResponse(version=version, created=True)


def list_resource_versions(kind: str, resource_id: str) -> list[dict[str, Any]]:
    _require_versionable(kind)
    return storage.get_resource_version_index(kind, resource_id)


def get_resource_version(kind: str, resource_id: str, version_id: str) -> ResourceVersion | None:
    _require_versionable(kind)
    payload = storage.get_resource_version(kind, resource_id, version_id)
    if payload is None:
        return None
    return ResourceVersion.model_validate(payload)


__all__ = [
    "VERSIONABLE_RESOURCE_KINDS",
    "UnversionableResourceKind",
    "ResourceNotFound",
    "publish_resource_version",
    "list_resource_versions",
    "get_resource_version",
]
