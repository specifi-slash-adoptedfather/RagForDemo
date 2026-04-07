import { NextRequest, NextResponse } from "next/server";

import {
  getTraceEvents,
  getTraceRun,
  listTraceRuns,
} from "../../../../lib/server/rag/trace";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const traceId = request.nextUrl.searchParams.get("traceId");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.max(1, Math.min(Number(limitParam || "20"), 100));

  if (traceId) {
    const run = getTraceRun(traceId);
    if (!run) {
      return NextResponse.json({ error: "trace_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      run,
      events: getTraceEvents(traceId),
    });
  }

  return NextResponse.json({
    runs: listTraceRuns(limit),
  });
}
