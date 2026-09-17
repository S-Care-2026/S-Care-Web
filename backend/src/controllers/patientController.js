import { query, transaction } from "../db/postgres.js";
import { canSeePatient } from "../auth/auth.js";
import { nsToMs, queryRows, toNumber } from "../db/influx.js";
import { audit } from "../services/audit.js";
import { bumpConfigVersion, publishBandConfig } from "../services/bandConfig.js";
import { invalidateDevice } from "../services/context.js";
import { invalidateSnapshot } from "../services/snapshot.js";
import { HttpError, requirePhone, requireText, requireUuid } from "./validate.js";

const MAX_CONTACTS = 5; // what the band stores for its SMS fallback

// Chart ranges → lookback window and bucket size (seconds). Matches frontend/src/data/history.ts.
const RANGES = {
  "1h": { lookback: 3600, bucket: 60 },
  "6h": { lookback: 6 * 3600, bucket: 300 },
  "24h": { lookback: 24 * 3600, bucket: 900 },
  "7d": { lookback: 7 * 24 * 3600, bucket: 7200 },
};
const FIELDS = { hr: "heart_rate", spo2: "spo2" };

async function patientInFacility(req) {
  const patientId = requireUuid(req.params.patientId, "Patient");
  if (!canSeePatient(req.user, patientId)) throw new HttpError(404, "Patient not found");
  const { rows } = await query("SELECT id FROM patients WHERE id = $1 AND facility_id = $2", [patientId, req.user.facilityId]);
  if (!rows.length) throw new HttpError(404, "Patient not found");
  return patientId;
}

// GET /api/patients/:patientId/history?vital=hr|spo2|temp&range=1h|6h|24h|7d
export async function getHistory(req, res) {
  const patientId = await patientInFacility(req);
  const range = RANGES[req.query.range];
  if (!range) throw new HttpError(400, "range must be one of 1h, 6h, 24h, 7d");
  const field = FIELDS[req.query.vital];
  if (!field) return res.json({ success: true, data: [] }); // no temperature sensor on the band

  const rows = await queryRows(
    `SELECT CAST(date_bin(INTERVAL '${range.bucket} seconds', time) AS BIGINT) AS t,
            avg(${field}) AS mean, min(${field}) AS lo, max(${field}) AS hi
     FROM vitals
     WHERE patient_id = $patient_id
       AND time >= now() - INTERVAL '${range.lookback} seconds'
       AND ${field} IS NOT NULL
     GROUP BY 1
     ORDER BY 1`,
    { patient_id: patientId }
  );

  res.json({
    success: true,
    data: rows.map((r) => ({
      t: nsToMs(r.t),
      mean: Math.round(toNumber(r.mean) * 10) / 10,
      min: toNumber(r.lo),
      max: toNumber(r.hi),
    })),
  });
}

async function contactInFacility(req, db = { query }) {
  const contactId = requireUuid(req.params.contactId, "Contact");
  const { rows } = await db.query(
    `SELECT c.* FROM emergency_contacts c
     JOIN patients p ON p.id = c.patient_id
     WHERE c.id = $1 AND p.facility_id = $2`,
    [contactId, req.user.facilityId]
  );
  const contact = rows[0];
  if (!contact || !canSeePatient(req.user, contact.patient_id)) throw new HttpError(404, "Contact not found");
  return contact;
}

// Every contact change bumps the band's config version and republishes the retained config.
async function afterContactChange(req, patientId, action, changes) {
  invalidateSnapshot(req.user.facilityId);
  invalidateDevice();
  await audit({ query }, { facilityId: req.user.facilityId, userId: req.user.id, action, entityType: "patient", entityId: patientId, changes, ip: req.ip });
  await publishBandConfig(patientId).catch((err) => console.error(`[config] publish failed: ${err.message}`));
}

// POST /api/patients/:patientId/contacts
export async function addContact(req, res) {
  const patientId = await patientInFacility(req);
  const body = req.body ?? {};
  const contact = {
    name: requireText(body.name, "a name", 120),
    relationship: requireText(body.relationship, "a relationship", 60),
    phone: requirePhone(body.phone),
    notifyOnSos: body.notifyOnSos !== false,
    notifyOnFall: body.notifyOnFall !== false,
  };

  const id = await transaction(async (db) => {
    // Lock the patient's contacts so two adds can't take the same priority.
    const { rows } = await db.query("SELECT priority FROM emergency_contacts WHERE patient_id = $1 FOR UPDATE", [patientId]);
    if (rows.length >= MAX_CONTACTS) throw new HttpError(400, `A band stores at most ${MAX_CONTACTS} emergency numbers.`);
    const priority = rows.reduce((max, r) => Math.max(max, r.priority), 0) + 1;
    const inserted = await db.query(
      `INSERT INTO emergency_contacts (patient_id, name, relationship, phone, priority, notify_on_sos, notify_on_fall)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [patientId, contact.name, contact.relationship, contact.phone, priority, contact.notifyOnSos, contact.notifyOnFall]
    );
    await bumpConfigVersion(db, patientId);
    return inserted.rows[0].id;
  });

  await afterContactChange(req, patientId, "contact.add", contact);
  res.status(201).json({ success: true, data: { id } });
}

// PATCH /api/contacts/:contactId  { notifyOnSos?, notifyOnFall? }
export async function updateContact(req, res) {
  const contact = await contactInFacility(req);
  const { notifyOnSos, notifyOnFall } = req.body ?? {};
  if (notifyOnSos !== undefined && typeof notifyOnSos !== "boolean") throw new HttpError(400, "notifyOnSos must be true or false.");
  if (notifyOnFall !== undefined && typeof notifyOnFall !== "boolean") throw new HttpError(400, "notifyOnFall must be true or false.");

  await transaction(async (db) => {
    await db.query(
      "UPDATE emergency_contacts SET notify_on_sos = COALESCE($2, notify_on_sos), notify_on_fall = COALESCE($3, notify_on_fall) WHERE id = $1",
      [contact.id, notifyOnSos ?? null, notifyOnFall ?? null]
    );
    await bumpConfigVersion(db, contact.patient_id);
  });

  await afterContactChange(req, contact.patient_id, "contact.update", { contactId: contact.id, notifyOnSos, notifyOnFall });
  res.json({ success: true });
}

// DELETE /api/contacts/:contactId — later contacts move up one place
export async function removeContact(req, res) {
  const contact = await contactInFacility(req);
  await transaction(async (db) => {
    await db.query("SET CONSTRAINTS emergency_contacts_priority_uniq DEFERRED");
    await db.query("DELETE FROM emergency_contacts WHERE id = $1", [contact.id]);
    await db.query("UPDATE emergency_contacts SET priority = priority - 1 WHERE patient_id = $1 AND priority > $2", [contact.patient_id, contact.priority]);
    await bumpConfigVersion(db, contact.patient_id);
  });

  await afterContactChange(req, contact.patient_id, "contact.remove", { contactId: contact.id, name: contact.name });
  res.json({ success: true });
}

// POST /api/contacts/:contactId/move  { dir: -1 | 1 } — swap with the neighbour above or below
export async function moveContact(req, res) {
  const dir = req.body?.dir;
  if (dir !== -1 && dir !== 1) throw new HttpError(400, "dir must be -1 (up) or 1 (down).");
  const contact = await contactInFacility(req);

  const moved = await transaction(async (db) => {
    await db.query("SET CONSTRAINTS emergency_contacts_priority_uniq DEFERRED");
    const { rows } = await db.query("SELECT id FROM emergency_contacts WHERE patient_id = $1 AND priority = $2", [contact.patient_id, contact.priority + dir]);
    if (!rows[0]) return false;
    await db.query("UPDATE emergency_contacts SET priority = $2 WHERE id = $1", [rows[0].id, contact.priority]);
    await db.query("UPDATE emergency_contacts SET priority = $2 WHERE id = $1", [contact.id, contact.priority + dir]);
    await bumpConfigVersion(db, contact.patient_id);
    return true;
  });
  if (!moved) throw new HttpError(409, dir === -1 ? "Already first." : "Already last.");

  await afterContactChange(req, contact.patient_id, "contact.move", { contactId: contact.id, dir });
  res.json({ success: true });
}
