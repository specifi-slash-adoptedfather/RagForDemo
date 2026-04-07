import { NextRequest, NextResponse } from "next/server";

import {
  getRerankerSettings,
  saveRerankerSettings,
} from "../../../../lib/server/rag/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    reranker: getRerankerSettings(),
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    reranker?: {
      enabled?: boolean;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      endpoint?: string;
    };
  };

  const reranker = body.reranker;
  if (!reranker) {
    return NextResponse.json({ error: "reranker_payload_required" }, { status: 400 });
  }

  const saved = saveRerankerSettings({
    enabled: Boolean(reranker.enabled),
    baseUrl: reranker.baseUrl?.trim() || "",
    apiKey: reranker.apiKey?.trim() || "",
    model: reranker.model?.trim() || "",
    endpoint: reranker.endpoint?.trim() || "rerank",
  });

  return NextResponse.json({
    reranker: saved,
  });
}
