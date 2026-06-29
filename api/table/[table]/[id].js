import { requestHandler } from "../../../dist/server/index.js";

export default function handler(req, res) {
  const table = first(req.query?.table);
  const id = first(req.query?.id);
  if (table && id) req.url = `/api/table/${encodeURIComponent(table)}/${encodeURIComponent(id)}`;
  return requestHandler(req, res);
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}
