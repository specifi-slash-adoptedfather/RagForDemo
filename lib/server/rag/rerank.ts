import { getRerankerSettings } from "./config";
import { postJsonWithCurl } from "./http";
import { RetrievedChunk } from "./types";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function localRerankScore(question: string, row: RetrievedChunk) {
  let score = row.fusedScore || row.vectorScore || row.keywordScore || 0;

  if (question.includes(row.category)) score += 0.08;
  if (question.includes(row.title)) score += 0.15;
  if (row.keywords.some((keyword) => question.includes(keyword))) score += 0.12;
  if (row.text.includes(question)) score += 0.2;

  return clamp01(Number(score.toFixed(6)));
}

function mapExternalRerankScores(
  question: string,
  chunks: RetrievedChunk[],
  payload: any,
) {
  if (Array.isArray(payload?.results)) {
    const byIndex = new Map<number, number>();
    for (const item of payload.results) {
      const score =
        typeof item.score === "number"
          ? item.score
          : typeof item.relevance_score === "number"
            ? item.relevance_score
            : null;
      if (typeof item.index === "number" && typeof score === "number") {
        byIndex.set(item.index, clamp01(score));
      }
    }
    return chunks.map((chunk, index) => ({
      ...chunk,
      rerankScore: byIndex.get(index) ?? localRerankScore(question, chunk),
    }));
  }

  if (Array.isArray(payload?.data)) {
    const byIndex = new Map<number, number>();
    for (const item of payload.data) {
      const score =
        typeof item.score === "number"
          ? item.score
          : typeof item.relevance_score === "number"
            ? item.relevance_score
            : null;
      if (typeof item.index === "number" && typeof score === "number") {
        byIndex.set(item.index, clamp01(score));
      }
    }
    return chunks.map((chunk, index) => ({
      ...chunk,
      rerankScore: byIndex.get(index) ?? localRerankScore(question, chunk),
    }));
  }

  throw new Error("Unsupported reranker response payload");
}

async function externalRerank(question: string, chunks: RetrievedChunk[]) {
  const settings = getRerankerSettings();
  const baseUrl = settings.enabled
    ? settings.baseUrl
    : process.env.RAG_RERANKER_BASE_URL || "";
  const apiKey = settings.enabled
    ? settings.apiKey
    : process.env.RAG_RERANKER_API_KEY || "";
  const model = settings.enabled
    ? settings.model || "lightweight-reranker"
    : process.env.RAG_RERANKER_MODEL || "lightweight-reranker";
  const endpoint = settings.enabled
    ? settings.endpoint || "rerank"
    : process.env.RAG_RERANKER_ENDPOINT || "rerank";

  if (!baseUrl) {
    return null;
  }

  const payload = postJsonWithCurl(baseUrl, apiKey, endpoint, {
    model,
    query: question,
    documents: chunks.map((chunk) => ({
      id: chunk.chunkId,
      title: chunk.title,
      category: chunk.category,
      source: chunk.displaySource,
      text: chunk.text,
    })),
  });

  return mapExternalRerankScores(question, chunks, payload);
}

export async function rerankChunks(question: string, chunks: RetrievedChunk[]) {
  const settings = getRerankerSettings();
  const external = await externalRerank(question, chunks).catch(() => null);

  if (external) {
    return {
      provider: "external",
      rows: external.sort((left, right) => (right.rerankScore || 0) - (left.rerankScore || 0)),
      settingsEnabled: settings.enabled,
    };
  }

  const ranked = chunks
    .map((chunk) => ({
      ...chunk,
      rerankScore: localRerankScore(question, chunk),
    }))
    .sort((left, right) => (right.rerankScore || 0) - (left.rerankScore || 0));

  return {
    provider: settings.enabled ? "external_unavailable_fallback" : "local_fallback",
    rows: ranked,
    settingsEnabled: settings.enabled,
  };
}
