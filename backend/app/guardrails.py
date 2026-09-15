"""Lightweight input-safety checks for the `guardrail` node type.

Added for studio-consolidation Phase 2
(docs/planning/features/studio-consolidation-plan.md). Not a port of
`@bstockwelldev/prompt-guardrails-core` — that is an npm-only package with
no Python equivalent — but a small, dependency-free stand-in covering the
same policy shape used by micro-ui-agent-builder's
`lib/server/flow-preflight.ts` (`policyFromStep`): a max length and a URL
allowlist toggle, plus a basic prompt-injection phrase check. Full parity
with that package, if ever needed, is future work.
"""

from __future__ import annotations

import re

_URL_PATTERN = re.compile(r"https?://\S+", re.IGNORECASE)

# A short, illustrative list, not an exhaustive injection-detection engine.
_INJECTION_PHRASES = (
    "ignore previous instructions",
    "ignore all previous instructions",
    "disregard previous instructions",
    "disregard all prior instructions",
    "forget your instructions",
    "forget all previous instructions",
)


class GuardrailViolation(ValueError):
    """Raised by `check_guardrail` on the first violation found."""


def check_guardrail(text: str, *, allow_urls: bool = False, max_chars: int = 128_000) -> None:
    """Raise `GuardrailViolation` on the first violation found in `text`.

    Mirrors the constraint shape `flow-preflight.ts` builds per guardrail
    step: `{maxTokens: 128000, allowUrls}` — `max_chars` stands in for a
    token count since this module has no tokenizer dependency.
    """
    if len(text) > max_chars:
        raise GuardrailViolation(f"input exceeds the {max_chars}-character limit ({len(text)} chars)")
    if not allow_urls and _URL_PATTERN.search(text):
        raise GuardrailViolation("input contains a URL, which this guardrail does not allow")
    lowered = text.lower()
    for phrase in _INJECTION_PHRASES:
        if phrase in lowered:
            raise GuardrailViolation(f"input contains a likely prompt-injection phrase: {phrase!r}")
