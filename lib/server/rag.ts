import dotenv from "dotenv";
import path from "node:path";

import {
  findProductCandidates,
  getProductChunks,
  getProductFamily,
  isProductIntent,
  rankProductChunks,
  tryAnswerWithDomainRules,
} from "./rag/domain-rules";
import {
  buildLlmRequest,
  buildSources,
  generateAnswer,
  generateAnswerFromRequest,
  generateProductDecisionAnswer,
} from "./rag/generation";
import { rerankChunks } from "./rag/rerank";
import { buildRetrievalPlan } from "./rag/routing";
import { fuseRetrievalResults, retrieveByKeyword, retrieveByVector } from "./rag/retrieval";
import { RagTraceRecorder } from "./rag/trace";

dotenv.config({ path: path.join(process.cwd(), ".env"), override: true });

function pickTop3<T>(rows: T[]) {
  return rows.slice(0, 3);
}

function nowMs() {
  return Date.now();
}

async function answerWithProductPipeline(question: string, recorder: RagTraceRecorder) {
  const totalStart = nowMs();
  const plan = buildRetrievalPlan(question);
  recorder.recordRoute("product_pipeline", plan);

  const productMatchStart = nowMs();
  const candidates = findProductCandidates(question);
  const productMatchMs = nowMs() - productMatchStart;
  if (candidates.length === 0) {
    return answerWithRetrievalPlan(question, recorder);
  }

  const productRankStart = nowMs();
  const familyChunks = getProductChunks(getProductFamily(candidates[0].chunkId));
  const rankedChunks = rankProductChunks(question, familyChunks).slice(0, 8);
  const productRankMs = nowMs() - productRankStart;

  recorder.recordFusion({
    source: "product_chunk_ranker",
    rows: rankedChunks,
  });

  const rerankStart = nowMs();
  const rerankResult = plan.useRerank
    ? await rerankChunks(question, rankedChunks)
    : { provider: "disabled", rows: rankedChunks, settingsEnabled: false };
  const rerankMs = nowMs() - rerankStart;
  recorder.recordRerank(rerankResult);

  const selected = pickTop3(rerankResult.rows);
  const useDecisionPrompt =
    question.includes("适合") ||
    question.includes("合适") ||
    question.includes("徒步") ||
    question.includes("露营") ||
    question.includes("登山") ||
    question.includes("旅行");

  const llmRequest = buildLlmRequest(question, selected);
  recorder.recordLlmRequest({
    selectedChunkIds: selected.map((item) => item.chunkId),
    request: useDecisionPrompt ? "product_decision_prompt" : llmRequest,
  });

  const llmStart = nowMs();
  const answer = useDecisionPrompt
    ? await generateProductDecisionAnswer(question, selected)
    : await generateAnswerFromRequest(llmRequest);
  const llmMs = nowMs() - llmStart;
  recorder.recordLlmResponse({ answer });

  recorder.recordTiming({
    product_match_ms: productMatchMs,
    product_rank_ms: productRankMs,
    rerank_ms: rerankMs,
    llm_ms: llmMs,
    total_ms: nowMs() - totalStart,
  });

  return {
    answer,
    sources: buildSources(selected),
  };
}

async function answerWithRetrievalPlan(question: string, recorder: RagTraceRecorder) {
  const totalStart = nowMs();
  const plan = buildRetrievalPlan(question);
  recorder.recordRoute("retrieval_pipeline", plan);

  if (plan.complexity === "simple") {
    const vectorStart = nowMs();
    const vectorRows = await retrieveByVector(question, plan.recallSize);
    const vectorMs = nowMs() - vectorStart;
    recorder.recordVectorSearch({
      topK: plan.recallSize,
      mode: "vector_only",
      rows: vectorRows,
    });

    const selected = pickTop3(vectorRows);
    const llmRequest = buildLlmRequest(question, selected);
    recorder.recordLlmRequest({
      selectedChunkIds: selected.map((item) => item.chunkId),
      request: llmRequest,
    });

    const llmStart = nowMs();
    const answer = await generateAnswer(question, selected);
    const llmMs = nowMs() - llmStart;
    recorder.recordLlmResponse({ answer });
    recorder.recordTiming({
      vector_search_ms: vectorMs,
      llm_ms: llmMs,
      total_ms: nowMs() - totalStart,
    });

    return {
      answer,
      sources: buildSources(selected),
    };
  }

  const vectorStart = nowMs();
  const [vectorRows, keywordRows] = await Promise.all([
    retrieveByVector(question, plan.recallSize),
    Promise.resolve(retrieveByKeyword(question, plan.recallSize)),
  ]);
  const vectorKeywordMs = nowMs() - vectorStart;

  recorder.recordVectorSearch({
    topK: plan.recallSize,
    mode: "hybrid",
    rows: vectorRows,
  });
  recorder.recordKeywordSearch({
    topK: plan.recallSize,
    rows: keywordRows,
  });

  const fusionStart = nowMs();
  const fusedRows = plan.useFusion
    ? fuseRetrievalResults(vectorRows, keywordRows, plan.recallSize)
    : vectorRows;
  const fusionMs = nowMs() - fusionStart;
  recorder.recordFusion({ rows: fusedRows });

  const rerankStart = nowMs();
  const rerankResult = plan.useRerank
    ? await rerankChunks(question, fusedRows)
    : { provider: "disabled", rows: fusedRows, settingsEnabled: false };
  const rerankMs = nowMs() - rerankStart;
  recorder.recordRerank(rerankResult);

  const selected = pickTop3(rerankResult.rows);
  const llmRequest = buildLlmRequest(question, selected);
  recorder.recordLlmRequest({
    selectedChunkIds: selected.map((item) => item.chunkId),
    request: llmRequest,
  });

  const llmStart = nowMs();
  const answer = await generateAnswer(question, selected);
  const llmMs = nowMs() - llmStart;
  recorder.recordLlmResponse({ answer });
  recorder.recordTiming({
    vector_keyword_search_ms: vectorKeywordMs,
    fusion_ms: fusionMs,
    rerank_ms: rerankMs,
    llm_ms: llmMs,
    total_ms: nowMs() - totalStart,
  });

  return {
    answer,
    sources: buildSources(selected),
  };
}

export async function answerQuestion(question: string) {
  const totalStart = nowMs();
  const recorder = new RagTraceRecorder(question);

  try {
    const domainAnswer = await tryAnswerWithDomainRules(question);
    if (domainAnswer) {
      recorder.recordRoute("domain_rule", null);
      recorder.recordDomainAnswer("domain_rule", domainAnswer);
      const payload = {
        ...domainAnswer,
        traceId: recorder.traceId,
      };
      recorder.recordTiming({
        total_ms: nowMs() - totalStart,
      });
      recorder.complete(payload);
      return payload;
    }

    const payload = isProductIntent(question)
      ? await answerWithProductPipeline(question, recorder)
      : await answerWithRetrievalPlan(question, recorder);
    const tracedPayload = {
      ...payload,
      traceId: recorder.traceId,
    };
    recorder.complete(tracedPayload);
    return tracedPayload;
  } catch (error) {
    recorder.fail(error);
    throw error;
  }
}
