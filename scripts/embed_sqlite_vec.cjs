const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const Database = require("better-sqlite3");
const sqliteVec = require("sqlite-vec");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

const rootDir = path.join(__dirname, "..");
const dbPath = path.resolve(
  rootDir,
  process.env.SQLITE_VEC_DB_PATH || "./data/sqlite-vec/ecommerce-kb.db",
);
const embeddingModel =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const batchSize = 1;

if (!process.env.OPENAI_EMBEDDING_API_KEY) {
  throw new Error("Missing OPENAI_EMBEDDING_API_KEY");
}
if (!process.env.OPENAI_EMBEDDING_BASE_URL) {
  throw new Error("Missing OPENAI_EMBEDDING_BASE_URL");
}

const db = new Database(dbPath);
sqliteVec.load(db);

const pendingRows = db
  .prepare(
    `
    select chunk_id, text, embedding_attempts
    from kb_chunks
    where embedding_status != 'ready'
      and embedding_attempts < 5
    order by embedding_attempts asc, chunk_id asc
  `,
  )
  .all();

function writeManifest(readyCount, vectorCount, errorCount, pendingCount) {
  const manifestPath = path.join(path.dirname(dbPath), "manifest.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : {};
  manifest.embedded_count = readyCount;
  manifest.vector_rows = vectorCount;
  manifest.error_count = errorCount;
  manifest.pending_count = pendingCount;
  manifest.embedding_model = embeddingModel;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

if (pendingRows.length === 0) {
  const readyCount = db
    .prepare("select count(*) as count from kb_chunks where embedding_status = 'ready'")
    .get().count;
  const vectorCount = db.prepare("select count(*) as count from vec_kb_chunks").get().count;
  const errorCount = db
    .prepare("select count(*) as count from kb_chunks where embedding_status = 'error'")
    .get().count;
  writeManifest(readyCount, vectorCount, errorCount, 0);
  console.log("No pending chunks. Embeddings are already ready.");
  process.exit(0);
}

const deleteVector = db.prepare(`
  delete from vec_kb_chunks
  where chunk_id = ?
`);

const insertVector = db.prepare(`
  insert into vec_kb_chunks (chunk_id, embedding)
  values (?, ?)
`);

const markReady = db.prepare(`
  update kb_chunks
  set embedding_status = 'ready',
      embedding_error = ''
  where chunk_id = ?
`);

const markAttemptFailure = db.prepare(`
  update kb_chunks
  set embedding_status = 'error',
      embedding_attempts = embedding_attempts + 1,
      embedding_error = ?
  where chunk_id = ?
`);

const markProcessing = db.prepare(`
  update kb_chunks
  set embedding_status = 'processing'
  where chunk_id = ?
`);

function toFloat32Buffer(embedding) {
  const array = new Float32Array(embedding);
  return Buffer.from(array.buffer);
}

async function embedBatch(batch) {
  const requestPath = path.join(
    os.tmpdir(),
    `embedding-request-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      model: embeddingModel,
      input: batch.map((row) => row.text),
    }),
    { encoding: "utf8" },
  );

  try {
    const output = execFileSync(
      "curl.exe",
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

    const payload = JSON.parse(output);
    if (!payload.data) {
      throw new Error(output);
    }
    return payload.data.map((item) => item.embedding);
  } finally {
    fs.rmSync(requestPath, { force: true });
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Embedding ${pendingRows.length} chunks with ${embeddingModel}`);

  for (let index = 0; index < pendingRows.length; index += batchSize) {
    const batch = pendingRows.slice(index, index + batchSize);
    for (const row of batch) {
      markProcessing.run(row.chunk_id);
    }

    let lastError = "";
    let success = false;

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const embeddings = await embedBatch(batch);

        const transaction = db.transaction(() => {
          for (let i = 0; i < batch.length; i += 1) {
            deleteVector.run(batch[i].chunk_id);
            insertVector.run(batch[i].chunk_id, toFloat32Buffer(embeddings[i]));
            markReady.run(batch[i].chunk_id);
          }
        });

        transaction();
        success = true;
        console.log(
          `Embedded ${Math.min(index + batch.length, pendingRows.length)}/${pendingRows.length}`,
        );
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.log(
          `Batch ${index / batchSize + 1} attempt ${attempt} failed: ${lastError}`,
        );
        if (attempt < 4) {
          await sleep(attempt * 1500);
        }
      }
    }

    if (!success) {
      const transaction = db.transaction(() => {
        for (const row of batch) {
          markAttemptFailure.run(lastError.slice(0, 500), row.chunk_id);
        }
      });
      transaction();
      console.log(`Stopped after repeated failures on batch ${index / batchSize + 1}.`);
      break;
    }
  }

  const readyCount = db
    .prepare("select count(*) as count from kb_chunks where embedding_status = 'ready'")
    .get().count;
  const pendingCount = db
    .prepare("select count(*) as count from kb_chunks where embedding_status != 'ready'")
    .get().count;
  const vectorCount = db.prepare("select count(*) as count from vec_kb_chunks").get().count;
  const errorCount = db
    .prepare("select count(*) as count from kb_chunks where embedding_status = 'error'")
    .get().count;

  writeManifest(readyCount, vectorCount, errorCount, pendingCount);

  console.log(`Done. embedded_count=${readyCount}, vector_rows=${vectorCount}, error_count=${errorCount}, pending_count=${pendingCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
