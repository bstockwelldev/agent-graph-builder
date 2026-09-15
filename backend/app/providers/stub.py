"""Deterministic chat adapter for offline demos and automated tests.

Implements the same `ChatModel` contract as Ollama without network calls.
Classifier-style prompts return `technical` or `other`; all other prompts
return a short deterministic answer string.
"""

from __future__ import annotations

from ..nodes import LOOKUP_TABLE


def _is_classifier_prompt(system_prompt: str | None, user_prompt: str) -> bool:
    combined = f"{system_prompt or ''} {user_prompt}".lower()
    return "classify" in combined or ("technical" in combined and "other" in combined)


def _is_technical_question(user_prompt: str) -> bool:
    normalized = user_prompt.lower()
    if "technical" in normalized.split():
        return True
    return any(keyword in normalized for keyword in LOOKUP_TABLE)


# `tool_loop` node convention (studio-consolidation Phase 2, see
# docs/planning/features/nodes.py:_tool_loop_system_prompt): a
# provider-agnostic, text-based tool-call marker rather than each of the six
# provider adapters implementing native function-calling. Real providers may
# or may not follow it faithfully; Stub follows it deterministically so the
# loop is testable offline.
_TOOL_LOOP_MARKER = "TOOL_CALL: lookup_topic"


def _is_tool_loop_prompt(system_prompt: str | None) -> bool:
    return bool(system_prompt) and _TOOL_LOOP_MARKER in system_prompt


def _already_has_tool_result(user_prompt: str) -> bool:
    return "Tool result for" in user_prompt


class StubChatModel:
    provider_name = "stub"

    def __init__(self, model: str = "stub") -> None:
        self.model = model

    async def generate(self, *, system_prompt: str | None, user_prompt: str) -> str:
        if _is_classifier_prompt(system_prompt, user_prompt):
            return "technical" if _is_technical_question(user_prompt) else "other"
        if (
            _is_tool_loop_prompt(system_prompt)
            and not _already_has_tool_result(user_prompt)
            and _is_technical_question(user_prompt)
        ):
            return f"{_TOOL_LOOP_MARKER}: {user_prompt.strip()}"
        snippet = user_prompt.strip().replace("\n", " ")
        if len(snippet) > 80:
            snippet = f"{snippet[:77]}..."
        return f"[stub answer] {snippet}"
