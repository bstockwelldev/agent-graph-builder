# Stitch reference (project `4397125726045291654`)

> Ported verbatim from `micro-ui-agent-builder` (studio-consolidation Phase
> 6) as frozen historical design reference for the "Synthesis Dark" system
> `apps/studio` inherited. Deliberately **not** renamed ("Flow"→"Graph",
> `apps/web`→`apps/studio`) — the screenIds, project id, and filenames below
> are Stitch's own identifiers and Google-hosted download URLs; renaming
> them would break traceability back to the actual Stitch project without
> changing anything real. The "Authenticated download" workflow below
> depends on `scripts/stitch-download-screen.mjs` and the `@google/stitch-sdk`
> dependency, which stay in the archived `micro-ui-agent-builder` repo, not
> ported here — this material is a frozen snapshot, not a live regeneration
> pipeline this repo needs.

Screenshots and HTML exports for **Synthesis Dark** / Neural Architect mocks. Refresh URLs via Stitch MCP `list_screens` if downloads expire.

- `screenshots/` — PNG references (curl-friendly `lh3.googleusercontent.com` URLs).
- `html/` — static HTML from Stitch (`contribution.usercontent.google.com`); reference only, not shipped.
- `design-tokens.json` — color + spacing metadata for Figma Variables / Tokens Studio import.
- `figma-code-connect-hints.json` — suggested Code Connect targets for shadcn components in `apps/web`.

Signed HTML links may return 403 in some environments; re-export from Stitch if needed.

## Advanced Flow Builder (Canvas)

| Field | Value |
|--------|--------|
| **screenId** | `aab0d9e6ec59425eb3f5b00013481a04` |
| **projectId** | `4397125726045291654` |
| **Output slug** | `advanced-flow-builder` → `screenshots/advanced-flow-builder.png`, `html/advanced-flow-builder.html` |

### Authenticated download (repo script)

Requires `STITCH_API_KEY` in the environment ([`@google/stitch-sdk`](https://www.npmjs.com/package/@google/stitch-sdk)).

```bash
# PowerShell
$env:STITCH_API_KEY = "your-key"
pnpm stitch:download-screen

# Or explicit IDs / slug:
node scripts/stitch-download-screen.mjs 4397125726045291654 aab0d9e6ec59425eb3f5b00013481a04 advanced-flow-builder
```

On success this updates `screens-manifest.json` (paths + metadata only; signed URLs are printed to stdout, not committed).

## Agents Studio & Editor

| Field | Value |
|--------|--------|
| **screenId** | `511eaac17bfc4336bf9f4fb1f6358ad4` |
| **projectId** | `4397125726045291654` |
| **Output slug** | `agents-studio` → `screenshots/agents-studio.png`, `html/agents-studio.html` |

```bash
node scripts/stitch-download-screen.mjs 4397125726045291654 511eaac17bfc4336bf9f4fb1f6358ad4 agents-studio "Agents Studio & Editor"
```

### curl (after Stitch MCP `get_screen`)

Call `get_screen` for `projects/4397125726045291654/screens/aab0d9e6ec59425eb3f5b00013481a04`, then:

```bash
curl -L -o docs/stitch-reference/screenshots/advanced-flow-builder.png "PASTE_screenshot.downloadUrl"
curl -L -o docs/stitch-reference/html/advanced-flow-builder.html "PASTE_htmlCode.downloadUrl"
```

HTML may still return **403** without the same Google session as Stitch; use a logged-in browser save-as if needed.

For Agents Studio, call `get_screen` on `projects/4397125726045291654/screens/511eaac17bfc4336bf9f4fb1f6358ad4`, then paste URLs into the same `curl -L` pattern with `agents-studio` filenames.

`screens-manifest.json` lists known screens and paths; refresh it by running `stitch-download-screen.mjs` (requires `STITCH_API_KEY`). Stitch MCP batch tools such as `edit_screens` depend on your Cursor MCP configuration.
