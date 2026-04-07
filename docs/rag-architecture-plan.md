# RAG MVP Upgrade Plan

## Project Plan

- Goal: upgrade the current single-path RAG MVP into a layered retrieval pipeline with hybrid recall, score fusion, query-complexity routing, and rerank-ready interfaces.
- Scope: keep the existing ecommerce customer-service answer flow, preserve product and return special handling, and upgrade the generic QA path.
- Milestones:
  1. split retrieval and generation responsibilities into separate backend modules
  2. add keyword recall and vector recall with unified scoring
  3. add simple and complex query routing
  4. add rerank interface and local fallback scorer
  5. verify with build and end-to-end chat requests

## Module Plan

- `lib/server/rag.ts`
  - orchestration entry
  - keep compatibility with `answerQuestion(question)`
- `lib/server/rag/types.ts`
  - shared types for chunks, fused scores, rerank output, and response payload
- `lib/server/rag/db.ts`
  - sqlite access and raw chunk loading
- `lib/server/rag/http.ts`
  - outbound model calls through the existing curl-based transport
- `lib/server/rag/retrieval.ts`
  - vector recall
  - keyword recall
  - score fusion into a unified `0..1` band
- `lib/server/rag/routing.ts`
  - query difficulty classification
  - retrieval plan selection
- `lib/server/rag/rerank.ts`
  - external reranker interface placeholder
  - local lightweight fallback scorer
- `lib/server/rag/generation.ts`
  - answer generation prompt and final source building
- `lib/server/rag/domain-rules.ts`
  - preserve existing product and return-flow shortcuts

## Backend Plan

- Request enters `/api/chat`
- `answerQuestion` performs:
  1. special-domain fast path check
  2. query complexity classification
  3. retrieval strategy selection
  4. recall
  5. score fusion
  6. optional rerank for complex queries
  7. top-3 context selection
  8. LLM answer generation
- Simple queries:
  - use vector recall only
  - take top 3 directly
- Complex queries:
  - recall top 10 by hybrid retrieval
  - rerank candidates
  - pass top 3 to the generator

## Scoring Plan

- Vector score:
  - convert sqlite-vec distance into similarity
- Keyword score:
  - lexical overlap over title, category, keywords, source, and text
- Fusion score:
  - normalize vector and keyword scores independently
  - combine into a single `fusedScore`
- Rerank score:
  - map rerank result into the same `0..1` interval
  - if no external reranker is configured, use local lightweight heuristic fallback

## Reserved Interfaces

- Environment variables:
  - `RAG_RERANKER_BASE_URL`
  - `RAG_RERANKER_API_KEY`
  - `RAG_RERANKER_MODEL`
  - `RAG_RERANKER_ENDPOINT` with default `rerank`
- Expected external reranker payload:
  - `model`
  - `query`
  - `documents`
- Expected reranker response:
  - ordered items or per-document scores that can be mapped back to candidate chunks
