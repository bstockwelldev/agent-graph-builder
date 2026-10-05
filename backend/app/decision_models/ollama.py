"""Ollama decision backend -- local, private, no per-token charge.

Uses Ollama's OpenAI-compatible endpoint (/v1/chat/completions) with
`response_format: json_schema` so the output shape is enforced by constrained
decoding, not by asking nicely. Temperature 0.

Conventions mirror `providers/ollama.py`: httpx directly (no heavy SDK),
OLLAMA_BASE_URL env, generous timeout.
"""

from __future__ import annotations

import os
import time
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .base import (
    DecisionModel,
    DecisionResult,
    DecisionSchema,
    DecisionSchemaError,
    build_result,
)

T = TypeVar("T", bound=DecisionSchema)

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")


def strict_json_schema(schema_cls: type[BaseModel]) -> dict[str, Any]:
    """Pydantic JSON schema hardened for constrained decoding.

    Sets additionalProperties: false on every object node (required by strict
    structured-output endpoints) and keeps $defs intact.
    """
    raw: dict[str, Any] = schema_cls.model_json_schema()

    def _harden(node: Any) -> Any:
        if isinstance(node, dict):
            if node.get("type") == "object":
                node = {**node, "additionalProperties": False}
            return {k: _harden(v) for k, v in node.items()}
        if isinstance(node, list):
            return [_harden(v) for v in node]
        return node

    return _harden(raw)


class OllamaDecisionModel:
    provider_name = "ollama"

    def __init__(
        self,
        model: str = "qwen3:8b",
        *,
        base_url: str = OLLAMA_BASE_URL,
        timeout: float = 180.0,
    ) -> None:
        self.model = model
        self.base_url = base_url
        self.timeout = timeout

    async def _complete(
        self,
        *,
        system_prompt: str | None,
        user_prompt: str,
        history: list[dict[str, str]] | None,
        json_schema: dict[str, Any],
    ) -> str:
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": user_prompt})

        async with httpx.AsyncClient(
            base_url=self.base_url, timeout=self.timeout
        ) as client:
            response = await client.post(
                "/v1/chat/completions",
                json={
                    "model": self.model,
                    "temperature": 0,
                    "messages": messages,
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": json_schema,
                    },
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"] or ""

    async def decide(
        self,
        *,
        system_prompt: str | None,
        user_prompt: str,
        schema: type[T],
        abstain_values: set[str] | frozenset[str] | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> DecisionResult:
        json_schema = {
            "name": schema.__name__.lower(),
            "strict": True,
            "schema": strict_json_schema(schema),
        }
        attempts = 0
        last_error = ""
        started = time.perf_counter()
        current_user_prompt = user_prompt
        current_history = history
        while attempts < 2:
            attempts += 1
            raw = await self._complete(
                system_prompt=system_prompt,
                user_prompt=current_user_prompt,
                history=current_history,
                json_schema=json_schema,
            )
            try:
                payload = schema.model_validate_json(raw)
                return build_result(
                    payload=payload,
                    provider_name=self.provider_name,
                    model=self.model,
                    latency_ms=(time.perf_counter() - started) * 1000.0,
                    attempts=attempts,
                    raw=raw,
                    abstain_values=abstain_values,
                )
            except (ValidationError, ValueError) as exc:
                last_error = str(exc)[:500]
                # One repair retry: show the failure, demand valid JSON only.
                current_history = (history or []) + [
                    {"role": "user", "content": user_prompt},
                    {"role": "assistant", "content": raw},
                ]
                current_user_prompt = (
                    "Your previous response failed validation:\n"
                    f"{last_error}\n"
                    "Return ONLY a JSON object matching the schema. No prose."
                )
        raise DecisionSchemaError(
            f"ollama/{self.model} failed schema validation after "
            f"{attempts} attempts: {last_error}"
        )
