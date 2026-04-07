import { postJsonWithCurl } from "./http";
import { AnswerPayload, RetrievedChunk, SourceCard } from "./types";

const KB_FRAGMENT = "knowledge_fragment";

export function buildSources(rows: RetrievedChunk[]): SourceCard[] {
  return rows.map((row) => ({
    id: row.chunkId,
    title: row.title,
    section: `${row.category} | ${row.displaySource || KB_FRAGMENT}`,
    excerpt: row.text,
  }));
}

export function formatCustomerAnswer(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function fallbackSceneDecision(question: string, chunks: RetrievedChunk[]) {
  const combined = chunks.map((chunk) => chunk.text).join("\n");
  const mentionsExtreme =
    question.includes("太行山") ||
    question.includes("高海拔") ||
    question.includes("两天一夜") ||
    question.includes("露营") ||
    question.includes("登山");
  const hasLightweight = combined.includes("轻量") || combined.includes("轻薄");
  const hasWindproof = combined.includes("防风");
  const hasSplash = combined.includes("防泼水");
  const hasWarmthLimit =
    combined.includes("不属于厚重保暖型外套") ||
    combined.includes("不是极寒保暖外套") ||
    combined.includes("不建议把它当核心功能外套");

  if (mentionsExtreme && hasWarmthLimit) {
    return "不太适合。它更偏轻量、防风、防泼水的外层，适合春秋短途徒步或轻户外使用，但不属于极寒保暖型外套。像太行山两天一夜徒步这种场景，往往会遇到更明显的温差、风力或复杂天气，如果只穿这一件，保暖冗余不足。更建议把它作为外层，再叠加抓绒、保暖中层，或者直接选择保暖等级更强的徒步外套。";
  }

  if (hasLightweight && hasWindproof && hasSplash) {
    return "有条件适合。它本身具备轻量、防风和防泼水的特点，适合春秋季短途徒步、轻露营和旅行外层使用。前提是温度不要太低、天气不要持续暴雨，并且最好搭配抓绒或卫衣做叠穿；如果行程环境更冷、更高海拔或风雨更大，就需要更强的保暖外套。";
  }

  return `根据当前商品资料，${chunks[0]?.title.split(" | ")[0] || "这款商品"}更适合轻户外和普通通勤场景。如果你的行程温差较大、风力较强，建议把它作为外层叠穿，而不要单独作为核心保暖装备。`;
}

export function buildLlmRequest(question: string, chunks: RetrievedChunk[]) {
  const context = chunks
    .map(
      (chunk, index) =>
        `[Context ${index + 1}]
Title: ${chunk.title}
Category: ${chunk.category}
Source: ${chunk.displaySource}
VectorScore: ${chunk.vectorScore ?? 0}
KeywordScore: ${chunk.keywordScore ?? 0}
FusedScore: ${chunk.fusedScore ?? 0}
RerankScore: ${chunk.rerankScore ?? 0}
Content: ${chunk.text}`,
    )
    .join("\n\n");

  return {
    model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You are an ecommerce customer service assistant. Answer directly with the conclusion first, then the necessary explanation. Do not mention retrieval, embeddings, reranking, or context numbering.",
      },
      {
        role: "user",
        content: `User question: ${question}\n\nAnswer only from the following materials:\n\n${context}`,
      },
    ],
  };
}

export function buildProductDecisionRequest(question: string, chunks: RetrievedChunk[]) {
  const context = chunks
    .map(
      (chunk, index) =>
        `[Context ${index + 1}]
Title: ${chunk.title}
Category: ${chunk.category}
Source: ${chunk.displaySource}
Content: ${chunk.text}`,
    )
    .join("\n\n");

  return {
    model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "你是电商客服。对于用户询问某个商品在某个场景下是否合适时，必须先明确给出结论：适合、有条件适合、或不太适合。然后解释 2 到 4 句，优先使用场景、保暖、防风、防泼水、叠穿和使用边界这些信息。不允许回答模糊空话。",
      },
      {
        role: "user",
        content: `用户问题：${question}\n\n请仅根据以下商品资料直接判断是否合适，并说明原因：\n\n${context}`,
      },
    ],
  };
}

export async function generateAnswerFromRequest(requestPayload: unknown) {
  const payload = postJsonWithCurl(
    process.env.OPENAI_CHAT_BASE_URL || "",
    process.env.OPENAI_CHAT_API_KEY || "",
    "chat/completions",
    requestPayload,
  );

  return formatCustomerAnswer(
    payload.choices?.[0]?.message?.content?.trim() || "No clearer answer is available right now.",
  );
}

export async function generateProductDecisionAnswer(question: string, chunks: RetrievedChunk[]) {
  const requestPayload = buildProductDecisionRequest(question, chunks);
  const payload = postJsonWithCurl(
    process.env.OPENAI_CHAT_BASE_URL || "",
    process.env.OPENAI_CHAT_API_KEY || "",
    "chat/completions",
    requestPayload,
  );

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (content) {
    return formatCustomerAnswer(content);
  }

  return fallbackSceneDecision(question, chunks);
}

export async function generateAnswer(question: string, chunks: RetrievedChunk[]) {
  const requestPayload = buildLlmRequest(question, chunks);
  return generateAnswerFromRequest(requestPayload);
}

export async function generateAnswerPayload(
  question: string,
  chunks: RetrievedChunk[],
): Promise<AnswerPayload> {
  const selected = chunks.slice(0, 3);
  const answer = await generateAnswer(question, selected);
  return {
    answer,
    sources: buildSources(selected),
  };
}
