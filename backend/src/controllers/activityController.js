import { query } from "../db/postgres.js";
import { MAX_HEARTBEAT_MS, readActivitySummary, recordHeartbeat } from "../services/webActivity.js";
import { HttpError } from "./validate.js";

export async function postHeartbeat(req, res) {
  const activeMs = req.body?.activeMs;
  if (!Number.isSafeInteger(activeMs) || activeMs < 0 || activeMs > MAX_HEARTBEAT_MS) {
    throw new HttpError(400, `activeMs must be an integer between 0 and ${MAX_HEARTBEAT_MS}.`);
  }
  // Identity is always taken from the verified token, never from the request body.
  await recordHeartbeat({ query }, req.user.id, activeMs);
  res.set("Cache-Control", "no-store").json({ success: true });
}

export async function getActivitySummary(req, res) {
  res.set("Cache-Control", "no-store").json({ success: true, data: await readActivitySummary({ query }) });
}
