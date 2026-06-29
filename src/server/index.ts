import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import {
  backupPath,
  decryptSecret,
  deleteRow,
  encryptSecret,
  exportAllRows,
  getSetting,
  insertRow,
  isKnownTable,
  openStorage,
  readAllTables,
  readTable,
  restoreFromBuffer,
  setSetting,
  storageMode,
  tables,
  updateRow
} from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const publicDir = path.join(rootDir, "public");
const distDir = path.join(rootDir, "dist");

loadEnvFile(path.join(rootDir, ".env"));

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || (storageMode() === "supabase" ? "0.0.0.0" : "127.0.0.1");

type RequestBody = Record<string, unknown>;
const doneStatuses = new Set(["Done", "Completed"]);

await openStorage();

export async function requestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(res, url.pathname);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    json(res, 500, { error: message });
  }
}

if (!process.env.VERCEL) {
  const server = http.createServer(requestHandler);
  server.listen(port, host, () => {
    console.log(`Team KPI Tracker running on ${host}:${port} using ${storageMode()} storage`);
  });
}

let appUnlocked = false;

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const parts = url.pathname.split("/").filter(Boolean);
  const method = req.method || "GET";

  if (url.pathname.startsWith("/api/security/")) {
    await handleSecurity(req, res, url);
    return;
  }

  if (method === "GET" && url.pathname === "/api/health") {
    json(res, 200, { ok: true, storage: storageMode(), locked: await isLocked() });
    return;
  }

  if (await isLocked()) {
    json(res, 423, { locked: true, error: "App is locked." });
    return;
  }

  if (method === "GET" && url.pathname === "/api/bootstrap") {
    json(res, 200, await bootstrap());
    return;
  }

  if (method === "GET" && url.pathname === "/api/backup") {
    if (storageMode() === "supabase") {
      json(res, 200, { storage: "supabase", exported_at: new Date().toISOString(), data: await exportAllRows() });
      return;
    }
    const file = backupPath();
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="team-kpi-tracker-backup-${new Date().toISOString().slice(0, 10)}.sqlite"`
    });
    fs.createReadStream(file).pipe(res);
    return;
  }

  if (method === "POST" && url.pathname === "/api/restore") {
    const body = await parseBody(req);
    const base64 = String(body.base64 || "");
    if (!base64) throw new Error("Missing restore file data.");
    restoreFromBuffer(Buffer.from(base64, "base64"));
    json(res, 200, { ok: true });
    return;
  }

  if (method === "POST" && url.pathname === "/api/import") {
    const body = await parseBody(req);
    json(res, 200, await importRows(String(body.table || ""), body.rows));
    return;
  }

  if (method === "GET" && parts[1] === "export" && parts[2]) {
    await exportTable(res, parts[2], url.searchParams.get("format") || "csv");
    return;
  }

  if (method === "POST" && url.pathname === "/api/commitments/carry-forward") {
    const body = await parseBody(req);
    json(res, 200, await carryForward(String(body.week_start || currentMonday())));
    return;
  }

  if (method === "POST" && url.pathname === "/api/ai/generate") {
    const body = await parseBody(req);
    json(res, 200, await generateAi(body));
    return;
  }

  if (parts[1] === "table" && parts[2]) {
    const table = parts[2];
    const rowId = parts[3] || url.searchParams.get("id") || "";
    if (!isKnownTable(table)) throw new Error("Unknown table.");
    if (method === "GET") {
      json(res, 200, { data: await readTable(table) });
      return;
    }
    if (method === "POST") {
      const body = await parseBody(req);
      const prepared = prepareRow(table, body);
      json(res, 201, { data: await insertRow(table, prepared) });
      return;
    }
    if (method === "PUT" && rowId) {
      const body = await parseBody(req);
      const prepared = prepareRow(table, body, true);
      json(res, 200, { data: await updateRow(table, rowId, prepared) });
      return;
    }
    if (method === "DELETE" && rowId) {
      await deleteRow(table, rowId);
      json(res, 200, { ok: true });
      return;
    }
  }

  json(res, 404, { error: "Not found" });
}

async function handleSecurity(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const method = req.method || "GET";
  if (method === "GET" && url.pathname === "/api/security/status") {
    json(res, 200, { lock_enabled: await setting("lock_enabled") === "1", locked: await isLocked() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/security/unlock") {
    const body = await parseBody(req);
    const pin = String(body.pin || "");
    if (!await verifyPin(pin)) throw new Error("Incorrect PIN.");
    appUnlocked = true;
    json(res, 200, { ok: true, locked: false });
    return;
  }

  if (await isLocked() && url.pathname !== "/api/security/lock") {
    json(res, 423, { locked: true, error: "App is locked." });
    return;
  }

  if (method === "POST" && url.pathname === "/api/security/set-pin") {
    const body = await parseBody(req);
    const pin = String(body.pin || "");
    const currentPin = String(body.current_pin || "");
    if (pin.length < 4) throw new Error("PIN must be at least 4 characters.");
    if (await setting("lock_enabled") === "1" && !await verifyPin(currentPin)) throw new Error("Enter the current PIN to change it.");
    const salt = crypto.randomBytes(16).toString("hex");
    await setSetting("pin_salt", salt);
    await setSetting("pin_hash", hashPin(pin, salt));
    await setSetting("lock_enabled", "1");
    appUnlocked = true;
    json(res, 200, { ok: true, lock_enabled: true, locked: false });
    return;
  }

  if (method === "POST" && url.pathname === "/api/security/disable") {
    const body = await parseBody(req);
    const pin = String(body.pin || "");
    if (await setting("lock_enabled") === "1" && !await verifyPin(pin)) throw new Error("Incorrect PIN.");
    await setSetting("lock_enabled", "0");
    await setSetting("pin_salt", "");
    await setSetting("pin_hash", "");
    appUnlocked = false;
    json(res, 200, { ok: true, lock_enabled: false });
    return;
  }

  if (method === "POST" && url.pathname === "/api/security/lock") {
    appUnlocked = false;
    json(res, 200, { ok: true, locked: await isLocked() });
    return;
  }

  json(res, 404, { error: "Not found" });
}

async function bootstrap() {
  const data = await readAllTables();
  return {
    data,
    summary: dashboardSummary(data),
    risks: riskCards(data),
    reports: reports(data)
  };
}

function dashboardSummary(data: Record<string, RequestBody[]>) {
  const week = currentMonday();
  const todayValue = today();
  const commitments = rows(data, "commitments");
  const weekCommitments = commitments.filter((row) => row.week_start === week);
  const entries = rows(data, "weekly_kpi_entries").filter((row) => row.period_start === week);
  const tasks = rows(data, "tasks");
  return {
    commitments_total: weekCommitments.length,
    commitments_done: weekCommitments.filter((row) => row.status === "Done").length,
    commitments_pending: weekCommitments.filter((row) => row.status !== "Done").length,
    weekly_kpis_assigned: entries.length,
    weekly_kpis_met: entries.filter((row) => Number(row.actual_value || 0) >= Number(row.target_value || 0)).length,
    weekly_kpis_behind: entries.filter((row) => Number(row.actual_value || 0) < Number(row.target_value || 0)).length,
    overdue_followups: tasks.filter((row) => String(row.due_date || "") < todayValue && !doneStatuses.has(String(row.status || ""))).length,
    reviews_completed: rows(data, "one_to_one_reviews").filter((row) => String(row.review_date || "") >= week).length,
    manoj_workload: tasks.filter((row) => row.owner_id === "manoj" && !doneStatuses.has(String(row.status || ""))).length
      + commitments.filter((row) => row.person_id === "manoj" && row.status !== "Done").length
  };
}

function riskCards(data: Record<string, RequestBody[]>) {
  const todayValue = today();
  const kpis = rows(data, "kpis");
  const overdue = rows(data, "tasks")
    .filter((row) => String(row.due_date || "") < todayValue && !doneStatuses.has(String(row.status || "")))
    .map((row) => ({ type: "Overdue action", title: row.title, detail: row.due_date, owner_id: row.owner_id }));
  const missed = rows(data, "commitments")
    .filter((row) => row.status === "Missed")
    .map((row) => ({ type: "Missed commitment", title: row.title, detail: row.reason_if_missed, owner_id: row.person_id }));
  const behindKpis = rows(data, "weekly_kpi_entries")
    .filter((row) => row.period_start === currentMonday() && Number(row.actual_value || 0) < Number(row.target_value || 0))
    .map((row) => ({ type: "KPI behind target", title: kpis.find((kpi) => kpi.id === row.kpi_id)?.name || row.kpi_id, detail: `${row.actual_value}/${row.target_value}`, owner_id: row.person_id }));
  return [...overdue, ...missed, ...behindKpis];
}

function reports(data: Record<string, RequestBody[]>) {
  const week = currentMonday();
  const people = rows(data, "team_members");
  const kpis = rows(data, "kpis");
  const entries = rows(data, "weekly_kpi_entries").filter((row) => row.period_start === week);
  const commitments = rows(data, "commitments").filter((row) => row.week_start === week);
  const overdue = rows(data, "tasks")
    .filter((row) => String(row.due_date || "") < today() && !doneStatuses.has(String(row.status || "")))
    .map((row) => ({ ...row, owner_name: nameFor(people, row.owner_id) }));

  return {
    weeklyTeam: groupedCounts(commitments, (row) => `${nameFor(people, row.person_id)}|${row.status}`).map(([key, count]) => {
      const [name, status] = key.split("|");
      return { name, status, count };
    }),
    kpiSummary: groupedCounts(entries, (row) => String(row.person_id || "")).map(([personId, assigned]) => {
      const mine = entries.filter((row) => row.person_id === personId);
      return { owner: nameFor(people, personId), assigned, met: mine.filter((row) => Number(row.actual_value || 0) >= Number(row.target_value || 0)).length };
    }),
    kpiDetails: entries.map((row) => ({
      owner: nameFor(people, row.person_id),
      name: kpis.find((kpi) => kpi.id === row.kpi_id)?.name || row.kpi_id,
      target_value: row.target_value,
      actual_value: row.actual_value,
      notes: row.notes
    })).sort((a, b) => `${a.owner} ${a.name}`.localeCompare(`${b.owner} ${b.name}`)),
    overdueActions: overdue,
    overdueFollowups: overdue
  };
}

function rows(data: Record<string, RequestBody[]>, table: string) {
  return data[table] || [];
}

function nameFor(people: RequestBody[], id: unknown) {
  return String(people.find((person) => person.id === id)?.name || id || "");
}

function groupedCounts(items: RequestBody[], keyFn: (item: RequestBody) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()];
}

function prepareRow(table: string, row: RequestBody, updating = false) {
  const copy = { ...row };
  if (table === "ai_settings" && typeof copy.api_key === "string") {
    copy.encrypted_api_key = copy.api_key ? encryptSecret(copy.api_key) : "";
    delete copy.api_key;
  }
  if (!updating) {
    if (table === "ai_settings" && !copy.id) copy.id = "default";
  }
  return copy;
}

async function isLocked() {
  return await setting("lock_enabled") === "1" && !appUnlocked;
}

async function verifyPin(pin: string) {
  const salt = await setting("pin_salt");
  const expected = await setting("pin_hash");
  return Boolean(pin && salt && expected && crypto.timingSafeEqual(Buffer.from(hashPin(pin, salt)), Buffer.from(expected)));
}

function hashPin(pin: string, salt: string) {
  return crypto.pbkdf2Sync(pin, salt, 150000, 32, "sha256").toString("hex");
}

async function setting(key: string) {
  return getSetting(key);
}

async function importRows(table: string, rows: unknown) {
  if (!isKnownTable(table)) throw new Error("Unknown import table.");
  if (!Array.isArray(rows)) throw new Error("Rows must be an array.");
  const existingRows = await readTable<RequestBody>(table);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of rows) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      skipped += 1;
      continue;
    }
    const row = item as RequestBody;
    const match = importMatch(table, row, existingRows);
    if (match?.id) {
      const next = await updateRow(table, String(match.id), row);
      const index = existingRows.findIndex((existing) => existing.id === match.id);
      if (index >= 0 && next) existingRows[index] = next as RequestBody;
      updated += 1;
    } else {
      const created = await insertRow(table, row);
      existingRows.push(created as RequestBody);
      inserted += 1;
    }
  }

  return { inserted, updated, skipped };
}

function importMatch(table: string, row: RequestBody, existingRows: RequestBody[]) {
  const id = String(row.id || "");
  if (id) {
    const byId = existingRows.find((existing) => String(existing.id || "") === id);
    if (byId) return byId;
  }
  if (table === "team_members" && row.name) {
    const name = String(row.name).trim().toLowerCase();
    return existingRows.find((existing) => String(existing.name || "").trim().toLowerCase() === name);
  }
  return undefined;
}

async function carryForward(weekStart: string) {
  const next = new Date(`${weekStart}T00:00:00`);
  next.setDate(next.getDate() + 7);
  const nextWeek = formatLocalDate(next);
  const unfinished = (await readTable<RequestBody>("commitments"))
    .filter((item) => item.week_start === weekStart && item.status !== "Done");
  const created = [];
  for (const item of unfinished) {
    created.push(await insertRow("commitments", {
    person_id: item.person_id,
    week_start: nextWeek,
    title: `Carry forward: ${item.title}`,
    description: item.description || "",
    category: item.category || "Other",
    target_value: item.target_value || 0,
    actual_value: 0,
    status: "Not Started",
    reason_if_missed: "",
    manager_comment: item.manager_comment || "",
    priority: item.priority || "Medium",
    due_date: nextWeek
    }));
  }
  return { created: created.length, next_week: nextWeek };
}

async function generateAi(body: RequestBody) {
  const settings = (await readTable<RequestBody>("ai_settings")).find((row) => row.id === "default");
  if (!settings || Number(settings.enabled) !== 1) throw new Error("AI is disabled in Settings.");
  const apiKey = decryptSecret(String(settings.encrypted_api_key || ""));
  if (!apiKey) throw new Error("Add a DeepSeek API key in Settings first.");

  const feature = String(body.feature || "Assistant");
  const selectedData = body.selectedData || {};
  const prompt = [
    "You are helping Manoj manage a small team through weekly KPI assignment, review, and coaching.",
    "Use only the selected data provided. Do not assume access to the rest of the database.",
    `Feature: ${feature}`,
    `User request: ${String(body.prompt || "")}`,
    `Selected data: ${JSON.stringify(selectedData, null, 2)}`
  ].join("\n\n");

  const response = await fetch(String(settings.endpoint), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: String(settings.model || "deepseek-chat"),
      messages: [
        { role: "system", content: "You are a concise, practical KPI management assistant." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI request failed: ${response.status} ${text.slice(0, 200)}`);
  }
  const jsonBody = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return { output: jsonBody.choices?.[0]?.message?.content || "No response returned." };
}

async function exportTable(res: http.ServerResponse, table: string, format: string) {
  if (!isKnownTable(table)) throw new Error("Unknown export table.");
  const rows = await readTable(table);
  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), table);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.writeHead(200, {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${table}.xlsx"`
    });
    res.end(buffer);
    return;
  }
  const csv = toCsv(rows);
  res.writeHead(200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${table}.csv"`
  });
  res.end(csv);
}

function serveStatic(res: http.ServerResponse, pathname: string) {
  const clean = pathname === "/" ? "/index.html" : pathname;
  const candidates = [
    path.join(publicDir, clean),
    path.join(distDir, clean.replace(/^\/client\//, "client/"))
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!file) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(file);
  const type = ext === ".html" ? "text/html" : ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "application/octet-stream";
  res.writeHead(200, {
    "content-type": `${type}; charset=utf-8`,
    "cache-control": "no-store, max-age=0"
  });
  fs.createReadStream(file).pipe(res);
}

function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals <= 0) continue;
    const key = trimmed.slice(0, equals).trim();
    const rawValue = trimmed.slice(equals + 1).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

async function parseBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) as RequestBody : {};
}

function json(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

function today() {
  return formatLocalDate(new Date());
}

function currentMonday() {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return formatLocalDate(date);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatLocalDate(date);
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
