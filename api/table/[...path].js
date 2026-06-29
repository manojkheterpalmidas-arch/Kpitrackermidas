import { handleVercel } from "../../vercel-api-handler.js";

export default function handler(req, res) {
  return handleVercel(req, res, "/api/table");
}
