"""Studio-consolidation Phase 3: builtin tools (web_search, calculator).

See docs/planning/features/studio-consolidation-plan.md.
"""

from __future__ import annotations

import pytest

from app.builtin_tools import CalculatorError, calculator, web_search


def test_calculator_basic_arithmetic() -> None:
    assert calculator("2 + 3 * 4") == 14
    assert calculator("(2 + 3) * 4") == 20
    assert calculator("10 / 4") == 2.5
    assert calculator("-5 + 2") == -3
    assert calculator("3.5 + 1.5") == 5.0


def test_calculator_division_by_zero_raises() -> None:
    with pytest.raises(CalculatorError, match="division by zero"):
        calculator("1 / 0")


def test_calculator_rejects_disallowed_characters() -> None:
    with pytest.raises(CalculatorError, match="disallowed characters"):
        calculator("__import__('os')")


def test_calculator_rejects_trailing_garbage() -> None:
    with pytest.raises(CalculatorError, match="unexpected character"):
        calculator("2 + 2 2")


def test_calculator_rejects_unbalanced_parens() -> None:
    with pytest.raises(CalculatorError, match="closing parenthesis"):
        calculator("(2 + 3")


def test_calculator_rejects_empty_expression() -> None:
    with pytest.raises(CalculatorError, match="empty"):
        calculator("   ")


def test_calculator_never_uses_eval(monkeypatch) -> None:
    # A blunt but direct regression guard: eval must never be called by
    # this module, even indirectly, matching safe-calculator.ts's own
    # no-eval constraint.
    import builtins

    def _forbidden(*_args, **_kwargs):
        raise AssertionError("calculator() must never call eval()")

    monkeypatch.setattr(builtins, "eval", _forbidden)
    assert calculator("2 + 2") == 4


@pytest.mark.asyncio
async def test_web_search_parses_instant_answer(httpx_mock) -> None:
    httpx_mock.add_response(
        url="https://api.duckduckgo.com/?q=kubernetes&format=json&no_html=1&skip_disambig=1",
        json={
            "Heading": "Kubernetes",
            "AbstractText": "An open-source container orchestration system.",
            "AbstractURL": "https://en.wikipedia.org/wiki/Kubernetes",
            "RelatedTopics": [
                {"Text": "Docker", "FirstURL": "https://en.wikipedia.org/wiki/Docker_(software)"},
                {"Name": "no url here"},
            ],
        },
    )

    result = await web_search("kubernetes")

    assert result["heading"] == "Kubernetes"
    assert result["abstract"].startswith("An open-source")
    assert result["url"] == "https://en.wikipedia.org/wiki/Kubernetes"
    assert result["relatedTopics"] == [
        {"text": "Docker", "url": "https://en.wikipedia.org/wiki/Docker_(software)"}
    ]


@pytest.mark.asyncio
async def test_web_search_degrades_on_http_error(httpx_mock) -> None:
    httpx_mock.add_response(status_code=503)

    result = await web_search("anything")

    assert result["query"] == "anything"
    assert "error" in result
