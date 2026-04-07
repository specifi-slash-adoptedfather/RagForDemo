import { getChunksByCategory, getChunksByPrefix } from "./db";
import {
  getAngryCustomerSoothingAnswer,
  getDeliveryCoverageAnswer,
  getDeliveryEtaAnswer,
  getInvoiceReissueAnswer,
  getLogisticsNotUpdatedAnswer,
} from "./business-db";
import { AnswerPayload, RankedProductChunk, RetrievedChunk } from "./types";
import { buildSources, formatCustomerAnswer } from "./generation";

const CATEGORY_PRODUCT = "商品";

function hasAny(question: string, hints: string[]) {
  return hints.some((hint) => question.includes(hint));
}

export function getProductFamily(chunkId: string) {
  return chunkId.split("-").slice(0, 2).join("-");
}

export function getProductChunks(productFamilyId: string) {
  return getChunksByPrefix(productFamilyId);
}

function isProductListingIntent(question: string) {
  return hasAny(question, [
    "卖什么产品",
    "在卖什么产品",
    "卖什么商品",
    "在卖什么商品",
    "有哪些产品",
    "有哪些商品",
    "产品列表",
    "商品列表",
    "销售信息",
  ]);
}

export function isProductIntent(question: string) {
  return hasAny(question, [
    "商品",
    "产品",
    "冲锋衣",
    "羽绒服",
    "保温杯",
    "四件套",
    "卖点",
    "规格",
    "尺码",
    "尺寸",
    "材质",
    "面料",
    "适合什么人",
    "适合谁",
    "防寒",
    "保暖",
    "防风",
    "防水",
    "几度",
    "什么样",
    "颜色",
    "有哪些商品",
  ]);
}

function isReturnFlowIntent(question: string) {
  return hasAny(question, [
    "怎么退货",
    "如何退货",
    "退货流程",
    "退货步骤",
    "怎么申请退货",
    "退货怎么操作",
  ]);
}

function isInvoiceIntent(question: string) {
  return hasAny(question, ["发票", "补开", "开票", "电子发票", "纸质发票"]);
}

function isAngryCustomerIntent(question: string) {
  return hasAny(question, [
    "生气",
    "发火",
    "气死了",
    "太差了",
    "我要投诉",
    "你们怎么回事",
    "很不满意",
    "差评",
    "垃圾",
    "耽误我时间",
    "别跟我说这些",
  ]);
}

function isLogisticsTrackingIntent(question: string) {
  return hasAny(question, [
    "物流一直没更新",
    "物流没更新",
    "为什么物流一直没更新",
    "快递一直没更新",
    "运单一直没更新",
    "物流状态",
    "运单号",
  ]);
}

function isDeliveryCoverageIntent(question: string) {
  return hasAny(question, ["可送地区", "送到哪些地区", "哪些地区能送", "支持配送地区", "配送范围"]);
}

function isDeliveryEtaIntent(question: string) {
  return hasAny(question, ["多久送到", "送到时间", "配送时效", "几天能到", "不同地区送到时间", "多久到货"]);
}

function scoreProductChunk(question: string, row: RetrievedChunk) {
  let score = 0;
  const productName = row.title.split(" | ")[0];
  const text = row.text;
  const segmentId = row.chunkId.split("-").slice(2).join("-");

  if (question.includes(productName)) score += 10;
  if (question.includes("冲锋衣") && text.includes("冲锋衣")) score += 6;
  if (question.includes("羽绒服") && text.includes("冲锋衣")) score += 3;
  if (question.includes("保温杯") && text.includes("保温杯")) score += 6;
  if (question.includes("四件套") && text.includes("四件套")) score += 6;

  if (question.includes("卖什么") || question.includes("产品") || question.includes("商品")) {
    if (segmentId === "sales") score += 8;
    if (segmentId === "overview") score += 5;
  }

  if (question.includes("尺码") || question.includes("尺寸")) {
    if (segmentId === "specs") score += 10;
    if (text.includes("尺码") || text.includes("尺寸")) score += 8;
  }

  if (question.includes("颜色")) {
    if (segmentId === "sales") score += 10;
    if (text.includes("颜色") || text.includes("热门色")) score += 8;
  }

  if (question.includes("材质") || question.includes("面料")) {
    if (segmentId === "specs") score += 10;
    if (text.includes("材质") || text.includes("面料") || text.includes("内胆")) score += 8;
  }

  if (question.includes("合适") || question.includes("适合")) {
    if (segmentId === "scenarios") score += 8;
    if (segmentId === "decision") score += 8;
    if (segmentId === "faq") score += 6;
  }

  if (question.includes("徒步") || question.includes("露营") || question.includes("登山") || question.includes("旅行")) {
    if (segmentId === "scenarios") score += 10;
    if (segmentId === "decision") score += 6;
    if (text.includes("徒步") || text.includes("旅行") || text.includes("轻户外")) score += 6;
  }

  if (question.includes("防风") || question.includes("防寒") || question.includes("保暖")) {
    if (segmentId === "decision") score += 8;
    if (segmentId === "faq") score += 5;
    if (text.includes("保暖等级") || text.includes("防风")) score += 6;
  }

  return score;
}

export function findProductCandidates(question: string) {
  const allChunks = getChunksByCategory(CATEGORY_PRODUCT);
  const bestByFamily = new Map<string, { row: RetrievedChunk; score: number }>();

  for (const row of allChunks) {
    const familyId = getProductFamily(row.chunkId);
    const score = scoreProductChunk(question, row);
    if (score <= 0) continue;
    const existing = bestByFamily.get(familyId);
    if (!existing || score > existing.score) {
      bestByFamily.set(familyId, { row, score });
    }
  }

  return [...bestByFamily.values()]
    .sort((left, right) => right.score - left.score)
    .map((item) => item.row);
}

export function rankProductChunks(question: string, chunks: RetrievedChunk[]): RankedProductChunk[] {
  return chunks
    .map((row) => ({
      ...row,
      fusedScore: scoreProductChunk(question, row),
    }))
    .sort((left, right) => right.fusedScore - left.fusedScore);
}

function buildProductSalesListAnswer(): AnswerPayload {
  const families = ["product-001", "product-002", "product-003"];
  const salesRows = families
    .map((familyId) =>
      getProductChunks(familyId).find((item) => item.chunkId.endsWith("-sales")),
    )
    .filter(Boolean) as RetrievedChunk[];

  return {
    answer: formatCustomerAnswer(
      "我们目前在售的产品主要有：云岚轻羽冲锋衣、星屿恒温保温杯 520ml、月白柔护四件套。",
    ),
    sources: buildSources(salesRows),
  };
}

function buildReturnFlowAnswer(rows: RetrievedChunk[]): AnswerPayload {
  return {
    answer: formatCustomerAnswer(
      "可以申请退货。一般流程是先确认订单没有超过可退时间，然后在售后入口发起退货申请，接着填写退货原因、商品数量、商品状态和联系人信息，再按页面要求选择退回或退款方式，提交后等待审核和后续处理。如果商品属于禁退类目，或者已经超过可退时间，就无法继续申请。",
    ),
    sources: buildSources(rows),
  };
}

export async function tryAnswerWithDomainRules(question: string): Promise<AnswerPayload | null> {
  if (isProductListingIntent(question)) {
    return buildProductSalesListAnswer();
  }

  if (isInvoiceIntent(question)) return getInvoiceReissueAnswer();
  if (isAngryCustomerIntent(question)) return getAngryCustomerSoothingAnswer();
  if (isDeliveryCoverageIntent(question)) return getDeliveryCoverageAnswer();
  if (isDeliveryEtaIntent(question)) return getDeliveryEtaAnswer();
  if (isLogisticsTrackingIntent(question)) return getLogisticsNotUpdatedAnswer(question);

  if (isReturnFlowIntent(question)) {
    const rows = getChunksByPrefix("policy")
      .concat(getChunksByPrefix("faq"))
      .filter((row) => row.chunkId === "policy-001" || row.chunkId === "faq-003")
      .slice(0, 2);
    return buildReturnFlowAnswer(rows);
  }

  return null;
}
