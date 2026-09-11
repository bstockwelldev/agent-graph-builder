---
title: Incident RCA — stale index.html after deploy (JS bundle 404)
date: 2026-09-11
status: fixed
severity: P1 (playground production — blank app after deploy)
url: https://agent-graph-builder-poc.vercel.app
deployment: dpl_7ZJCs9cBtD5SgQasNesnwaqfNZJr
bundle: /assets/index-CpT1AGXU.js (stale) vs /assets/index-C7PqBk-K.js (current)
---

# RCA — production blank page after deploy (stale HTML shell)

**Symptom:** After a production deploy, https://agent-graph-builder-poc.vercel.app loads a blank page. Browser network tab shows `GET /assets/index-CpT1AGXU.js` → **404**. API routes (`/api/graphs`, `/api/graphs/validate`) return **200**.

**Outcome:** `Cache-Control` policy added for the SPA shell vs hashed assets (`backend/app/spa_cache.py`, `vercel.json` headers).

---

## Root cause

Browsers cached `index.html` from a prior deployment. After a new deploy:

- `GET /` → **304** (cached HTML shell still references old JS hash `index-CpT1AGXU.js`)
- `GET /assets/index-CpT1AGXU.js` → **404** (file removed in new build)
- `GET /assets/index-C7PqBk-K.js` → **200** on fresh deployment URL

Classic SPA cache mismatch: the HTML shell must revalidate after every deploy; hashed `/assets/*` files are safe to cache immutably.

---

## Fix

| Layer | Change |
| ----- | ------ |
| `backend/app/spa_cache.py` | Middleware sets `no-cache, must-revalidate` on `/`, `/index.html`, and HTML navigation; `immutable` on `/assets/*` |
| `vercel.json` | Matching `headers` for CDN-promoted static files |
| `backend/tests/test_spa_cache.py` | Unit tests for header policy |

---

## Immediate workaround (pre-fix deploy)

Hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`) or clear site data for `agent-graph-builder-poc.vercel.app`.

---

## Verification

After deploy with fix:

1. `GET /` returns `Cache-Control: no-cache, must-revalidate`
2. HTML references current `index-*.js` hash from latest build
3. App loads without manual cache clear on normal refresh
