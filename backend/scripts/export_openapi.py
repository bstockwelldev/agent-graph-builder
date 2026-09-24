"""Write the API's OpenAPI contract for the SDK (SDK 3/7, STO-616).

    cd backend && uv run python -m scripts.export_openapi [--check]

Writes `packages/agent-graph-sdk/contract/openapi.json`; with `--check`,
exits non-zero instead when the committed file is stale.
"""

from __future__ import annotations

import sys

from app.api_contract import CONTRACT_PATH, render_contract


def main(argv: list[str]) -> int:
    rendered = render_contract()
    current = CONTRACT_PATH.read_text() if CONTRACT_PATH.exists() else ""
    if "--check" in argv:
        if current != rendered:
            print(f"{CONTRACT_PATH} is stale; run: uv run python -m scripts.export_openapi")
            return 1
        print("openapi.json is up to date")
        return 0
    CONTRACT_PATH.write_text(rendered)
    print(f"wrote {CONTRACT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
