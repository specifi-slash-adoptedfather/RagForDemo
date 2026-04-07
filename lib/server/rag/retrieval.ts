import { getAllChunks, getDb } from "./db";
import { createEmbedding, toFloat32Buffer } from "./http";
import { RetrievedChunk } from "./types";

const STOPWORDS = [
  "这个",
  "那个",
  "请问",
  "一下",
  "可以",
  "怎么",
  "如何",
  "多少",
  "哪些",
  "关于",
  "是否",
  "帮我",
  "告诉我",
];

function parseKeywordJson(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalizeScores<T>(
  items: T[],
  getter: (item: T) => number,
  setter: (item: T, value: number) => void,
) {
  if (items.length === 0) return;
  const values = items.map(getter);
  const min = Math.min(...values);
  const max = Math.max(...values);

  for (const item of items) {
    const raw = getter(item);
    const normalized = max === min ? (raw > 0 ? 1 : 0) : (raw - min) / (max - min);
    setter(item, Number(normalized.toFixed(6)));
  }
}

function extractQueryTokens(question: string) {
  const terms = new Set<string>();
  const normalized = question.replace(/[，。！？、,.!?/\\]/g, " ").trim();
  const phrases = normalized.split(/\s+/).filter(Boolean);

  for (const phrase of phrases) {
    if (phrase.length >= 2 && !STOPWORDS.includes(phrase)) {
      terms.add(phrase);
    }

    if (/[\u4e00-\u9fff]/.test(phrase) && phrase.length >= 4) {
      for (let index = 0; index < phrase.length - 1; index += 1) {
        const bigram = phrase.slice(index, index + 2);
        if (!STOPWORDS.includes(bigram)) {
          terms.add(bigram);
        }
      }
    }
  }

  return [...terms];
}

function lexicalScore(question: string, row: RetrievedChunk, tokens: string[]) {
  let score = 0;
  const title = row.title.toLowerCase();
  const text = row.text.toLowerCase();
  const category = row.category.toLowerCase();
  const source = row.displaySource.toLowerCase();
  const keywords = row.keywords.map((item) => item.toLowerCase());
  const lowerQuestion = question.toLowerCase();

  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    if (title.includes(lowerToken)) score += 4;
    if (keywords.some((keyword) => keyword.includes(lowerToken))) score += 3;
    if (category.includes(lowerToken)) score += 2;
    if (source.includes(lowerToken)) score += 1;
    if (text.includes(lowerToken)) score += 1.5;
  }

  if (text.includes(lowerQuestion)) score += 6;
  if (title.includes(lowerQuestion)) score += 8;

  return score;
}

export async function retrieveByVector(question: string, topK: number) {
  const db = getDb();
  const embedding = await createEmbedding(question);
  const rows = db
    .prepare(
      `
      select
        c.chunk_id as chunkId,
        c.title as title,
        c.category as category,
        c.display_source as displaySource,
        c.text as text,
        c.keywords as keywords,
        v.distance as distance
      from vec_kb_chunks v
      join kb_chunks c on c.chunk_id = v.chunk_id
      where v.embedding match ?
        and k = ?
      order by distance
    `,
    )
    .all(toFloat32Buffer(embedding), topK) as Array<{
      chunkId: string;
      title: string;
      category: string;
      displaySource: string;
      text: string;
      keywords: string;
      distance: number;
    }>;

  const hydrated = rows.map((row) => ({
    ...row,
    keywords: parseKeywordJson(row.keywords),
    vectorScore: Number((1 / (1 + row.distance)).toFixed(6)),
  }));

  normalizeScores(
    hydrated,
    (item) => item.vectorScore || 0,
    (item, value) => {
      item.vectorScore = value;
    },
  );

  return hydrated as RetrievedChunk[];
}

export function retrieveByKeyword(question: string, topK: number) {
  const tokens = extractQueryTokens(question);
  const rows = getAllChunks()
    .map((row) => ({
      ...row,
      keywordScore: lexicalScore(question, row, tokens),
    }))
    .filter((row) => (row.keywordScore || 0) > 0)
    .sort((left, right) => (right.keywordScore || 0) - (left.keywordScore || 0))
    .slice(0, topK);

  normalizeScores(
    rows,
    (item) => item.keywordScore || 0,
    (item, value) => {
      item.keywordScore = value;
    },
  );

  return rows;
}

export function fuseRetrievalResults(
  vectorRows: RetrievedChunk[],
  keywordRows: RetrievedChunk[],
  topK: number,
) {
  const merged = new Map<string, RetrievedChunk>();

  for (const row of vectorRows) {
    merged.set(row.chunkId, { ...row });
  }

  for (const row of keywordRows) {
    const existing = merged.get(row.chunkId);
    merged.set(row.chunkId, {
      ...(existing || row),
      keywordScore: row.keywordScore ?? existing?.keywordScore ?? 0,
      vectorScore: existing?.vectorScore ?? row.vectorScore ?? 0,
      distance: existing?.distance ?? row.distance,
    });
  }

  const fused = [...merged.values()].map((row) => {
    const vectorScore = row.vectorScore || 0;
    const keywordScore = row.keywordScore || 0;
    return {
      ...row,
      fusedScore: Number((vectorScore * 0.65 + keywordScore * 0.35).toFixed(6)),
    };
  });

  return fused
    .sort((left, right) => (right.fusedScore || 0) - (left.fusedScore || 0))
    .slice(0, topK);
}
