import { requestHandler } from "../dist/server/index.js";

export default function handler(req, res) {
  req.url = "/api/row";
  return requestHandler(req, res);
}
