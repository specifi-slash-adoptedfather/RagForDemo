import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function postJsonWithCurl(
  baseUrl: string,
  apiKey: string,
  endpoint: string,
  payload: unknown,
) {
  const requestPath = path.join(
    os.tmpdir(),
    `rag-request-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(requestPath, JSON.stringify(payload), { encoding: "utf8" });

  try {
    const output = execFileSync(
      "curl.exe",
      [
        "-sS",
        "-X",
        "POST",
        `${baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`,
        "-H",
        "Content-Type: application/json",
        "-H",
        `Authorization: Bearer ${apiKey}`,
        "--data-binary",
        `@${requestPath}`,
      ],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );
    return JSON.parse(output);
  } finally {
    fs.rmSync(requestPath, { force: true });
  }
}

export async function createEmbedding(input: string) {
  const payload = postJsonWithCurl(
    process.env.OPENAI_EMBEDDING_BASE_URL || "",
    process.env.OPENAI_EMBEDDING_API_KEY || "",
    "embeddings",
    {
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      input: [input],
    },
  );

  if (!payload.data) {
    throw new Error(JSON.stringify(payload));
  }

  return payload.data[0].embedding as number[];
}

export function toFloat32Buffer(embedding: number[]) {
  const array = new Float32Array(embedding);
  return Buffer.from(array.buffer);
}
