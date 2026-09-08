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


class StubChatModel:
    provider_name = "stub"

    def __init__(self, model: str = "stub") -> None:
        self.model = model

    async def generate(self, *, system_prompt: str | None, user_prompt: str) -> str:
        if _is_classifier_prompt(system_prompt, user_prompt):
            return "technical" if _is_technical_question(user_prompt) else "other"
        snippet = user_prompt.strip().replace("\n", " ")
        if len(snippet) > 80:
            snippet = f"{snippet[:77]}..."
        return f"[stub answer] {snippet}"
