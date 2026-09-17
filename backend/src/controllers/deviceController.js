import { createHash } from "node:crypto";
import { transaction } from "../db/postgres.js";
import { audit } from "../services/audit.js";
import { bumpConfigVersion, publishBandConfig, publishEmptyConfig } from "../services/bandConfig.js";
import { invalidateDevice } from "../services/context.js";
import { invalidateSnapshot } from "../services/snapshot.js";
import { HttpError, requireText, requireUuid } from "./validate.js";

const DEVICE_UID = /^[A-Za-z0-9_-]{3,64}$/;
const SEXES = new Set(["female", "male", "other"]);
// Same message whether the band doesn't exist, the code is wrong, or another facility owns it,
// so the endpoint can't be used to discover band ids.
const NOT_PAIRABLE = "That band ID and pairing code don’t match a band available to pair. Check the label and try again.";

// Labels print the code in groups (ABCD-EFGH-…); people may type it with or without dashes.
function codeHashes(code) {
  const trimmed = String(code ?? "").trim().toUpperCase();
  const compact = trimmed.replace(/[^A-Z0-9]/g, "");
  const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");
  return [...new Set([sha(compact), sha(trimmed)])];
}

async function findOrCreateRoom(db, facilityId, roomName, zoneName) {
  let zoneId = null;
  if (zoneName) {
    const zone = await db.query(
      `INSERT INTO zones (facility_id, name) VALUES ($1, $2)
       ON CONFLICT (facility_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [facilityId, zoneName]
    );
    zoneId = zone.rows[0].id;
  }
  const room = await db.query(
    `INSERT INTO rooms (facility_id, zone_id, name) VALUES ($1, $2, $3)
     ON CONFLICT (facility_id, zone_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [facilityId, zoneId, roomName]
  );
  return room.rows[0].id;
}

// POST /api/devices/pair
//   { deviceUid, claimCode, patientId }                         — pair with an existing patient
//   { deviceUid, claimCode, newPatient: { name, age, sex, room, zone? } }
// An unclaimed band needs its pairing code; a band this facility already owns (unpaired earlier) doesn't.
export async function pairDevice(req, res) {
  const body = req.body ?? {};
  const uid = typeof body.deviceUid === "string" ? body.deviceUid.trim() : "";
  if (!DEVICE_UID.test(uid)) throw new HttpError(400, "Band IDs use letters, digits, - and _ only.");

  let newPatient = null;
  if (body.patientId) {
    requireUuid(body.patientId, "Patient");
  } else {
    const p = body.newPatient ?? {};
    const age = Number(p.age);
    if (!Number.isInteger(age) || age < 0 || age > 130) throw new HttpError(400, "Enter the patient’s age in years.");
    newPatient = {
      name: requireText(p.name, "the patient’s name", 120),
      age,
      sex: SEXES.has(p.sex) ? p.sex : "other",
      room: requireText(p.room, "a room", 60),
      zone: typeof p.zone === "string" && p.zone.trim() ? requireText(p.zone, "an area", 60) : null,
    };
  }

  const facilityId = req.user.facilityId;
  const result = await transaction(async (db) => {
    const { rows } = await db.query(
      "SELECT id, facility_id, claim_code_hash, lifecycle FROM devices WHERE device_uid = $1 FOR UPDATE",
      [uid]
    );
    const device = rows[0];
    if (!device || device.lifecycle === "retired") throw new HttpError(400, NOT_PAIRABLE);

    if (device.facility_id === null) {
      if (!device.claim_code_hash || !codeHashes(body.claimCode).includes(device.claim_code_hash)) {
        throw new HttpError(400, NOT_PAIRABLE);
      }
      await db.query("UPDATE devices SET facility_id = $2, claimed_at = now() WHERE id = $1", [device.id, facilityId]);
    } else if (device.facility_id !== facilityId) {
      throw new HttpError(400, NOT_PAIRABLE);
    }

    const active = await db.query(
      `SELECT p.full_name FROM device_assignments a JOIN patients p ON p.id = a.patient_id
       WHERE a.device_id = $1 AND a.unassigned_at IS NULL`,
      [device.id]
    );
    if (active.rows[0]) throw new HttpError(409, `This band is already paired with ${active.rows[0].full_name}. Unpair it first.`);

    let patientId = body.patientId;
    if (patientId) {
      const patient = await db.query(
        `SELECT p.full_name,
                EXISTS (SELECT 1 FROM device_assignments a WHERE a.patient_id = p.id AND a.unassigned_at IS NULL) AS has_band
         FROM patients p WHERE p.id = $1 AND p.facility_id = $2 AND p.discharged_at IS NULL`,
        [patientId, facilityId]
      );
      if (!patient.rows[0]) throw new HttpError(404, "Patient not found");
      if (patient.rows[0].has_band) throw new HttpError(409, `${patient.rows[0].full_name} already wears a band. Unpair it first.`);
    } else {
      const roomId = await findOrCreateRoom(db, facilityId, newPatient.room, newPatient.zone);
      // Only the age is asked for, so the birth date is approximated as 1 January of that year.
      const inserted = await db.query(
        `INSERT INTO patients (facility_id, room_id, full_name, date_of_birth, sex)
         VALUES ($1, $2, $3, make_date(extract(year FROM now())::int - $4::int, 1, 1), $5)
         RETURNING id`,
        [facilityId, roomId, newPatient.name, newPatient.age, newPatient.sex]
      );
      patientId = inserted.rows[0].id;
    }

    await db.query(
      "INSERT INTO device_assignments (facility_id, device_id, patient_id, assigned_by) VALUES ($1, $2, $3, $4)",
      [facilityId, device.id, patientId, req.user.id]
    );
    await bumpConfigVersion(db, patientId);
    await audit(db, { facilityId, userId: req.user.id, action: "device.pair", entityType: "device", entityId: device.id, changes: { deviceUid: uid, patientId }, ip: req.ip });
    return { patientId };
  });

  invalidateDevice(uid);
  invalidateSnapshot(facilityId);
  await publishBandConfig(result.patientId).catch((err) => console.error(`[config] publish failed: ${err.message}`));
  res.status(201).json({ success: true, data: result });
}

// POST /api/devices/:uid/unpair — the band stays with this facility and can be paired again without its code
export async function unpairDevice(req, res) {
  const uid = req.params.uid;
  if (!DEVICE_UID.test(uid ?? "")) throw new HttpError(400, "Band IDs use letters, digits, - and _ only.");
  const facilityId = req.user.facilityId;

  const unpaired = await transaction(async (db) => {
    const { rows } = await db.query(
      `UPDATE device_assignments a
       SET unassigned_at = now()
       FROM devices d
       WHERE a.device_id = d.id AND d.device_uid = $1 AND d.facility_id = $2 AND a.unassigned_at IS NULL
       RETURNING d.id AS device_id, a.patient_id`,
      [uid, facilityId]
    );
    if (!rows[0]) return null;
    const { rows: version } = await db.query(
      "UPDATE devices SET config_version = config_version + 1 WHERE id = $1 RETURNING config_version, heartbeat_interval_s",
      [rows[0].device_id]
    );
    await audit(db, { facilityId, userId: req.user.id, action: "device.unpair", entityType: "device", entityId: rows[0].device_id, changes: { deviceUid: uid, patientId: rows[0].patient_id }, ip: req.ip });
    return version[0];
  });
  if (!unpaired) throw new HttpError(404, "This band isn’t paired with anyone in your facility.");

  invalidateDevice(uid);
  invalidateSnapshot(facilityId);
  // The band no longer belongs to that patient: clear the emergency numbers it carries.
  publishEmptyConfig(uid, unpaired.config_version, unpaired.heartbeat_interval_s);
  res.json({ success: true });
}
