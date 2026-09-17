import path from "node:path";

import type { NextConfig } from "next";

// Mirrors apps/playground/vite.config.ts's dev proxy: the SDK client's
// default baseUrl ("") issues same-origin /api/* requests, and this rewrite
// forwards them to the FastAPI backend in dev. In production both apps
// deploy as Vercel Python functions alongside the frontend, so /api/* is
// already same-origin and this rewrite is a no-op there.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  turbopack: {
    // Monorepo lives here; avoids picking a parent-folder lockfile as workspace root.
    root: path.join(__dirname, "..", ".."),
  },
  experimental: {
    // Vercel's `services` config (studio + backend deployed together) does
    // not support Edge Function output, so middleware must run on Node.js.
    // Supported at runtime in Next.js 15.5, but missing from this version's
    // type declarations.
    // @ts-expect-error -- nodeMiddleware is valid, see comment above
    nodeMiddleware: true,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` }];
  },
};

export default nextConfig;
