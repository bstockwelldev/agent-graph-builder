"""Builtin tools available to `tool` nodes with no registration required
(studio-consolidation Phase 3, see
docs/planning/features/studio-consolidation-plan.md). Ported from
micro-ui-agent-builder's `lib/server/agent-tools.ts` (`web_search`,
`calculator`) and `lib/server/safe-calculator.ts` (the calculator's
restricted-grammar parser — no `eval`, matching that file's own
constraint).
"""

from __future__ import annotations

from typing import Any

import httpx

BUILTIN_WEB_SEARCH_ID = "web_search"
BUILTIN_CALCULATOR_ID = "calculator"
BUILTIN_TOOL_IDS = (BUILTIN_WEB_SEARCH_ID, BUILTIN_CALCULATOR_ID)

_WEB_SEARCH_TIMEOUT = 12.0
_DUCKDUCKGO_URL = "https://api.duckduckgo.com/"


async def web_search(query: str) -> dict[str, Any]:
    """DuckDuckGo Instant Answer API — no key required, matching MUI's
    `agent-tools.ts` `web_search`. Degrades to an error field on network
    failure rather than raising, since a tool failure should not
    necessarily fail the whole run."""
    try:
        async with httpx.AsyncClient(timeout=_WEB_SEARCH_TIMEOUT) as client:
            response = await client.get(
                _DUCKDUCKGO_URL,
                params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError as exc:
        return {"query": query, "error": f"web_search request failed: {exc}"}

    related_topics = [
        {"text": item.get("Text"), "url": item.get("FirstURL")}
        for item in (payload.get("RelatedTopics") or [])
        if isinstance(item, dict) and item.get("FirstURL")
    ][:5]
    return {
        "query": query,
        "heading": payload.get("Heading") or None,
        "abstract": payload.get("AbstractText") or None,
        "url": payload.get("AbstractURL") or None,
        "relatedTopics": related_topics,
    }


# ---------------------------------------------------------------------------
# calculator — recursive-descent parser, no `eval` (ported restriction from
# safe-calculator.ts). Grammar: digits, `.`, `+ - * / ( )`, unary +/-.
# ---------------------------------------------------------------------------

_ALLOWED_CHARS = set("0123456789.+-*/() \t")


class CalculatorError(ValueError):
    """Raised for any malformed expression or division by zero."""


class _CalculatorParser:
    def __init__(self, text: str) -> None:
        self._text = text
        self._pos = 0

    def parse(self) -> float:
        self._skip_spaces()
        value = self._expr()
        self._skip_spaces()
        if self._pos != len(self._text):
            raise CalculatorError(f"unexpected character {self._text[self._pos]!r} at position {self._pos}")
        return value

    def _peek(self) -> str | None:
        return self._text[self._pos] if self._pos < len(self._text) else None

    def _skip_spaces(self) -> None:
        while self._peek() in (" ", "\t"):
            self._pos += 1

    def _expr(self) -> float:
        value = self._term()
        while True:
            self._skip_spaces()
            op = self._peek()
            if op == "+":
                self._pos += 1
                value += self._term()
            elif op == "-":
                self._pos += 1
                value -= self._term()
            else:
                return value

    def _term(self) -> float:
        value = self._factor()
        while True:
            self._skip_spaces()
            op = self._peek()
            if op == "*":
                self._pos += 1
                value *= self._factor()
            elif op == "/":
                self._pos += 1
                divisor = self._factor()
                if divisor == 0:
                    raise CalculatorError("division by zero")
                value /= divisor
            else:
                return value

    def _factor(self) -> float:
        self._skip_spaces()
        char = self._peek()
        if char == "-":
            self._pos += 1
            return -self._factor()
        if char == "+":
            self._pos += 1
            return self._factor()
        if char == "(":
            self._pos += 1
            value = self._expr()
            self._skip_spaces()
            if self._peek() != ")":
                raise CalculatorError("expected a closing parenthesis")
            self._pos += 1
            return value
        return self._number()

    def _number(self) -> float:
        start = self._pos
        while self._peek() is not None and (self._peek().isdigit() or self._peek() == "."):
            self._pos += 1
        if start == self._pos:
            char = self._peek()
            if char is None:
                raise CalculatorError(f"expected a number at position {self._pos}")
            raise CalculatorError(f"unexpected character {char!r} at position {self._pos}")
        return float(self._text[start : self._pos])


def calculator(expression: str) -> float:
    """Evaluates a restricted arithmetic expression without `eval` — a
    Python port of `safe-calculator.ts`'s grammar and error behavior
    (division-by-zero, unexpected/trailing characters)."""
    if not expression or not expression.strip():
        raise CalculatorError("expression is empty")
    disallowed = set(expression) - _ALLOWED_CHARS
    if disallowed:
        raise CalculatorError(f"expression contains disallowed characters: {''.join(sorted(disallowed))!r}")
    return _CalculatorParser(expression).parse()
