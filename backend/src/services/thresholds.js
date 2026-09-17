// Effective alert thresholds per patient (override → facility default → built-in),
// read from the effective_alert_thresholds view and cached for a minute.

import { query } from "../db/postgres.js";

const TTL_MS = 60_000;
const cache = new Map(); // patient_id -> { value, expires }

export async function thresholdsFor(patientId) {
  const hit = cache.get(patientId);
  if (hit && hit.expires > Date.now()) return hit.value;
  const { rows } = await query("SELECT * FROM effective_alert_thresholds WHERE patient_id = $1", [patientId]);
  const value = rows[0] ?? null;
  cache.set(patientId, { value, expires: Date.now() + TTL_MS });
  return value;
}

export function invalidateThresholds(patientId) {
  if (patientId) cache.delete(patientId);
  else cache.clear();
}

// Row (snake_case columns) ↔ the dashboard's camelCase Thresholds object.
export const THRESHOLD_COLUMNS = {
  hrCritLow: "hr_crit_low",
  hrWarnLow: "hr_warn_low",
  hrWarnHigh: "hr_warn_high",
  hrCritHigh: "hr_crit_high",
  spo2WarnLow: "spo2_warn_low",
  spo2CritLow: "spo2_crit_low",
  batteryWarn: "battery_warn_pct",
  batteryCrit: "battery_crit_pct",
  sustainSeconds: "sustain_seconds",
};

export function rowToThresholds(row) {
  const out = {};
  if (!row) return out;
  for (const [key, column] of Object.entries(THRESHOLD_COLUMNS)) {
    if (row[column] != null) out[key] = row[column];
  }
  return out;
}
