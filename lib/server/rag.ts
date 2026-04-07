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

async function answerWithProductPipeline(question: string, recorder: RagTraceRecorder) {
  const plan = buildRetrievalPlan(question);
  recorder.recordRoute("product_pipeline", plan);

  const candidates = findProductCandidates(question);
  if (candidates.length === 0) {
    return answerWithRetrievalPlan(question, recorder);
  }

  const familyChunks = getProductChunks(getProductFamily(candidates[0].chunkId));
  const rankedChunks = rankProductChunks(question, familyChunks).slice(0, 8);

  recorder.recordFusion({
    source: "product_chunk_ranker",
    rows: rankedChunks,
  });

  const rerankResult = plan.useRerank
    ? await rerankChunks(question, rankedChunks)
    : { provider: "disabled", rows: rankedChunks };
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

  const answer = useDecisionPrompt
    ? await generateProductDecisionAnswer(question, selected)
    : await generateAnswerFromRequest(llmRequest);
  recorder.recordLlmResponse({ answer });

  return {
    answer,
    sources: buildSources(selected),
  };
}

async function answerWithRetrievalPlan(question: string, recorder: RagTraceRecorder) {
  const plan = buildRetrievalPlan(question);
  recorder.recordRoute("retrieval_pipeline", plan);

  if (plan.complexity === "simple") {
    const vectorRows = await retrieveByVector(question, plan.recallSize);
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

    const answer = await generateAnswer(question, selected);
    recorder.recordLlmResponse({ answer });

    return {
      answer,
      sources: buildSources(selected),
    };
  }

  const [vectorRows, keywordRows] = await Promise.all([
    retrieveByVector(question, plan.recallSize),
    Promise.resolve(retrieveByKeyword(question, plan.recallSize)),
  ]);

  recorder.recordVectorSearch({
    topK: plan.recallSize,
    mode: "hybrid",
    rows: vectorRows,
  });
  recorder.recordKeywordSearch({
    topK: plan.recallSize,
    rows: keywordRows,
  });

  const fusedRows = plan.useFusion
    ? fuseRetrievalResults(vectorRows, keywordRows, plan.recallSize)
    : vectorRows;
  recorder.recordFusion({ rows: fusedRows });

  const rerankResult = plan.useRerank
    ? await rerankChunks(question, fusedRows)
    : { provider: "disabled", rows: fusedRows };
  recorder.recordRerank(rerankResult);

  const selected = pickTop3(rerankResult.rows);
  const llmRequest = buildLlmRequest(question, selected);
  recorder.recordLlmRequest({
    selectedChunkIds: selected.map((item) => item.chunkId),
    request: llmRequest,
  });

  const answer = await generateAnswer(question, selected);
  recorder.recordLlmResponse({ answer });

  return {
    answer,
    sources: buildSources(selected),
  };
}

export async function answerQuestion(question: string) {
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
