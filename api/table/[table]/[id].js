import { requestHandler } from "../../../dist/server/index.js";

export default function handler(req, res) {
  return requestHandler(req, res);
}
