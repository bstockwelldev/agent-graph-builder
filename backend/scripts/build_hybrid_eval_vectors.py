"""Regenerates <eval dir>/hybrid_eval_vectors.json.

Embeds every chunk of an eval set's rulebook corpus and every query in its
hybrid_eval.jsonl once with a real embedding model, so the eval harness
(tests/test_hybrid_eval.py) runs offline and deterministically. Rerun only
when the corpus, the chunker, or the query set changes:

    cd backend
    python scripts/build_hybrid_eval_vectors.py                    # public set, local Ollama
    python scripts/build_hybrid_eval_vectors.py --dir <path>       # another eval dir
    python scripts/build_hybrid_eval_vectors.py --provider openai  # needs OPENAI_API_KEY

An eval dir holds ``rulebooks/*.md``, ``hybrid_eval.jsonl`` and the vectors file.
The default is the committed synthetic set under tests/fixtures/hybrid_eval/.
Pass ``--dir`` (or set HYBRID_EVAL_DIR for the tests) to use a private set that
must never be committed.

The default provider is local Ollama `nomic-embed-text` (free, offline). It
expects the `search_document:` / `search_query:` task prefixes.
"""

from __future__ import annotations

import argparse
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

PUBLIC_EVAL_DIR = BACKEND / "tests" / "fixtures" / "hybrid_eval"
VECTORS_FILE = "hybrid_eval_vectors.json"
OLLAMA_URL = "http://localhost:11434/api/embed"
OLLAMA_MODEL = "nomic-embed-text"


def load_corpus(eval_dir: Path) -> list[tuple[str, str]]:
    """(chunk_id, text) for every rulebook in the set, ids as upload would assign."""
    chunks: list[tuple[str, str]] = []
    for path in sorted((eval_dir / "rulebooks").glob("*.md")):
        text = path.read_bytes().decode("utf-8")
        content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        for index, piece in enumerate(chunk_text(text)):
            chunks.append((chunk_id_for(content_hash, index), piece))
    return chunks


def load_eval_queries(eval_dir: Path) -> list[dict]:
    """Labeled queries; ``#`` lines are header comments."""
    lines = (eval_dir / "hybrid_eval.jsonl").read_text(encoding="utf-8").splitlines()
    return [json.loads(ln) for ln in lines if ln.strip() and not ln.startswith("#")]


async def embed_ollama(docs: list[str], queries: list[str]) -> list[list[float]]:
    texts = [f"search_document: {t}" for t in docs] + [f"search_query: {q}" for q in queries]
    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.post(OLLAMA_URL, json={"model": OLLAMA_MODEL, "input": texts})
        response.raise_for_status()
        return response.json()["embeddings"]


async def main(eval_dir: Path, provider: str) -> None:
    chunks = load_corpus(eval_dir)
    queries = [q["query"] for q in load_eval_queries(eval_dir)]
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
    out = eval_dir / VECTORS_FILE
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out}: {len(chunks)} chunks, {len(queries)} queries, {model}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dir", type=Path, default=PUBLIC_EVAL_DIR)
    parser.add_argument("--provider", choices=("ollama", "openai"), default="ollama")
    args = parser.parse_args()
    asyncio.run(main(args.dir.resolve(), args.provider))
