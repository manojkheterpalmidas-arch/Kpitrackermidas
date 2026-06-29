import { handleVercel } from "../_handler.js";

export default function handler(req, res) {
  return handleVercel(req, res, "/api/table");
}
