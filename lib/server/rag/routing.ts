import { QueryComplexity, RetrievalPlan } from "./types";

const COMPLEX_HINTS = [
  "为什么",
  "原因",
  "对比",
  "区别",
  "流程",
  "步骤",
  "同时",
  "分别",
  "以及",
  "还有",
  "如果",
  "但是",
  "怎么处理",
  "怎么办",
  "能不能",
];

export function classifyQueryComplexity(question: string): QueryComplexity {
  const normalized = question.trim();
  const longQuery = normalized.length >= 18;
  const hintCount = COMPLEX_HINTS.filter((hint) => normalized.includes(hint)).length;
  const multiClause = /[，,；;：:]/.test(normalized);
  const manyQuestionMarks = (normalized.match(/[？?]/g) || []).length >= 2;

  if (longQuery || hintCount >= 2 || multiClause || manyQuestionMarks) {
    return "complex";
  }

  return "simple";
}

export function buildRetrievalPlan(question: string): RetrievalPlan {
  const complexity = classifyQueryComplexity(question);

  if (complexity === "simple") {
    return {
      complexity,
      recallSize: 6,
      useFusion: true,
      useRerank: false,
    };
  }

  return {
    complexity,
    recallSize: 8,
    useFusion: true,
    useRerank: true,
  };
}
