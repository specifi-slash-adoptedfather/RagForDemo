const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const Database = require("better-sqlite3");
const sqliteVec = require("sqlite-vec");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

const rootDir = path.join(__dirname, "..");
const dbPath = path.resolve(
  rootDir,
  process.env.SQLITE_VEC_DB_PATH || "./data/sqlite-vec/ecommerce-kb.db",
);
const chunksPath = path.join(
  rootDir,
  "data-processed",
  "ecommerce-kb-zh",
  "chunks.jsonl",
);
const embeddingDimensions = 1536;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
sqliteVec.load(db);

db.pragma("journal_mode = WAL");

function ensureBaseTables() {
  db.exec(`
    create table if not exists kb_chunks (
      chunk_id text primary key,
      chunk_type text not null,
      category text not null,
      title text not null,
      text text not null,
      keywords text not null,
      source_ids text not null,
      source_titles text not null,
      display_source text not null,
      embedding_status text not null default 'pending',
      embedding_attempts integer not null default 0,
      embedding_error text not null default '',
      created_at text not null default current_timestamp
    );
  `);

  const columns = db.prepare("pragma table_info(kb_chunks)").all();
  const columnNames = new Set(columns.map((row) => row.name));

  if (!columnNames.has("content_hash")) {
    db.exec("alter table kb_chunks add column content_hash text not null default '';");
  }
  if (!columnNames.has("updated_at")) {
    db.exec("alter table kb_chunks add column updated_at text;");
    db.exec("update kb_chunks set updated_at = created_at where updated_at is null or updated_at = '';");
  }

  const hasVecTable = db
    .prepare(
      `
      select name
      from sqlite_master
      where type = 'table' and name = 'vec_kb_chunks'
    `,
    )
    .get();

  if (!hasVecTable) {
    db.exec(`
      create virtual table vec_kb_chunks using vec0(
        chunk_id text primary key,
        embedding float[${embeddingDimensions}] distance_metric=cosine
      );
    `);
  }
}

function computeContentHash(item) {
  const canonical = JSON.stringify({
    chunk_type: item.chunk_type,
    category: item.category,
    title: item.title,
    text: item.text,
    keywords: item.keywords,
    source_ids: item.source_ids,
    source_titles: item.source_titles,
    display_source: item.display_source,
  });

  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

function loadItems() {
  return fs
    .readFileSync(chunksPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

ensureBaseTables();

const items = loadItems().map((item) => ({
  ...item,
  keywords_json: JSON.stringify(item.keywords, null, 0),
  source_ids_json: JSON.stringify(item.source_ids, null, 0),
  source_titles_json: JSON.stringify(item.source_titles, null, 0),
  content_hash: computeContentHash(item),
}));

const existingRows = db
  .prepare(
    `
    select chunk_id as chunkId, content_hash as contentHash
    from kb_chunks
  `,
  )
  .all();

const existingMap = new Map(existingRows.map((row) => [row.chunkId, row.contentHash]));
const incomingIds = new Set(items.map((item) => item.chunk_id));
const removedIds = existingRows
  .map((row) => row.chunkId)
  .filter((chunkId) => !incomingIds.has(chunkId));

const deleteVector = db.prepare(`
  delete from vec_kb_chunks
  where chunk_id = ?
`);

const deleteChunk = db.prepare(`
  delete from kb_chunks
  where chunk_id = ?
`);

const upsertChangedChunk = db.prepare(`
  insert into kb_chunks (
    chunk_id,
    chunk_type,
    category,
    title,
    text,
    keywords,
    source_ids,
    source_titles,
    display_source,
    embedding_status,
    embedding_attempts,
    embedding_error,
    content_hash,
    updated_at
  ) values (
    @chunk_id,
    @chunk_type,
    @category,
    @title,
    @text,
    @keywords_json,
    @source_ids_json,
    @source_titles_json,
    @display_source,
    'pending',
    0,
    '',
    @content_hash,
    current_timestamp
  )
  on conflict(chunk_id) do update set
    chunk_type = excluded.chunk_type,
    category = excluded.category,
    title = excluded.title,
    text = excluded.text,
    keywords = excluded.keywords,
    source_ids = excluded.source_ids,
    source_titles = excluded.source_titles,
    display_source = excluded.display_source,
    embedding_status = 'pending',
    embedding_attempts = 0,
    embedding_error = '',
    content_hash = excluded.content_hash,
    updated_at = current_timestamp
`);

const insertUnchangedChunk = db.prepare(`
  insert into kb_chunks (
    chunk_id,
    chunk_type,
    category,
    title,
    text,
    keywords,
    source_ids,
    source_titles,
    display_source,
    content_hash,
    updated_at
  ) values (
    @chunk_id,
    @chunk_type,
    @category,
    @title,
    @text,
    @keywords_json,
    @source_ids_json,
    @source_titles_json,
    @display_source,
    @content_hash,
    current_timestamp
  )
  on conflict(chunk_id) do nothing
`);

let insertedCount = 0;
let updatedCount = 0;
let unchangedCount = 0;

const syncTransaction = db.transaction(() => {
  for (const removedId of removedIds) {
    deleteVector.run(removedId);
    deleteChunk.run(removedId);
  }

  for (const item of items) {
    const existingHash = existingMap.get(item.chunk_id);
    if (!existingHash) {
      upsertChangedChunk.run(item);
      insertedCount += 1;
      continue;
    }

    if (existingHash !== item.content_hash) {
      deleteVector.run(item.chunk_id);
      upsertChangedChunk.run(item);
      updatedCount += 1;
      continue;
    }

    insertUnchangedChunk.run(item);
    unchangedCount += 1;
  }
});

syncTransaction();

const chunkCount = db.prepare("select count(*) as count from kb_chunks").get().count;
const pendingCount = db
  .prepare("select count(*) as count from kb_chunks where embedding_status != 'ready'")
  .get().count;
const vectorCount = db.prepare("select count(*) as count from vec_kb_chunks").get().count;
const vecVersion = db.prepare("select vec_version() as version").get().version;

const manifestPath = path.join(path.dirname(dbPath), "manifest.json");
const existingManifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : {};

fs.writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      ...existingManifest,
      db_path: dbPath,
      chunk_count: chunkCount,
      embedding_dimensions: embeddingDimensions,
      sqlite_vec_version: vecVersion,
      vector_rows: vectorCount,
      ready_for_embeddings: true,
      pending_count: pendingCount,
      last_sync: {
        inserted_count: insertedCount,
        updated_count: updatedCount,
        removed_count: removedIds.length,
        unchanged_count: unchangedCount,
      },
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

console.log(`Synchronized sqlite-vec database at ${dbPath}`);
console.log(`sqlite-vec version: ${vecVersion}`);
console.log(
  `rows=${chunkCount}, vectors=${vectorCount}, pending=${pendingCount}, inserted=${insertedCount}, updated=${updatedCount}, removed=${removedIds.length}, unchanged=${unchangedCount}`,
);

db.close();
