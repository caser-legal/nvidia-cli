// Query Rewriter - Self-correction loop for RAG retrieval failures

const REWRITER_ENDPOINT = "" ?? "http://localhost:8000";
const REWRITER_MODEL = "" ?? "nvidia/nemotron-3-nano-30b-a3b";

export async function rewriteQuery(originalQuery: string): Promise<string> {
  try {
    const res = await fetch(REWRITER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: originalQuery, model: REWRITER_MODEL }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[query-rewriter] non-OK status ${res.status}`);
      return originalQuery;
    }

    const json = (await res.json()) as { rewrittenQuery?: string };
    return json.rewrittenQuery ?? originalQuery;
  } catch (err) {
    console.error("[query-rewriter] exception", err);
    return originalQuery;
  }
}

export async function maybeSelfCorrect(originalQuery: string): Promise<string> {
  const rewritten = await rewriteQuery(originalQuery);
  if (rewritten !== originalQuery) {
    console.info("[query-rewriter] rewritten query:", rewritten);
  }
  return rewritten;
}
