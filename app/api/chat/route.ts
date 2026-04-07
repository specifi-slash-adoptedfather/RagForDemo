import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "../../../lib/server/rag";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { message?: string };
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json({ error: "message_required" }, { status: 400 });
    }

    const payload = await answerQuestion(message);
    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        answer: "当前知识库服务暂时不可用，请稍后再试。",
        sources: [],
      },
      { status: 500 },
    );
  }
}
