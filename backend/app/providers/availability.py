"""Which providers can be reached from where the backend is running.

Ollama runs on the developer's machine. On Vercel ``localhost`` is the
serverless function itself, so Ollama can never be reached there: it is only
offered in local development (``VERCEL`` unset).
"""

from __future__ import annotations

import os

OLLAMA_UNAVAILABLE_MESSAGE = (
    "Ollama is only available in local development; it cannot be reached from Vercel. "
    "Pick another provider or run with Stub."
)


def is_ollama_available() -> bool:
    return not os.environ.get("VERCEL")
