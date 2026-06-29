import { requestHandler } from "../dist/server/index.js";

export default function handler(req, res) {
  req.url = "/api/import";
  return requestHandler(req, res);
}
