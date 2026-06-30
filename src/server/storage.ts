import crypto from "node:crypto";
import {
  backupPath as sqliteBackupPath,
  deleteRow as sqliteDeleteRow,
  decryptSecret as sqliteDecryptSecret,
  encryptSecret as sqliteEncryptSecret,
  insertRow as sqliteInsertRow,
  isKnownTable,
  openDatabase,
  queryAll,
  queryOne,
  restoreFromBuffer as sqliteRestoreFromBuffer,
  run,
  tables,
  updateRow as sqliteUpdateRow,
  type TableName
} from "./db.js";

export { isKnownTable, tables, type TableName };

export type Row = Record<string, unknown>;
export type AppData = Record<TableName, Row[]>;
export type StorageMode = "sqlite" | "supabase";

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function supabaseConfig() {
  const url = process.env.SUPABASE_URL ? supabaseRestUrl(process.env.SUPABASE_URL) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return url && key ? { url, key } : undefined;
}

function supabaseRestUrl(value: string) {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed.endsWith("/rest/v1") ? trimmed : `${trimmed}/rest/v1`;
}

export function storageMode(): StorageMode {
  return supabaseConfig() ? "supabase" : "sqlite";
}

export async function openStorage() {
  if (storageMode() === "sqlite") {
    await openDatabase();
    return;
  }
  await supabaseRequest("app_settings?select=id&limit=1");
}

export async function readTable<T extends Row = Row>(table: TableName): Promise<T[]> {
  if (storageMode() === "sqlite") {
    return queryAll<T>(`SELECT * FROM ${table} ORDER BY updated_at DESC`);
  }
  const rows = await supabaseRequest<T[]>(`${table}?select=*`);
  return rows.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
}

export async function readAllTables(): Promise<AppData> {
  const entries = await Promise.all(tables.map(async (table) => [table, await readTable(table)] as const));
  return Object.fromEntries(entries) as AppData;
}

export async function insertRow(table: TableName, row: Row) {
  if (storageMode() === "sqlite") return sqliteInsertRow(table, row);
  const created = now();
  const payload: Row = {
    id: row.id || id(),
    ...row,
    created_at: row.created_at || created,
    updated_at: created
  };
  const [createdRow] = await supabaseRequest<Row[]>(table, {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  void audit("create", table, String(createdRow?.id || payload.id)).catch(() => {});
  return createdRow || payload;
}

export async function updateRow(table: TableName, rowId: string, row: Row) {
  if (storageMode() === "sqlite") return sqliteUpdateRow(table, rowId, row);
  const payload: Row = { ...row, updated_at: now() };
  delete payload.id;
  delete payload.created_at;
  const [updated] = await supabaseRequest<Row[]>(`${table}?id=eq.${encodeURIComponent(rowId)}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  void audit("update", table, rowId).catch(() => {});
  return updated;
}

export async function deleteRow(table: TableName, rowId: string) {
  if (storageMode() === "sqlite") {
    sqliteDeleteRow(table, rowId);
    return;
  }
  await supabaseRequest(`${table}?id=eq.${encodeURIComponent(rowId)}`, { method: "DELETE" });
  void audit("delete", table, rowId).catch(() => {});
}

export async function getSetting(key: string) {
  if (storageMode() === "sqlite") {
    return queryOne<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key])?.value || "";
  }
  const rows = await supabaseRequest<Array<{ value: string }>>(`app_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
  return rows[0]?.value || "";
}

export async function setSetting(key: string, value: string) {
  const timestamp = now();
  if (storageMode() === "sqlite") {
    const existing = queryOne<{ id: string }>("SELECT id FROM app_settings WHERE key = ?", [key]);
    if (existing) run("UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?", [value, timestamp, key]);
    else run("INSERT INTO app_settings (id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", [id(), key, value, timestamp, timestamp]);
    return;
  }

  const existing = await supabaseRequest<Array<{ id: string; created_at: string }>>(`app_settings?key=eq.${encodeURIComponent(key)}&select=id,created_at&limit=1`);
  if (existing[0]) {
    await supabaseRequest(`app_settings?key=eq.${encodeURIComponent(key)}`, {
      method: "PATCH",
      body: JSON.stringify({ value, updated_at: timestamp })
    });
  } else {
    await supabaseRequest("app_settings", {
      method: "POST",
      body: JSON.stringify({ id: id(), key, value, created_at: timestamp, updated_at: timestamp })
    });
  }
}

export function backupPath() {
  if (storageMode() !== "sqlite") throw new Error("SQLite backup files are only available in local mode.");
  return sqliteBackupPath();
}

export function restoreFromBuffer(buffer: Buffer) {
  if (storageMode() !== "sqlite") throw new Error("SQLite restore is only available in local mode. Use Supabase import tools for the web database.");
  sqliteRestoreFromBuffer(buffer);
}

export async function exportAllRows() {
  return readAllTables();
}

export function encryptSecret(value: string) {
  if (!value) return "";
  const key = secretKey();
  if (!key) return sqliteEncryptSecret(value);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `env:v1:${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

export function decryptSecret(value: string) {
  if (!value) return "";
  if (!value.startsWith("env:v1:")) return sqliteDecryptSecret(value);
  const key = secretKey();
  if (!key) return "";
  try {
    const raw = Buffer.from(value.slice("env:v1:".length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function secretKey() {
  const secret = process.env.APP_SECRET;
  return secret ? crypto.createHash("sha256").update(secret).digest() : undefined;
}

async function audit(action: string, entity: string, entityId: string) {
  if (storageMode() !== "supabase" || entity === "audit_log") return;
  const timestamp = now();
  await supabaseRequest("audit_log", {
    method: "POST",
    body: JSON.stringify({ id: id(), action, entity, entity_id: entityId, detail: "", created_at: timestamp, updated_at: timestamp })
  });
}

async function supabaseRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const response = await fetch(`${config.url}/${path}`, {
    ...init,
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}
