"""Regenerates backend/tests/fixtures/hybrid_eval_vectors.json.

Embeds every chunk of the rulebook fixture corpus and every query in
hybrid_eval.jsonl once with a real embedding model, so the eval harness
(tests/test_hybrid_eval.py) runs offline and deterministically. Rerun only
when the corpus, the chunker, or the query set changes:

    cd backend && python scripts/build_hybrid_eval_vectors.py            # local Ollama, free
    cd backend && python scripts/build_hybrid_eval_vectors.py openai     # needs OPENAI_API_KEY

The default is local Ollama `nomic-embed-text` (free, offline-reproducible).
It expects the `search_document:` / `search_query:` task prefixes.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import sys
from pathlib import Path

import httpx

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.embedding_model import embed_texts, resolve_embedding_model_for  # noqa: E402
from app.knowledge import chunk_id_for, chunk_text  # noqa: E402

FIXTURES = BACKEND / "tests" / "fixtures"
OUT = FIXTURES / "hybrid_eval_vectors.json"


def load_corpus() -> list[tuple[str, str]]:
    """(chunk_id, text) for every rulebook fixture, ids as upload would assign."""
    chunks: list[tuple[str, str]] = []
    for path in sorted((FIXTURES / "rulebooks").glob("*.md")):
        text = path.read_bytes().decode("utf-8")
        content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        for index, piece in enumerate(chunk_text(text)):
            chunks.append((chunk_id_for(content_hash, index), piece))
    return chunks


def load_queries() -> list[str]:
    lines = (FIXTURES / "hybrid_eval.jsonl").read_text(encoding="utf-8").splitlines()
    return [json.loads(ln)["query"] for ln in lines if ln.strip() and not ln.startswith("#")]


OLLAMA_URL = "http://localhost:11434/api/embed"
OLLAMA_MODEL = "nomic-embed-text"


async def embed_ollama(docs: list[str], queries: list[str]) -> list[list[float]]:
    texts = [f"search_document: {t}" for t in docs] + [f"search_query: {q}" for q in queries]
    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.post(OLLAMA_URL, json={"model": OLLAMA_MODEL, "input": texts})
        response.raise_for_status()
        return response.json()["embeddings"]


async def main() -> None:
    provider = sys.argv[1] if len(sys.argv) > 1 else "ollama"
    chunks = load_corpus()
    queries = load_queries()
    if provider == "openai":
        resolution = resolve_embedding_model_for("openai")
        if resolution is None:
            raise SystemExit("OPENAI_API_KEY is not set")
        vectors = await embed_texts(resolution, [t for _, t in chunks] + queries)
        model = f"{resolution.provider}/{resolution.model_id}"
    else:
        vectors = await embed_ollama([t for _, t in chunks], queries)
        model = f"ollama/{OLLAMA_MODEL}"
    rounded = [[round(x, 5) for x in v] for v in vectors]
    payload = {
        "model": model,
        "chunks": {cid: rounded[i] for i, (cid, _) in enumerate(chunks)},
        "queries": {q: rounded[len(chunks) + i] for i, q in enumerate(queries)},
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.name}: {len(chunks)} chunks, {len(queries)} queries, {model}")


if __name__ == "__main__":
    asyncio.run(main())
