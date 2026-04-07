import { getWriteDb } from "./db";

export type RerankerSettings = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  endpoint: string;
  updatedAt?: string;
};

const DEFAULT_SETTINGS: RerankerSettings = {
  enabled: false,
  baseUrl: "",
  apiKey: "",
  model: "",
  endpoint: "rerank",
};

function ensureConfigTable() {
  const db = getWriteDb();
  db.exec(`
    create table if not exists rag_runtime_config (
      config_key text primary key,
      config_value text not null default '',
      updated_at text not null default current_timestamp
    );
  `);
  db.close();
}

function upsertConfigValue(key: string, value: string) {
  const db = getWriteDb();
  db.prepare(
    `
    insert into rag_runtime_config (config_key, config_value, updated_at)
    values (?, ?, current_timestamp)
    on conflict(config_key) do update set
      config_value = excluded.config_value,
      updated_at = current_timestamp
  `,
  ).run(key, value);
  db.close();
}

function readConfigValue(key: string) {
  const db = getWriteDb();
  const row = db.prepare(
    `
    select config_value as value, updated_at as updatedAt
    from rag_runtime_config
    where config_key = ?
  `,
  ).get(key) as { value: string; updatedAt: string } | undefined;
  db.close();
  return row;
}

export function getRerankerSettings(): RerankerSettings {
  ensureConfigTable();

  const enabled = readConfigValue("reranker.enabled")?.value;
  const baseUrl = readConfigValue("reranker.base_url");
  const apiKey = readConfigValue("reranker.api_key");
  const model = readConfigValue("reranker.model");
  const endpoint = readConfigValue("reranker.endpoint");

  return {
    enabled: enabled === "true",
    baseUrl: baseUrl?.value || "",
    apiKey: apiKey?.value || "",
    model: model?.value || "",
    endpoint: endpoint?.value || DEFAULT_SETTINGS.endpoint,
    updatedAt:
      endpoint?.updatedAt ||
      model?.updatedAt ||
      apiKey?.updatedAt ||
      baseUrl?.updatedAt ||
      undefined,
  };
}

export function saveRerankerSettings(input: Partial<RerankerSettings>) {
  ensureConfigTable();
  const merged = {
    ...DEFAULT_SETTINGS,
    ...getRerankerSettings(),
    ...input,
  };

  upsertConfigValue("reranker.enabled", String(Boolean(merged.enabled)));
  upsertConfigValue("reranker.base_url", merged.baseUrl || "");
  upsertConfigValue("reranker.api_key", merged.apiKey || "");
  upsertConfigValue("reranker.model", merged.model || "");
  upsertConfigValue("reranker.endpoint", merged.endpoint || DEFAULT_SETTINGS.endpoint);

  return getRerankerSettings();
}
