"""Lightweight static prompt-quality checks for the `rubric` node type.

Added for studio-consolidation Phase 2
(docs/planning/features/studio-consolidation-plan.md). Not a port of
`@bstockwelldev/prompt-rubric` (also npm-only) — a small, dependency-free
stand-in that flags a few structural issues in whatever upstream text
reaches a `rubric` node. Full parity with that package, if ever needed, is
future work.
"""

from __future__ import annotations

import re

_PLACEHOLDER_PATTERN = re.compile(r"\{[A-Za-z_][A-Za-z0-9_]*\}")
_MARKER_PATTERN = re.compile(r"\b(TODO|FIXME|XXX)\b")
_SINGLE_LINE_LENGTH_THRESHOLD = 600


def analyze_prompt(text: str) -> list[str]:
    """Return static finding messages for `text`; an empty list means clean."""
    findings: list[str] = []
    stripped = text.strip()

    if not stripped:
        findings.append("prompt text is empty")
        return findings

    placeholders = sorted(set(_PLACEHOLDER_PATTERN.findall(stripped)))
    if placeholders:
        findings.append(f"unresolved template placeholder(s): {', '.join(placeholders)}")

    if _MARKER_PATTERN.search(stripped):
        findings.append("prompt contains a TODO/FIXME/XXX marker")

    if "\n" not in stripped and len(stripped) > _SINGLE_LINE_LENGTH_THRESHOLD:
        findings.append(f"prompt is a single {len(stripped)}-character line with no structure")

    return findings
