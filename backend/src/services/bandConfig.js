// The band's emergency-contact list, published retained on scare/devices/{uid}/config.
// Retained means a band that is asleep gets the newest version the next time it connects.

import { query } from "../db/postgres.js";
import { publishToBand } from "../mqtt/subscriber.js";

// Call inside the transaction that changed the contacts. Returns the affected band uids.
export async function bumpConfigVersion(db, patientId) {
  const { rows } = await db.query(
    `UPDATE devices d
     SET config_version = d.config_version + 1
     FROM device_assignments a
     WHERE a.device_id = d.id AND a.patient_id = $1 AND a.unassigned_at IS NULL
     RETURNING d.device_uid`,
    [patientId]
  );
  return rows.map((r) => r.device_uid);
}

export async function publishBandConfig(patientId) {
  const { rows: devices } = await query(
    `SELECT d.device_uid, d.config_version, d.heartbeat_interval_s
     FROM device_assignments a
     JOIN devices d ON d.id = a.device_id
     WHERE a.patient_id = $1 AND a.unassigned_at IS NULL`,
    [patientId]
  );
  if (devices.length === 0) return;

  const { rows: contacts } = await query(
    `SELECT name, phone, priority, notify_on_sos, notify_on_fall
     FROM emergency_contacts
     WHERE patient_id = $1
     ORDER BY priority`,
    [patientId]
  );

  for (const d of devices) {
    publishToBand(
      d.device_uid,
      "config",
      { config_version: d.config_version, heartbeat_interval_s: d.heartbeat_interval_s, contacts },
      { qos: 1, retain: true }
    );
  }
}

// After unpairing: the band keeps no numbers from its previous wearer.
export function publishEmptyConfig(uid, configVersion, heartbeatSeconds) {
  publishToBand(uid, "config", { config_version: configVersion, heartbeat_interval_s: heartbeatSeconds, contacts: [] }, { qos: 1, retain: true });
}
