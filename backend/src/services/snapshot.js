// Everything the dashboard shows for one facility, in the dashboard's own shapes
// (frontend/src/lib/types.ts), so the React pages work the same on demo and real data.

import { query } from "../db/postgres.js";
import { listAlerts } from "./alerts.js";
import { getBuffer, getLiveDevice } from "./latest.js";
import { rowToThresholds } from "./thresholds.js";

const CACHE_MS = 2_000;
// Readings older than this aren't shown as "current".
const VITALS_MAX_AGE_MS = 10 * 60_000;
const cache = new Map(); // cache key -> { value, expires }

function ageFrom(dateOfBirth, now) {
  if (!dateOfBirth) return 0;
  const dob = new Date(dateOfBirth);
  const today = new Date(now);
  let age = today.getFullYear() - dob.getFullYear();
  if (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate())) age--;
  return age;
}

function signalBars(rssi) {
  if (rssi == null) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -67) return 3;
  if (rssi >= -75) return 2;
  if (rssi >= -85) return 1;
  return 0;
}

export function invalidateSnapshot(facilityId) {
  for (const key of cache.keys()) if (key.startsWith(facilityId)) cache.delete(key);
}

async function loadRows(user) {
  const key = `${user.facilityId}:${user.role === "family" ? user.id : "all"}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const patientIds = user.role === "family" ? user.patientIds : null;
  const [patients, devices, contacts, thresholds, alerts] = await Promise.all([
    query(
      `SELECT p.id, p.full_name, p.date_of_birth, p.sex, p.medical_notes, p.admitted_at,
              r.name AS room, z.name AS zone, d.device_uid
       FROM patients p
       LEFT JOIN rooms r ON r.id = p.room_id
       LEFT JOIN zones z ON z.id = r.zone_id
       LEFT JOIN device_assignments a ON a.patient_id = p.id AND a.unassigned_at IS NULL
       LEFT JOIN devices d ON d.id = a.device_id
       WHERE p.facility_id = $1 AND p.discharged_at IS NULL
         AND ($2::uuid[] IS NULL OR p.id = ANY($2))
       ORDER BY p.full_name`,
      [user.facilityId, patientIds]
    ),
    query(
      `SELECT d.device_uid, d.label, d.firmware_version, d.heartbeat_interval_s, d.config_version,
              d.config_acked_version, d.last_seen_at, a.patient_id
       FROM devices d
       LEFT JOIN device_assignments a ON a.device_id = d.id AND a.unassigned_at IS NULL
       WHERE d.facility_id = $1 AND d.lifecycle <> 'retired'
         AND ($2::uuid[] IS NULL OR a.patient_id = ANY($2))
       ORDER BY d.device_uid`,
      [user.facilityId, patientIds]
    ),
    query(
      `SELECT c.id, c.patient_id, c.name, c.relationship, c.phone, c.priority, c.notify_on_sos, c.notify_on_fall
       FROM emergency_contacts c
       JOIN patients p ON p.id = c.patient_id
       WHERE p.facility_id = $1 AND p.discharged_at IS NULL
         AND ($2::uuid[] IS NULL OR p.id = ANY($2))`,
      [user.facilityId, patientIds]
    ),
    query("SELECT * FROM alert_thresholds WHERE facility_id = $1", [user.facilityId]),
    listAlerts(user.facilityId, { patientIds }),
  ]);

  const value = { patients: patients.rows, devices: devices.rows, contacts: contacts.rows, thresholds: thresholds.rows, alerts };
  cache.set(key, { value, expires: Date.now() + CACHE_MS });
  return value;
}

export async function buildSnapshot(user) {
  const now = Date.now();
  const rows = await loadRows(user);

  const devices = rows.devices.map((d) => {
    const live = getLiveDevice(d.device_uid);
    const lastSeen = Math.max(live?.last_seen_at ? Date.parse(live.last_seen_at) : 0, d.last_seen_at ? d.last_seen_at.getTime() : 0);
    const online = lastSeen > 0 && now - lastSeen <= d.heartbeat_interval_s * 2 * 1000;
    const vitalsFresh = live?.vitals && now - Date.parse(live.vitals.ts) <= VITALS_MAX_AGE_MS;
    return {
      id: d.device_uid,
      label: d.label ?? "S-Care Band",
      patientId: d.patient_id,
      battery: live?.status?.battery_pct ?? null,
      charging: live?.status?.charging ?? false,
      worn: live?.status?.worn ?? Boolean(vitalsFresh),
      signal: signalBars(live?.status?.rssi_dbm),
      firmware: d.firmware_version ?? "—",
      online,
      lastSeen,
      heartbeatSec: d.heartbeat_interval_s,
      configVersion: d.config_version,
      configAcked: live?.config_acked_version != null ? Math.max(live.config_acked_version, d.config_acked_version) : d.config_acked_version,
    };
  });

  const patients = rows.patients.map((p) => ({
    id: p.id,
    name: p.full_name,
    age: ageFrom(p.date_of_birth, now),
    sex: p.sex ?? "other",
    room: p.room ?? "—",
    zone: p.zone ?? "—",
    deviceId: p.device_uid ?? null,
    admittedAt: p.admitted_at.getTime(),
    notes: p.medical_notes ?? "",
  }));

  const vitals = {};
  const buffers = {};
  for (const p of patients) {
    const device = devices.find((d) => d.id === p.deviceId);
    const live = p.deviceId ? getLiveDevice(p.deviceId)?.vitals : null;
    const fresh = device?.online && live && now - Date.parse(live.ts) <= VITALS_MAX_AGE_MS;
    vitals[p.id] = fresh
      ? { hr: live.heart_rate, spo2: live.spo2, temp: null, ts: Date.parse(live.ts) }
      : { hr: null, spo2: null, temp: null, ts: now };
    const b = getBuffer(p.id);
    buffers[p.id] = { hr: b.hr, spo2: b.spo2, temp: [] };
  }

  const facilityDefault = rows.thresholds.find((t) => t.patient_id === null);
  const overrides = {};
  for (const t of rows.thresholds) {
    if (t.patient_id) overrides[t.patient_id] = rowToThresholds(t);
  }

  return {
    now,
    running: true,
    facility: { id: user.facilityId, name: user.facilityName },
    patients,
    devices,
    vitals,
    buffers,
    alerts: rows.alerts,
    contacts: rows.contacts.map((c) => ({
      id: c.id,
      patientId: c.patient_id,
      name: c.name,
      relationship: c.relationship,
      phone: c.phone,
      priority: c.priority,
      notifyOnSos: c.notify_on_sos,
      notifyOnFall: c.notify_on_fall,
    })),
    facilityThresholds: rowToThresholds(facilityDefault),
    overrides,
    scenarios: {},
  };
}
