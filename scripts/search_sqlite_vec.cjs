const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const Database = require("better-sqlite3");
const sqliteVec = require("sqlite-vec");
const dotenv = require("dotenv");

const CURL_BIN = process.platform === "win32" ? "curl.exe" : "curl";

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

const query = process.argv[2];
const topK = Number(process.argv[3] || 4);

if (!query) {
  console.error("Usage: node scripts/search_sqlite_vec.cjs \"你的问题\" [topK]");
  process.exit(1);
}

const rootDir = path.join(__dirname, "..");
const dbPath = path.resolve(
  rootDir,
  process.env.SQLITE_VEC_DB_PATH || "./data/sqlite-vec/ecommerce-kb.db",
);

function toFloat32Buffer(embedding) {
  const array = new Float32Array(embedding);
  return Buffer.from(array.buffer);
}

async function main() {
  const requestPath = path.join(
    os.tmpdir(),
    `search-embedding-request-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      input: [query],
    }),
    { encoding: "utf8" },
  );

  const output = execFileSync(
    CURL_BIN,
    [
      "-sS",
      "-X",
      "POST",
      `${process.env.OPENAI_EMBEDDING_BASE_URL.replace(/\/$/, "")}/embeddings`,
      "-H",
      "Content-Type: application/json",
      "-H",
      `Authorization: Bearer ${process.env.OPENAI_EMBEDDING_API_KEY}`,
      "--data-binary",
      `@${requestPath}`,
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  fs.rmSync(requestPath, { force: true });

  const payload = JSON.parse(output);
  if (!payload.data) {
    throw new Error(output);
  }
  const queryVector = toFloat32Buffer(payload.data[0].embedding);

  const db = new Database(dbPath);
  sqliteVec.load(db);

  const rows = db
    .prepare(
      `
      select
        c.chunk_id,
        c.title,
        c.category,
        c.display_source,
        c.text,
        v.distance
      from vec_kb_chunks v
      join kb_chunks c on c.chunk_id = v.chunk_id
      where v.embedding match ?
        and k = ?
      order by distance
    `,
    )
    .all(queryVector, topK);

  for (const [index, row] of rows.entries()) {
    console.log(`[${index + 1}] ${row.title}`);
    console.log(`category: ${row.category}`);
    console.log(`source: ${row.display_source}`);
    console.log(`distance: ${row.distance}`);
    console.log(row.text);
    console.log("-".repeat(80));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
