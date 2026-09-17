// Band → facility → current patient, cached briefly so each MQTT message doesn't hit Postgres.

import { query } from "../db/postgres.js";

const TTL_MS = 60_000;
const cache = new Map(); // device_uid -> { value, expires }

export function locationLabel(room, zone) {
  if (!room) return null;
  return zone ? `Room ${room} • ${zone}` : `Room ${room}`;
}

// Returns null when the band isn't registered in `devices`.
export async function deviceContext(uid) {
  const hit = cache.get(uid);
  if (hit && hit.expires > Date.now()) return hit.value;

  const { rows } = await query(
    `SELECT d.id AS device_id, d.device_uid, d.facility_id, d.lifecycle, d.heartbeat_interval_s,
            d.config_version, d.config_acked_version,
            a.patient_id, p.full_name AS patient_name, r.name AS room, z.name AS zone
     FROM devices d
     LEFT JOIN device_assignments a ON a.device_id = d.id AND a.unassigned_at IS NULL
     LEFT JOIN patients p ON p.id = a.patient_id AND p.discharged_at IS NULL
     LEFT JOIN rooms r ON r.id = p.room_id
     LEFT JOIN zones z ON z.id = r.zone_id
     WHERE d.device_uid = $1`,
    [uid]
  );

  const row = rows[0];
  const value = row
    ? {
        deviceId: row.device_id,
        deviceUid: row.device_uid,
        facilityId: row.facility_id,
        lifecycle: row.lifecycle,
        heartbeatSeconds: row.heartbeat_interval_s,
        configVersion: row.config_version,
        configAckedVersion: row.config_acked_version,
        patientId: row.patient_id && row.patient_name ? row.patient_id : null,
        patientName: row.patient_name,
        locationLabel: locationLabel(row.room, row.zone),
      }
    : null;

  cache.set(uid, { value, expires: Date.now() + TTL_MS });
  return value;
}

export function invalidateDevice(uid) {
  if (uid) cache.delete(uid);
  else cache.clear();
}
