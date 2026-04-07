import { NextRequest, NextResponse } from "next/server";

import { saveSceneIntent } from "../../../../../lib/server/rag/business-db";
import { getTraceRun } from "../../../../../lib/server/rag/trace";
import { SourceCard } from "../../../../../lib/server/rag/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    traceId?: string;
    note?: string;
  };

  if (!body.traceId) {
    return NextResponse.json({ error: "trace_id_required" }, { status: 400 });
  }

  const trace = getTraceRun(body.traceId);
  if (!trace) {
    return NextResponse.json({ error: "trace_not_found" }, { status: 404 });
  }

  let finalPayload: { answer?: string; sources?: SourceCard[] } = {};
  try {
    finalPayload = JSON.parse(trace.finalResponse || "{}");
  } catch {
    return NextResponse.json({ error: "trace_payload_invalid" }, { status: 400 });
  }

  if (!finalPayload.answer || !Array.isArray(finalPayload.sources)) {
    return NextResponse.json({ error: "trace_payload_incomplete" }, { status: 400 });
  }

  const saved = saveSceneIntent({
    traceId: body.traceId,
    question: trace.question,
    answer: finalPayload.answer,
    sources: finalPayload.sources,
    note: body.note,
  });

  return NextResponse.json({ sceneIntent: saved });
}
