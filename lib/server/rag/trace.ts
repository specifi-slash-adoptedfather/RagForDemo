import { randomUUID } from "node:crypto";

import { getWriteDb } from "./db";
import { RetrievalPlan, TraceEvent, TraceRun } from "./types";

function stringify(value: unknown) {
  if (value === undefined) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function nowIso() {
  return new Date().toISOString();
}

function ensureTraceTables() {
  const db = getWriteDb();
  db.exec(`
    create table if not exists rag_trace_runs (
      trace_id text primary key,
      question text not null,
      status text not null,
      route_type text not null default '',
      complexity text not null default '',
      retrieval_plan text not null default '',
      vector_search text not null default '',
      keyword_search text not null default '',
      fusion_result text not null default '',
      rerank_result text not null default '',
      llm_request text not null default '',
      llm_response text not null default '',
      final_response text not null default '',
      timing_info text not null default '',
      error text not null default '',
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists rag_trace_events (
      id integer primary key autoincrement,
      trace_id text not null,
      step text not null,
      payload text not null default '',
      created_at text not null default current_timestamp,
      foreign key (trace_id) references rag_trace_runs(trace_id)
    );

    create index if not exists idx_rag_trace_runs_created_at
      on rag_trace_runs(created_at desc);

    create index if not exists idx_rag_trace_events_trace_id
      on rag_trace_events(trace_id, id asc);
  `);
  const columns = db.prepare("pragma table_info(rag_trace_runs)").all();
  const columnNames = new Set(columns.map((row: any) => row.name));
  if (!columnNames.has("timing_info")) {
    db.exec("alter table rag_trace_runs add column timing_info text not null default '';");
  }
  db.close();
}

type SnapshotPatch = {
  status?: string;
  routeType?: string;
  complexity?: string;
  retrievalPlan?: unknown;
  vectorSearch?: unknown;
  keywordSearch?: unknown;
  fusionResult?: unknown;
  rerankResult?: unknown;
  llmRequest?: unknown;
  llmResponse?: unknown;
  finalResponse?: unknown;
  timingInfo?: unknown;
  error?: string;
};

export class RagTraceRecorder {
  readonly traceId: string;
  readonly question: string;

  constructor(question: string) {
    ensureTraceTables();
    this.traceId = randomUUID();
    this.question = question;

    const db = getWriteDb();
    db.prepare(
      `
      insert into rag_trace_runs (
        trace_id,
        question,
        status,
        created_at,
        updated_at
      ) values (?, ?, 'running', ?, ?)
    `,
    ).run(this.traceId, question, nowIso(), nowIso());
    db.prepare(
      `
      insert into rag_trace_events (trace_id, step, payload, created_at)
      values (?, 'input_received', ?, ?)
    `,
    ).run(this.traceId, stringify({ question }), nowIso());
    db.close();
  }

  private updateSnapshot(patch: SnapshotPatch) {
    const db = getWriteDb();
    db.prepare(
      `
      update rag_trace_runs
      set status = coalesce(?, status),
          route_type = coalesce(?, route_type),
          complexity = coalesce(?, complexity),
          retrieval_plan = case when ? is null then retrieval_plan else ? end,
          vector_search = case when ? is null then vector_search else ? end,
          keyword_search = case when ? is null then keyword_search else ? end,
          fusion_result = case when ? is null then fusion_result else ? end,
          rerank_result = case when ? is null then rerank_result else ? end,
          llm_request = case when ? is null then llm_request else ? end,
          llm_response = case when ? is null then llm_response else ? end,
          final_response = case when ? is null then final_response else ? end,
          timing_info = case when ? is null then timing_info else ? end,
          error = coalesce(?, error),
          updated_at = ?
      where trace_id = ?
    `,
    ).run(
      patch.status ?? null,
      patch.routeType ?? null,
      patch.complexity ?? null,
      patch.retrievalPlan === undefined ? null : stringify(patch.retrievalPlan),
      patch.retrievalPlan === undefined ? null : stringify(patch.retrievalPlan),
      patch.vectorSearch === undefined ? null : stringify(patch.vectorSearch),
      patch.vectorSearch === undefined ? null : stringify(patch.vectorSearch),
      patch.keywordSearch === undefined ? null : stringify(patch.keywordSearch),
      patch.keywordSearch === undefined ? null : stringify(patch.keywordSearch),
      patch.fusionResult === undefined ? null : stringify(patch.fusionResult),
      patch.fusionResult === undefined ? null : stringify(patch.fusionResult),
      patch.rerankResult === undefined ? null : stringify(patch.rerankResult),
      patch.rerankResult === undefined ? null : stringify(patch.rerankResult),
      patch.llmRequest === undefined ? null : stringify(patch.llmRequest),
      patch.llmRequest === undefined ? null : stringify(patch.llmRequest),
      patch.llmResponse === undefined ? null : stringify(patch.llmResponse),
      patch.llmResponse === undefined ? null : stringify(patch.llmResponse),
      patch.finalResponse === undefined ? null : stringify(patch.finalResponse),
      patch.finalResponse === undefined ? null : stringify(patch.finalResponse),
      patch.timingInfo === undefined ? null : stringify(patch.timingInfo),
      patch.timingInfo === undefined ? null : stringify(patch.timingInfo),
      patch.error ?? null,
      nowIso(),
      this.traceId,
    );
    db.close();
  }

  private appendEvent(step: string, payload: unknown) {
    const db = getWriteDb();
    db.prepare(
      `
      insert into rag_trace_events (trace_id, step, payload, created_at)
      values (?, ?, ?, ?)
    `,
    ).run(this.traceId, step, stringify(payload), nowIso());
    db.close();
  }

  recordRoute(routeType: string, plan: RetrievalPlan | null) {
    this.updateSnapshot({
      routeType,
      complexity: plan?.complexity ?? "",
      retrievalPlan: plan ?? "",
    });
    this.appendEvent("route_selected", { routeType, plan });
  }

  recordDomainAnswer(ruleName: string, payload: unknown) {
    this.updateSnapshot({
      routeType: "domain_rule",
      finalResponse: payload,
    });
    this.appendEvent("domain_answer", { ruleName, payload });
  }

  recordVectorSearch(payload: unknown) {
    this.updateSnapshot({ vectorSearch: payload });
    this.appendEvent("vector_search", payload);
  }

  recordKeywordSearch(payload: unknown) {
    this.updateSnapshot({ keywordSearch: payload });
    this.appendEvent("keyword_search", payload);
  }

  recordFusion(payload: unknown) {
    this.updateSnapshot({ fusionResult: payload });
    this.appendEvent("score_fusion", payload);
  }

  recordRerank(payload: unknown) {
    this.updateSnapshot({ rerankResult: payload });
    this.appendEvent("rerank", payload);
  }

  recordLlmRequest(payload: unknown) {
    this.updateSnapshot({ llmRequest: payload });
    this.appendEvent("llm_request", payload);
  }

  recordLlmResponse(payload: unknown) {
    this.updateSnapshot({ llmResponse: payload });
    this.appendEvent("llm_response", payload);
  }

  recordTiming(payload: unknown) {
    this.updateSnapshot({ timingInfo: payload });
    this.appendEvent("timing", payload);
  }

  complete(payload: unknown) {
    this.updateSnapshot({
      status: "completed",
      finalResponse: payload,
    });
    this.appendEvent("completed", payload);
  }

  fail(error: unknown) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    this.updateSnapshot({
      status: "failed",
      error: message,
    });
    this.appendEvent("failed", { error: message });
  }
}

export function getTraceRun(traceId: string) {
  ensureTraceTables();
  const db = getWriteDb();
  const row = db.prepare(
    `
    select
      trace_id as traceId,
      question as question,
      status as status,
      route_type as routeType,
      complexity as complexity,
      retrieval_plan as retrievalPlan,
      vector_search as vectorSearch,
      keyword_search as keywordSearch,
      fusion_result as fusionResult,
      rerank_result as rerankResult,
      llm_request as llmRequest,
      llm_response as llmResponse,
      final_response as finalResponse,
      timing_info as timingInfo,
      error as error,
      created_at as createdAt,
      updated_at as updatedAt
    from rag_trace_runs
    where trace_id = ?
  `,
  ).get(traceId) as TraceRun | undefined;
  db.close();
  return row || null;
}

export function listTraceRuns(limit: number) {
  ensureTraceTables();
  const db = getWriteDb();
  const rows = db.prepare(
    `
    select
      trace_id as traceId,
      question as question,
      status as status,
      route_type as routeType,
      complexity as complexity,
      retrieval_plan as retrievalPlan,
      vector_search as vectorSearch,
      keyword_search as keywordSearch,
      fusion_result as fusionResult,
      rerank_result as rerankResult,
      llm_request as llmRequest,
      llm_response as llmResponse,
      final_response as finalResponse,
      timing_info as timingInfo,
      error as error,
      created_at as createdAt,
      updated_at as updatedAt
    from rag_trace_runs
    order by created_at desc
    limit ?
  `,
  ).all(limit) as TraceRun[];
  db.close();
  return rows;
}

export function getTraceEvents(traceId: string) {
  ensureTraceTables();
  const db = getWriteDb();
  const rows = db.prepare(
    `
    select
      id as id,
      trace_id as traceId,
      step as step,
      payload as payload,
      created_at as createdAt
    from rag_trace_events
    where trace_id = ?
    order by id asc
  `,
  ).all(traceId) as TraceEvent[];
  db.close();
  return rows;
}
