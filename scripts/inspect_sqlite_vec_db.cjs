const path = require("node:path");
const fs = require("node:fs");

const Database = require("better-sqlite3");
const sqliteVec = require("sqlite-vec");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

const rootDir = path.join(__dirname, "..");
const dbPath = path.resolve(
  rootDir,
  process.env.SQLITE_VEC_DB_PATH || "./data/sqlite-vec/ecommerce-kb.db",
);

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
sqliteVec.load(db);

const chunkCount = db.prepare("select count(*) as count from kb_chunks").get().count;
const embeddedCount = db
  .prepare("select count(*) as count from kb_chunks where embedding_status = 'ready'")
  .get().count;
const vecVersion = db.prepare("select vec_version() as version").get().version;
const sample = db
  .prepare("select chunk_id, title, category, display_source, embedding_status, embedding_attempts, embedding_error from kb_chunks order by chunk_id limit 5")
  .all();

console.log(`db_path=${dbPath}`);
console.log(`vec_version=${vecVersion}`);
console.log(`chunk_count=${chunkCount}`);
console.log(`embedded_count=${embeddedCount}`);
console.log(JSON.stringify(sample, null, 2));
