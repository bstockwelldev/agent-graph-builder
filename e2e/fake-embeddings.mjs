// Stand-in for the `agb-embed` Supabase Edge Function, so knowledge uploads
// and retrieval work in e2e without a provider key. The API reaches it via
// SUPABASE_EMBEDDINGS_URL (playwright.config.ts); SUPABASE_URL stays unset,
// so graph storage is unaffected.
//
// Same contract as the function: POST {input: string[]} -> {embeddings: number[][]}.
// Vectors are hashed bags of words (384 dims, like gte-small), L2-normalized,
// so texts sharing words score as similar and the results are deterministic.
import { createServer } from "node:http";

const DIMS = 384;
const PORT = Number(process.env.FAKE_EMBEDDINGS_PORT ?? 8123);

function embed(text) {
  const vector = new Array(DIMS).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let hash = 2166136261;
    for (const char of word) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    vector[(hash >>> 0) % DIMS] += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}

createServer((request, response) => {
  if (request.method === "GET") {
    response.writeHead(200).end("ok");
    return;
  }
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    try {
      const { input } = JSON.parse(body);
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ embeddings: input.map(embed) }));
    } catch {
      response.writeHead(400).end();
    }
  });
}).listen(PORT, "127.0.0.1");
