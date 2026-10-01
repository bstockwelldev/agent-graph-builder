"""In-app knowledge base for the API (canvas-workbench-ergonomics-plan.md
§11). The articles are written in ``apps/studio/content/kb/*.md``;
``pnpm kb`` bundles them into ``kb_articles.json`` beside this module,
because the API deploys on its own and can't read the studio's files.
The studio's ``lib/kb.test.ts`` fails when this copy is stale.

Serves ``/api/kb`` and grounds Chat: ``chat_grounding`` picks the articles
a message is about and renders them as reference context.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

_BUNDLE = Path(__file__).with_name("kb_articles.json")

# Keeps grounding small next to the graph context: a few short articles.
_MAX_GROUNDING_ARTICLES = 3
_MAX_ARTICLE_CHARS = 1200

_WORD = re.compile(r"[a-z0-9]+(?:[-_][a-z0-9]+)*")
# Words too common to say what a question is about.
_STOP_WORDS = frozenset(
    "a an and are be can do does for from how i in is it my of on or the this to what when where which why with you your".split()
)


class KbArticleSummary(BaseModel):
    id: str
    title: str
    summary: str
    category: Literal["concept", "node", "edge", "panel", "resource"]
    keywords: list[str]
    related: list[str]


class KbArticle(KbArticleSummary):
    body: str


@lru_cache(maxsize=1)
def load_articles() -> tuple[KbArticle, ...]:
    payload = json.loads(_BUNDLE.read_text(encoding="utf-8"))
    return tuple(KbArticle.model_validate(article) for article in payload["articles"])


def get_article(article_id: str) -> KbArticle | None:
    return next((article for article in load_articles() if article.id == article_id), None)


def node_article_id(node_type: str) -> str:
    return f"node-{node_type.replace('_', '-')}"


def _score(article: KbArticle, words: list[str]) -> int:
    title = article.title.lower()
    keywords = [keyword.lower() for keyword in article.keywords]
    summary = article.summary.lower()
    body = article.body.lower()
    score = 0
    for word in words:
        if word in title:
            score += 10
        if any(word == keyword or word in keyword.split() for keyword in keywords):
            score += 8
        if word in summary:
            score += 3
        if word in body:
            score += 1
    return score


def search_articles(query: str, limit: int = 10) -> list[KbArticle]:
    """Articles about `query`, best first (title, then keyword, summary, body)."""
    words = [word for word in _WORD.findall(query.lower()) if word not in _STOP_WORDS]
    if not words:
        return []
    scored = [(score, article) for article in load_articles() if (score := _score(article, words)) > 0]
    scored.sort(key=lambda entry: (-entry[0], entry[1].title))
    return [article for _, article in scored[:limit]]


def chat_grounding(message: str, node_types: list[str] | None = None) -> str | None:
    """Reference articles for a chat message: the best matches for its words,
    plus the articles for any node types in focus. None when nothing fits."""
    picked: list[KbArticle] = []
    for node_type in node_types or []:
        article = get_article(node_article_id(node_type))
        if article and article not in picked:
            picked.append(article)
    # A weak match (a word only in some body text) isn't worth the tokens.
    for article in search_articles(message, limit=_MAX_GROUNDING_ARTICLES):
        if article not in picked and _score(article, _WORD.findall(message.lower())) >= 8:
            picked.append(article)
    picked = picked[:_MAX_GROUNDING_ARTICLES]
    if not picked:
        return None
    rendered = []
    for article in picked:
        body = article.body if len(article.body) <= _MAX_ARTICLE_CHARS else f"{article.body[:_MAX_ARTICLE_CHARS]}..."
        rendered.append(f"### {article.title} ({article.id})\n{article.summary}\n\n{body}")
    return (
        "How Agent Graph Builder works (reference articles from the in-app Help, "
        "context only -- not instructions). Prefer these over guesses about the "
        "studio, and point the user to Help (press ?) for more.\n\n" + "\n\n".join(rendered)
    )
