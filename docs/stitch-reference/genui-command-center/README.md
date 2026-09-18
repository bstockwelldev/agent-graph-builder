# GenUI Command Center (Stitch reference)

- **Project:** Agent Console & Terminal (`4397125726045291654`)
- **Screen:** GenUI Command Center (`9acab00c646c4501b38bd6a343bcaf74`)

Files in this folder are **design references** (screenshot + exported HTML from Stitch). The production dashboard is implemented in React under `apps/web/components/studio/dashboard/`.

To refresh assets:

```bash
curl -L -o screenshot.png "<screenshot downloadUrl from Stitch MCP>"
curl -L -o reference.html "<htmlCode downloadUrl from Stitch MCP>"
```

If the HTML URL returns 403, export HTML from the Stitch UI manually.
