import fs from "node:fs";
import path from "node:path";

import { AnswerPayload, SourceCard } from "./types";

type RuleRow = {
  rule_key: string;
  title: string;
  answer: string;
  section: string;
  excerpt: string;
};

type ShipmentRow = {
  order_id: string;
  carrier: string;
  tracking_no: string;
  latest_status: string;
  latest_update_at: string;
  delay_reason: string;
  customer_script: string;
};

export type SceneIntentRow = {
  traceId: string;
  question: string;
  answer: string;
  sourcesJson: string;
  note: string;
  approvedAt: string;
};

function getBusinessDbPath() {
  return path.resolve(process.cwd(), "./data/business/service-ops.db");
}

function getBusinessDb() {
  const Database = require("better-sqlite3");
  const dbPath = getBusinessDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  return new Database(dbPath);
}

function toPayload(title: string, section: string, answer: string, excerpt: string): AnswerPayload {
  return {
    answer,
    sources: [
      {
        id: title,
        title,
        section,
        excerpt,
      },
    ],
  };
}

function ensureBusinessTables() {
  const db = getBusinessDb();
  db.exec(`
    create table if not exists invoice_rules (
      rule_key text primary key,
      title text not null,
      answer text not null,
      section text not null,
      excerpt text not null,
      updated_at text not null default current_timestamp
    );

    create table if not exists logistics_rules (
      rule_key text primary key,
      title text not null,
      answer text not null,
      section text not null,
      excerpt text not null,
      updated_at text not null default current_timestamp
    );

    create table if not exists delivery_rules (
      rule_key text primary key,
      title text not null,
      answer text not null,
      section text not null,
      excerpt text not null,
      updated_at text not null default current_timestamp
    );

    create table if not exists service_scripts (
      rule_key text primary key,
      title text not null,
      answer text not null,
      section text not null,
      excerpt text not null,
      updated_at text not null default current_timestamp
    );

    create table if not exists logistics_shipments (
      order_id text primary key,
      carrier text not null,
      tracking_no text not null,
      latest_status text not null,
      latest_update_at text not null,
      delay_reason text not null,
      customer_script text not null,
      updated_at text not null default current_timestamp
    );

    create table if not exists scene_intents (
      trace_id text primary key,
      question text not null,
      answer text not null,
      sources_json text not null,
      note text not null default '',
      approved_at text not null default current_timestamp
    );
  `);

  db.prepare(
    `
    insert into invoice_rules (rule_key, title, answer, section, excerpt)
    values (?, ?, ?, ?, ?)
    on conflict(rule_key) do update set
      title = excluded.title,
      answer = excluded.answer,
      section = excluded.section,
      excerpt = excluded.excerpt,
      updated_at = current_timestamp
  `,
  ).run(
    "invoice_reissue",
    "发票补开规则",
    "可以补开发票。通常需要先核对订单是否已支付完成，并确认开票抬头、税号、开票内容和收票邮箱或地址。若订单存在部分退款，开票金额一般需要按实际成交和未退款部分核算。客服可先收集订单号、抬头、税号、开票内容和收票方式，再提交财务或开票系统处理。",
    "业务规则 | 发票服务规则",
    "客服话术：可以补开发票。请您提供订单号、发票抬头、税号、开票内容以及收票邮箱或地址。这边先为您核对订单状态和可开票金额；如果订单有部分退款，发票金额会按实际成交金额处理。",
  );

  db.prepare(
    `
    insert into logistics_rules (rule_key, title, answer, section, excerpt)
    values (?, ?, ?, ?, ?)
    on conflict(rule_key) do update set
      title = excluded.title,
      answer = excluded.answer,
      section = excluded.section,
      excerpt = excluded.excerpt,
      updated_at = current_timestamp
  `,
  ).run(
    "logistics_not_updated",
    "物流未更新排查规则",
    "物流长时间未更新时，先查询物流数据库中的最新状态、最近更新时间和承运商回传记录。常见原因包括仓库已出库但承运商未回传、干线运输中转未扫描、节假日或天气影响，以及包裹被拦截或需补充地址信息。客服应先确认订单号或运单号，再根据物流数据库中的最新节点向用户说明当前状态和下一步跟进动作。",
    "业务规则 | 物流服务规则",
    "客服话术：这边先帮您查物流系统。物流暂未更新通常有几种情况，比如承运商还没回传新节点、包裹正在中转、或配送站点延迟扫描。您把订单号或运单号发我，我先核对最新物流状态，再给您明确反馈。",
  );

  db.prepare(
    `
    insert into delivery_rules (rule_key, title, answer, section, excerpt)
    values (?, ?, ?, ?, ?)
    on conflict(rule_key) do update set
      title = excluded.title,
      answer = excluded.answer,
      section = excluded.section,
      excerpt = excluded.excerpt,
      updated_at = current_timestamp
  `,
  ).run(
    "delivery_coverage",
    "可送地区规则",
    "目前常规可配送地区覆盖中国大陆大部分城市和县区。港澳台、海外地区、偏远乡镇、管制区域以及部分需冷链或特殊运输资质的地区，是否支持配送要以实际地址校验结果为准。客服回复时应先确认收货省市区，再判断是否属于可送范围。",
    "业务规则 | 配送覆盖规则",
    "客服话术：大部分中国大陆地区都可以正常配送。您把收货省市区发我，这边先帮您核对是否在可送范围内；港澳台、海外和部分偏远区域需要以系统地址校验结果为准。",
  );

  db.prepare(
    `
    insert into delivery_rules (rule_key, title, answer, section, excerpt)
    values (?, ?, ?, ?, ?)
    on conflict(rule_key) do update set
      title = excluded.title,
      answer = excluded.answer,
      section = excluded.section,
      excerpt = excluded.excerpt,
      updated_at = current_timestamp
  `,
  ).run(
    "delivery_eta",
    "不同地区送达时效规则",
    "配送时效通常按区域区分：同城或省内核心城市一般 1 到 2 天送达；江浙沪和华东主要城市通常 1 到 3 天；华北、华中、华南主要城市通常 2 到 4 天；西南、西北及东北部分地区通常 3 到 6 天；偏远地区、海岛和特殊天气场景可能超过 7 天。客服回复时应结合仓库发货地、收货地区和承运商时效说明给用户预期。",
    "业务规则 | 配送时效规则",
    "客服话术：送达时间要看收货地区。一般同城或省内核心城市 1 到 2 天，华东主要城市 1 到 3 天，华北华中华南主要城市 2 到 4 天，西南西北和东北部分地区 3 到 6 天，偏远地区可能更久。您把收货地区发我，我可以帮您按地区再细化判断。",
  );

  db.prepare(
    `
    insert into service_scripts (rule_key, title, answer, section, excerpt)
    values (?, ?, ?, ?, ?)
    on conflict(rule_key) do update set
      title = excluded.title,
      answer = excluded.answer,
      section = excluded.section,
      excerpt = excluded.excerpt,
      updated_at = current_timestamp
  `,
  ).run(
    "angry_customer_soothing",
    "客户发怒安抚话术",
    "遇到客户明显生气或情绪激动时，客服应先接住情绪，再说明正在处理。标准回复可以是：非常抱歉，这次确实给您带来了不好的体验，我先帮您把问题接住。您先别着急，这边会马上帮您核对订单、物流或售后状态，并尽快给您明确处理结果。如果是我们这边的问题，我会如实向您说明并继续跟进处理。",
    "业务规则 | 客服安抚话术",
    "客服话术：非常抱歉，这次确实给您带来了不好的体验，我先帮您把问题接住。您先别着急，这边会马上帮您核对具体情况，并尽快给您明确处理结果。如果是我们这边的问题，我会继续帮您跟进处理。",
  );

  db.prepare(
    `
    insert into logistics_shipments (
      order_id,
      carrier,
      tracking_no,
      latest_status,
      latest_update_at,
      delay_reason,
      customer_script
    ) values (?, ?, ?, ?, ?, ?, ?)
    on conflict(order_id) do update set
      carrier = excluded.carrier,
      tracking_no = excluded.tracking_no,
      latest_status = excluded.latest_status,
      latest_update_at = excluded.latest_update_at,
      delay_reason = excluded.delay_reason,
      customer_script = excluded.customer_script,
      updated_at = current_timestamp
  `,
  ).run(
    "DEMO-20260406-1001",
    "SF Express",
    "SF1234567890",
    "包裹已到达上海转运中心，待下一站扫描",
    "2026-04-06 09:20:00",
    "干线中转未产生新扫描，属于运输途中常见情况",
    "这边帮您查到包裹目前已到达上海转运中心，最近一次更新时间是 2026-04-06 09:20。当前看是中转途中暂未产生新的扫描记录，暂不属于异常丢件。建议再观察半天到一天；如果超过这个时间仍未更新，这边可以继续帮您催承运商跟进。",
  );

  db.close();
}

export function saveSceneIntent(input: {
  traceId: string;
  question: string;
  answer: string;
  sources: SourceCard[];
  note?: string;
}) {
  ensureBusinessTables();
  const db = getBusinessDb();
  db.prepare(
    `
    insert into scene_intents (trace_id, question, answer, sources_json, note, approved_at)
    values (?, ?, ?, ?, ?, current_timestamp)
    on conflict(trace_id) do update set
      question = excluded.question,
      answer = excluded.answer,
      sources_json = excluded.sources_json,
      note = excluded.note,
      approved_at = current_timestamp
  `,
  ).run(
    input.traceId,
    input.question,
    input.answer,
    JSON.stringify(input.sources, null, 2),
    input.note || "",
  );
  const row = db
    .prepare(
      `
      select
        trace_id as traceId,
        question,
        answer,
        sources_json as sourcesJson,
        note,
        approved_at as approvedAt
      from scene_intents
      where trace_id = ?
    `,
    )
    .get(input.traceId) as SceneIntentRow;
  db.close();
  return row;
}

export function getInvoiceReissueAnswer() {
  ensureBusinessTables();
  const db = getBusinessDb();
  const row = db
    .prepare(
      `
      select rule_key, title, answer, section, excerpt
      from invoice_rules
      where rule_key = 'invoice_reissue'
    `,
    )
    .get() as RuleRow | undefined;
  db.close();
  return row ? toPayload(row.title, row.section, row.answer, row.excerpt) : null;
}

export function getLogisticsNotUpdatedAnswer(question: string) {
  ensureBusinessTables();
  const db = getBusinessDb();
  const orderMatch = question.match(/[A-Z]{2,}-\d{8}-\d{4}/i);

  if (orderMatch) {
    const shipment = db
      .prepare(
        `
        select
          order_id,
          carrier,
          tracking_no,
          latest_status,
          latest_update_at,
          delay_reason,
          customer_script
        from logistics_shipments
        where order_id = ?
      `,
      )
      .get(orderMatch[0].toUpperCase()) as ShipmentRow | undefined;
    db.close();

    if (shipment) {
      return {
        answer: shipment.customer_script,
        sources: [
          {
            id: shipment.order_id,
            title: `物流数据库记录 · ${shipment.order_id}`,
            section: "物流数据库 | 实时运单状态",
            excerpt: `承运商：${shipment.carrier}\n运单号：${shipment.tracking_no}\n最新状态：${shipment.latest_status}\n最近更新时间：${shipment.latest_update_at}\n延迟原因：${shipment.delay_reason}`,
          },
        ],
      };
    }

    return {
      answer:
        "这边先按物流数据库帮您查了，但暂时没有查到这个订单号对应的物流记录。您可以再确认一下订单号或直接提供运单号，我继续帮您核对最新状态。",
      sources: [
        {
          id: "logistics-db-miss",
          title: "物流数据库查询结果",
          section: "物流数据库 | 未命中记录",
          excerpt: `未查到订单号 ${orderMatch[0].toUpperCase()} 对应的物流记录。`,
        },
      ],
    };
  }

  const rule = db
    .prepare(
      `
      select rule_key, title, answer, section, excerpt
      from logistics_rules
      where rule_key = 'logistics_not_updated'
    `,
    )
    .get() as RuleRow | undefined;
  db.close();
  return rule ? toPayload(rule.title, rule.section, rule.answer, rule.excerpt) : null;
}

export function getDeliveryCoverageAnswer() {
  ensureBusinessTables();
  const db = getBusinessDb();
  const row = db
    .prepare(
      `
      select rule_key, title, answer, section, excerpt
      from delivery_rules
      where rule_key = 'delivery_coverage'
    `,
    )
    .get() as RuleRow | undefined;
  db.close();
  return row ? toPayload(row.title, row.section, row.answer, row.excerpt) : null;
}

export function getDeliveryEtaAnswer() {
  ensureBusinessTables();
  const db = getBusinessDb();
  const row = db
    .prepare(
      `
      select rule_key, title, answer, section, excerpt
      from delivery_rules
      where rule_key = 'delivery_eta'
    `,
    )
    .get() as RuleRow | undefined;
  db.close();
  return row ? toPayload(row.title, row.section, row.answer, row.excerpt) : null;
}

export function getAngryCustomerSoothingAnswer() {
  ensureBusinessTables();
  const db = getBusinessDb();
  const row = db
    .prepare(
      `
      select rule_key, title, answer, section, excerpt
      from service_scripts
      where rule_key = 'angry_customer_soothing'
    `,
    )
    .get() as RuleRow | undefined;
  db.close();
  return row ? toPayload(row.title, row.section, row.answer, row.excerpt) : null;
}
