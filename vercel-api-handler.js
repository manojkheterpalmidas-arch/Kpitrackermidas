import { requestHandler } from "./dist/server/index.js";

export function handleVercel(req, res, basePath = "/api", paramName = "path") {
  normalizeCatchAll(req, basePath, paramName);
  return requestHandler(req, res);
}

export function handleTableRow(req, res) {
  const table = first(req.query?.table);
  const id = first(req.query?.id);
  if (table && id) {
    const query = queryString(req.query || {}, new Set(["table", "id"]));
    req.url = `/api/table/${encodeURIComponent(table)}/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;
  }
  return requestHandler(req, res);
}

function normalizeCatchAll(req, basePath, paramName) {
  const raw = req.query?.[paramName];
  if (!raw) return;
  const parts = (Array.isArray(raw) ? raw : String(raw).split("/")).filter(Boolean);
  const suffix = parts.map((part) => encodeURIComponent(part)).join("/");
  const query = queryString(req.query || {}, new Set([paramName]));
  req.url = `${basePath}${suffix ? `/${suffix}` : ""}${query ? `?${query}` : ""}`;
}

function queryString(query, skip) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (skip.has(key)) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) params.append(key, String(item));
    }
  }
  return params.toString();
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}
