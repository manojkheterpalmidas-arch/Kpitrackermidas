import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs, { Database, SqlJsStatic } from "sql.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "team-kpi-tracker.sqlite");
const keyPath = path.join(dataDir, ".local-key");

export const tables = [
  "team_members",
  "roles",
  "commitments",
  "tasks",
  "one_to_one_reviews",
  "kpis",
  "weekly_kpi_entries",
  "tags",
  "notes",
  "ai_settings",
  "audit_log",
  "app_settings"
] as const;

export type TableName = (typeof tables)[number];

let SQL: SqlJsStatic;
let db: Database;

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const defaultPinSalt = "team-kpi-tracker-default-pin-v1";
const defaultPinHash = "3c6642634a571ecfe895159f167f6cf4835a3573fe10363feb16b0d21d599c34";

export async function openDatabase() {
  fs.mkdirSync(dataDir, { recursive: true });
  SQL = await initSqlJs({
    locateFile: (file: string) => path.join(rootDir, "node_modules", "sql.js", "dist", file)
  });

  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  migrate();
  seed();
  enforceKpiTrackerMode();
  save();
}

export function getDb() {
  return db;
}

export function save() {
  const bytes = db.export();
  fs.writeFileSync(dbPath, Buffer.from(bytes));
}

export function backupPath() {
  save();
  return dbPath;
}

export function restoreFromBuffer(buffer: Buffer) {
  const next = new SQL.Database(buffer);
  db.close();
  db = next;
  migrate();
  save();
}

export function isKnownTable(table: string): table is TableName {
  return tables.includes(table as TableName);
}

export function queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql, params);
  const rows: T[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as T);
  stmt.free();
  return rows;
}

export function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return queryAll<T>(sql, params)[0];
}

export function run(sql: string, params: unknown[] = []) {
  db.run(sql, params);
  save();
}

export function insertRow(table: TableName, row: Record<string, unknown>) {
  const created = now();
  const payload: Record<string, unknown> = {
    id: row.id || id(),
    ...row,
    created_at: row.created_at || created,
    updated_at: created
  };
  const cols = Object.keys(payload);
  const placeholders = cols.map(() => "?").join(", ");
  db.run(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
    cols.map((col) => payload[col])
  );
  audit("create", table, String(payload.id));
  save();
  return payload;
}

export function updateRow(table: TableName, rowId: string, row: Record<string, unknown>) {
  const payload: Record<string, unknown> = { ...row, updated_at: now() };
  delete payload.id;
  delete payload.created_at;
  const cols = Object.keys(payload);
  if (!cols.length) return queryOne(`SELECT * FROM ${table} WHERE id = ?`, [rowId]);
  db.run(
    `UPDATE ${table} SET ${cols.map((col) => `${col} = ?`).join(", ")} WHERE id = ?`,
    [...cols.map((col) => payload[col]), rowId]
  );
  audit("update", table, rowId);
  save();
  return queryOne(`SELECT * FROM ${table} WHERE id = ?`, [rowId]);
}

export function deleteRow(table: TableName, rowId: string) {
  db.run(`DELETE FROM ${table} WHERE id = ?`, [rowId]);
  audit("delete", table, rowId);
  save();
}

export function encryptSecret(value: string) {
  if (!value) return "";
  const key = getLocalKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(value: string) {
  if (!value) return "";
  try {
    const raw = Buffer.from(value, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", getLocalKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function getLocalKey() {
  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, crypto.randomBytes(32));
  }
  return fs.readFileSync(keyPath);
}

function audit(action: string, entity: string, entityId: string) {
  const timestamp = now();
  db.run(
    "INSERT INTO audit_log (id, action, entity, entity_id, detail, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id(), action, entity, entityId, "", timestamp, timestamp]
  );
}

function migrate() {
  db.run(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      region TEXT NOT NULL,
      business_type TEXT NOT NULL,
      target REAL DEFAULT 0,
      kpi_type TEXT DEFAULT '',
      weekly_kpi_expectations TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commitments (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT NOT NULL,
      target_value REAL DEFAULT 0,
      actual_value REAL DEFAULT 0,
      status TEXT NOT NULL,
      reason_if_missed TEXT DEFAULT '',
      manager_comment TEXT DEFAULT '',
      priority TEXT DEFAULT 'Medium',
      due_date TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(person_id) REFERENCES team_members(id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      owner_id TEXT NOT NULL,
      priority TEXT DEFAULT 'Medium',
      due_date TEXT DEFAULT '',
      status TEXT DEFAULT 'Open',
      tags TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      recurring TEXT DEFAULT 'No',
      completed_date TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS one_to_one_reviews (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      review_date TEXT NOT NULL,
      wins TEXT DEFAULT '',
      blockers TEXT DEFAULT '',
      commitments_reviewed TEXT DEFAULT '',
      performance_notes TEXT DEFAULT '',
      coaching_points TEXT DEFAULT '',
      action_items TEXT DEFAULT '',
      manager_feedback TEXT DEFAULT '',
      employee_concerns TEXT DEFAULT '',
      followup_date TEXT DEFAULT '',
      private_manager_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kpis (
      id TEXT PRIMARY KEY,
      person_id TEXT DEFAULT '',
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      cadence TEXT DEFAULT 'Weekly',
      target REAL DEFAULT 0,
      unit TEXT DEFAULT 'count',
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weekly_kpi_entries (
      id TEXT PRIMARY KEY,
      kpi_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_type TEXT DEFAULT 'Weekly',
      target_value REAL DEFAULT 0,
      actual_value REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#2563eb',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      title TEXT DEFAULT '',
      body TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_settings (
      id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      provider TEXT DEFAULT 'DeepSeek',
      endpoint TEXT DEFAULT 'https://api.deepseek.com/chat/completions',
      model TEXT DEFAULT 'deepseek-chat',
      encrypted_api_key TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      detail TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function seed() {
  const existing = queryOne<{ count: number }>("SELECT COUNT(*) as count FROM team_members");
  if (existing && existing.count > 0) return;

  const timestamp = now();
  const memberRows = [
    ["manoj", "Manoj", "Team Lead", "UK/Ireland", "Team Leadership", 0, "Management KPIs", "Assign weekly KPIs, complete reviews, remove blockers, track team progress"],
    ["sunny", "Sunny", "UK New Business Development Manager", "UK", "KPI Tracked Role", 0, "Weekly Activity KPIs", "Weekly assigned activity targets, follow-ups, progress updates"],
    ["suraj", "Suraj", "Ireland New Business Development Manager", "Ireland", "KPI Tracked Role", 0, "Weekly Activity KPIs", "Weekly assigned activity targets, follow-ups, progress updates"],
    ["michal", "Michal", "UK and Ireland University Business Development Manager", "University", "KPI Tracked Role", 0, "Weekly Activity KPIs", "Weekly assigned activity targets, follow-ups, progress updates"],
    ["oussama-s", "Oussama S", "French Speaking Europe Existing Business Manager", "French Speaking Europe", "KPI Tracked Role", 0, "Weekly Activity KPIs", "Weekly assigned activity targets, follow-ups, progress updates"],
    ["oussama-b", "Oussama B", "French Speaking Europe New Business Development Manager", "French Speaking Europe", "KPI Tracked Role", 0, "Weekly Activity KPIs", "Weekly assigned activity targets, follow-ups, progress updates"],
    ["mohammed", "Mohammed", "French Tech Support Engineer", "French Speaking Europe", "Technical Support", 0, "Support KPIs", "Cases handled, blockers resolved, demo support, enablement notes"]
  ];

  for (const [memberId, name, role, region, businessType, target, kpiType, expectations] of memberRows) {
    db.run(
      "INSERT INTO team_members VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
      [memberId, name, role, region, businessType, target, kpiType, expectations, timestamp, timestamp]
    );
  }

  for (const role of ["Team Lead", "BD Manager", "Technical Support Engineer", "University BD Manager"]) {
    db.run("INSERT INTO roles VALUES (?, ?, ?, ?, ?)", [id(), role, "", timestamp, timestamp]);
  }

  seedKpiTrackerWork(timestamp);

  const tags = ["weekly-kpi", "review", "follow-up", "support", "university", "french", "blocked"];
  for (const tag of tags) db.run("INSERT INTO tags VALUES (?, ?, ?, ?, ?)", [id(), tag, "#2563eb", timestamp, timestamp]);

  db.run("INSERT INTO ai_settings VALUES (?, 0, 'DeepSeek', 'https://api.deepseek.com/chat/completions', 'deepseek-chat', '', ?, ?)", ["default", timestamp, timestamp]);
  db.run("INSERT INTO app_settings VALUES (?, 'theme', 'light', ?, ?)", [id(), timestamp, timestamp]);
  db.run("INSERT INTO app_settings VALUES (?, 'lock_enabled', '1', ?, ?)", [id(), timestamp, timestamp]);
  db.run("INSERT INTO app_settings VALUES (?, 'pin_salt', ?, ?, ?)", [id(), defaultPinSalt, timestamp, timestamp]);
  db.run("INSERT INTO app_settings VALUES (?, 'pin_hash', ?, ?, ?)", [id(), defaultPinHash, timestamp, timestamp]);
}

function enforceKpiTrackerMode() {
  const current = queryOne<{ value: string }>("SELECT value FROM app_settings WHERE key = 'kpi_tracker_mode'");
  if (current?.value === "1") return;

  const timestamp = now();
  db.run("DROP TABLE IF EXISTS accounts");
  db.run("DROP TABLE IF EXISTS contacts");
  db.run("DROP TABLE IF EXISTS opportunities");
  db.run("DROP TABLE IF EXISTS meetings");
  db.run("DELETE FROM commitments");
  db.run("DELETE FROM tasks");
  db.run("DELETE FROM kpis");
  db.run("DELETE FROM weekly_kpi_entries");
  db.run("DELETE FROM tags");

  const updates = [
    ["manoj", "Team Lead", "Team Leadership", "Management KPIs", "Assign weekly KPIs, complete reviews, remove blockers, track team progress"],
    ["sunny", "UK New Business Development Manager", "KPI Tracked Role", "Weekly Activity KPIs", "Weekly assigned activity targets, follow-ups, progress updates"],
    ["suraj", "Ireland New Business Development Manager", "KPI Tracked Role", "Weekly Activity KPIs", "Weekly assigned activity targets, follow-ups, progress updates"],
    ["michal", "UK and Ireland University Business Development Manager", "KPI Tracked Role", "Weekly Activity KPIs", "Weekly assigned activity targets, follow-ups, progress updates"],
    ["oussama-s", "French Speaking Europe Existing Business Manager", "KPI Tracked Role", "Weekly Activity KPIs", "Weekly assigned activity targets, follow-ups, progress updates"],
    ["oussama-b", "French Speaking Europe New Business Development Manager", "KPI Tracked Role", "Weekly Activity KPIs", "Weekly assigned activity targets, follow-ups, progress updates"],
    ["mohammed", "French Tech Support Engineer", "Technical Support", "Support KPIs", "Cases handled, blockers resolved, demo support, enablement notes"]
  ];
  for (const [memberId, role, businessType, kpiType, expectations] of updates) {
    db.run(
      "UPDATE team_members SET role = ?, business_type = ?, target = 0, kpi_type = ?, weekly_kpi_expectations = ?, updated_at = ? WHERE id = ?",
      [role, businessType, kpiType, expectations, timestamp, memberId]
    );
  }

  seedKpiTrackerWork(timestamp);
  for (const tag of ["weekly-kpi", "review", "follow-up", "support", "university", "french", "blocked"]) {
    db.run("INSERT INTO tags VALUES (?, ?, ?, ?, ?)", [id(), tag, "#2563eb", timestamp, timestamp]);
  }
  db.run(
    "INSERT OR REPLACE INTO app_settings (id, key, value, created_at, updated_at) VALUES (COALESCE((SELECT id FROM app_settings WHERE key = 'kpi_tracker_mode'), ?), 'kpi_tracker_mode', '1', COALESCE((SELECT created_at FROM app_settings WHERE key = 'kpi_tracker_mode'), ?), ?)",
    [id(), timestamp, timestamp]
  );
}

function seedKpiTrackerWork(timestamp: string) {
  const weekStart = currentMonday();
  const commitmentTemplates: Record<string, string[]> = {
    manoj: ["Assign weekly KPIs to every team member", "Complete Friday KPI review", "Document team blockers and actions"],
    sunny: ["Update all assigned weekly KPI actuals", "Complete priority follow-ups", "Submit Friday progress note"],
    suraj: ["Update all assigned weekly KPI actuals", "Complete priority follow-ups", "Submit Friday progress note"],
    michal: ["Update all assigned weekly KPI actuals", "Complete university activity log", "Submit Friday progress note"],
    "oussama-s": ["Update all assigned weekly KPI actuals", "Complete French region activity log", "Submit Friday progress note"],
    "oussama-b": ["Update all assigned weekly KPI actuals", "Complete French region activity log", "Submit Friday progress note"],
    mohammed: ["Update all assigned support KPI actuals", "Document open blockers", "Submit Friday support note"]
  };
  Object.entries(commitmentTemplates).forEach(([personId, titles]) => {
    titles.forEach((titleText, index) => {
      const status = index === 2 ? "Done" : index === 0 ? "In Progress" : "Not Started";
      db.run(
        "INSERT INTO commitments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id(), personId, weekStart, titleText, "", "KPI Review", 1, status === "Done" ? 1 : 0, status, "", "", index === 0 ? "High" : "Medium", daysFromNow(index + 1), timestamp, timestamp]
      );
    });
  });

  const tasks = [
    ["Prepare Monday KPI plan", "Confirm each person has a clear weekly KPI target.", "manoj", "High", daysFromNow(1), "In Progress", "weekly-kpi,review", "", "Weekly", ""],
    ["Review overdue KPI updates", "Check missing actual values and ask for blockers.", "manoj", "High", daysFromNow(4), "Open", "weekly-kpi,follow-up", "", "Weekly", ""],
    ["Submit Friday KPI update", "Enter actuals and short notes before review.", "sunny", "Medium", daysFromNow(5), "Open", "weekly-kpi", "", "Weekly", ""],
    ["Submit Friday KPI update", "Enter actuals and short notes before review.", "suraj", "Medium", daysFromNow(5), "Open", "weekly-kpi", "", "Weekly", ""],
    ["Document support blockers", "Capture blockers that need manager support.", "mohammed", "Medium", daysFromNow(3), "Open", "support,blocked", "", "Weekly", ""]
  ];
  for (const task of tasks) {
    db.run("INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [id(), ...task, timestamp, timestamp]);
  }

  seedKpis(timestamp);
}

function seedKpis(timestamp: string) {
  const definitions: Record<string, string[]> = {
    sunny: ["Assigned activities completed", "Weekly updates submitted", "Follow-ups completed", "Quality notes added", "Blocked items escalated"],
    suraj: ["Assigned activities completed", "Weekly updates submitted", "Follow-ups completed", "Quality notes added", "Blocked items escalated"],
    michal: ["University activities completed", "Weekly updates submitted", "Follow-ups completed", "Quality notes added", "Blocked items escalated"],
    "oussama-s": ["French region activities completed", "Weekly updates submitted", "Follow-ups completed", "Quality notes added", "Blocked items escalated"],
    "oussama-b": ["French region activities completed", "Weekly updates submitted", "Follow-ups completed", "Quality notes added", "Blocked items escalated"],
    mohammed: ["Support cases handled", "Demo support completed", "Technical blockers resolved", "Knowledge notes added", "Weekly updates submitted"],
    manoj: ["Team KPI assignments completed", "One-to-one reviews completed", "Team blockers resolved", "Friday review completion", "Manager follow-ups completed"]
  };
  const weekStart = currentMonday();
  Object.entries(definitions).forEach(([personId, names]) => {
    names.forEach((name, index) => {
      const kpiId = id();
      const target = index === 4 ? 0 : index + 2;
      db.run("INSERT INTO kpis VALUES (?, ?, ?, ?, 'Weekly', ?, ?, 1, ?, ?)", [kpiId, personId, name, "", target, "count", timestamp, timestamp]);
      db.run("INSERT INTO weekly_kpi_entries VALUES (?, ?, ?, ?, 'Weekly', ?, ?, ?, ?, ?)", [id(), kpiId, personId, weekStart, target, Math.max(0, target - index), "", timestamp, timestamp]);
    });
  });
}

function currentMonday() {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return formatLocalDate(date);
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function daysAgo(days: number) {
  return daysFromNow(-days);
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
