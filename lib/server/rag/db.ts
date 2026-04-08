import path from "node:path";

import { RetrievedChunk } from "./types";

function getDbPath() {
  return path.resolve(
    process.cwd(),
    process.env.SQLITE_VEC_DB_PATH || "./data/sqlite-vec/ecommerce-kb.db",
  );
}

function parseKeywords(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function getVecExtensionPath() {
  const root = path.resolve(process.cwd(), "node_modules");

  if (process.platform === "win32") {
    return path.join(root, "sqlite-vec-windows-x64", "vec0.dll");
  }

  if (process.platform === "linux") {
    return path.join(root, "sqlite-vec-linux-x64", "vec0.so");
  }

  if (process.platform === "darwin") {
    return path.join(root, "sqlite-vec-darwin-x64", "vec0.dylib");
  }

  throw new Error(`Unsupported platform for sqlite-vec extension: ${process.platform}`);
}

export function getDb() {
  const Database = require("better-sqlite3");
  const dbPath = getDbPath();
  const db = new Database(dbPath, { readonly: true });
  db.loadExtension(getVecExtensionPath());
  return db;
}

export function getWriteDb() {
  const Database = require("better-sqlite3");
  return new Database(getDbPath());
}

function mapRows(
  rows: Array<{
    chunkId: string;
    title: string;
    category: string;
    displaySource: string;
    text: string;
    keywords: string;
    distance: number | null;
  }>,
): RetrievedChunk[] {
  return rows.map((row) => ({
    ...row,
    keywords: parseKeywords(row.keywords),
  }));
}

export function getAllChunks(): RetrievedChunk[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      select
        chunk_id as chunkId,
        title as title,
        category as category,
        display_source as displaySource,
        text as text,
        keywords as keywords,
        null as distance
      from kb_chunks
      order by chunk_id
    `,
    )
    .all() as Array<{
      chunkId: string;
      title: string;
      category: string;
      displaySource: string;
      text: string;
      keywords: string;
      distance: null;
    }>;

  return mapRows(rows);
}

export function getChunksByCategory(category: string): RetrievedChunk[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      select
        chunk_id as chunkId,
        title as title,
        category as category,
        display_source as displaySource,
        text as text,
        keywords as keywords,
        null as distance
      from kb_chunks
      where category = ?
      order by chunk_id
    `,
    )
    .all(category) as Array<{
      chunkId: string;
      title: string;
      category: string;
      displaySource: string;
      text: string;
      keywords: string;
      distance: null;
    }>;

  return mapRows(rows);
}

export function getChunksByPrefix(prefix: string): RetrievedChunk[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      select
        chunk_id as chunkId,
        title as title,
        category as category,
        display_source as displaySource,
        text as text,
        keywords as keywords,
        null as distance
      from kb_chunks
      where chunk_id like ?
      order by chunk_id
    `,
    )
    .all(`${prefix}-%`) as Array<{
      chunkId: string;
      title: string;
      category: string;
      displaySource: string;
      text: string;
      keywords: string;
      distance: null;
    }>;

  return mapRows(rows);
}
