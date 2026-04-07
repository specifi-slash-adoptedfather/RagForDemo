export type RetrievedChunk = {
  chunkId: string;
  title: string;
  category: string;
  displaySource: string;
  text: string;
  keywords: string[];
  distance: number | null;
  vectorScore?: number;
  keywordScore?: number;
  fusedScore?: number;
  rerankScore?: number;
};

export type SourceCard = {
  id: string;
  title: string;
  section: string;
  excerpt: string;
};

export type AnswerPayload = {
  answer: string;
  sources: SourceCard[];
  traceId?: string;
};

export type QueryComplexity = "simple" | "complex";

export type RetrievalPlan = {
  complexity: QueryComplexity;
  recallSize: number;
  useFusion: boolean;
  useRerank: boolean;
};

export type TraceRun = {
  traceId: string;
  question: string;
  status: string;
  routeType: string;
  complexity: string;
  retrievalPlan: string;
  vectorSearch: string;
  keywordSearch: string;
  fusionResult: string;
  rerankResult: string;
  llmRequest: string;
  llmResponse: string;
  finalResponse: string;
  error: string;
  createdAt: string;
  updatedAt: string;
};

export type TraceEvent = {
  id: number;
  traceId: string;
  step: string;
  payload: string;
  createdAt: string;
};
