// Embeds text with Supabase's built-in gte-small model (384-dim, normalized)
// for graph knowledge bases — backend/app/embedding_model.py's "supabase"
// provider. No third-party key: the model runs inside the Edge Runtime.
//
// POST {"input": ["text", ...]} -> {"model": "gte-small", "embeddings": [[...], ...]}
//
// Deployed with verify_jwt, so the gateway has already checked the token's
// signature. On top of that, only the service-role key may call this: the
// anon key ships to browsers, and embedding is billable compute.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MODEL = "gte-small";
// Edge Functions have a per-request CPU budget: ~900-char chunks measured
// 8/request reliably under it, while 12+ intermittently fail with 546
// WORKER_LIMIT. Callers batch at this size and parallelize requests.
const MAX_INPUTS = 8;
const MAX_CHARS = 8000;

const session = new Supabase.ai.Session(MODEL);

function jwtRole(req: Request): string | null {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json).role ?? null;
  } catch {
    return null;
  }
}

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return error(405, "POST only");
  if (jwtRole(req) !== "service_role") return error(403, "service_role key required");

  let input: unknown;
  try {
    ({ input } = await req.json());
  } catch {
    return error(400, "Body must be JSON: {\"input\": [\"text\", ...]}");
  }
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > MAX_INPUTS ||
    !input.every((item) => typeof item === "string" && item.length <= MAX_CHARS)
  ) {
    return error(400, `input must be 1-${MAX_INPUTS} strings of at most ${MAX_CHARS} chars`);
  }

  const embeddings: number[][] = [];
  for (const text of input as string[]) {
    const vector = (await session.run(text, { mean_pool: true, normalize: true })) as number[];
    embeddings.push(Array.from(vector));
  }
  return Response.json({ model: MODEL, embeddings });
});
