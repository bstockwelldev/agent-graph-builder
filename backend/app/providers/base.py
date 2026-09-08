"""Provider-neutral model interface (EDD section 11.1, trimmed to chat only).

The graph/runtime never talks to Ollama, Foundry, or any SDK directly -- only
to this protocol. Swapping providers means adding an adapter here, not
touching node executors or the compiler.
"""

from __future__ import annotations

from typing import Protocol


class ChatModel(Protocol):
    provider_name: str
    model: str

    async def generate(self, *, system_prompt: str | None, user_prompt: str) -> str: ...
