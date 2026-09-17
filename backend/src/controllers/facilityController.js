import { query, transaction } from "../db/postgres.js";
import { canSeePatient } from "../auth/auth.js";
import { audit } from "../services/audit.js";
import { buildSnapshot, invalidateSnapshot } from "../services/snapshot.js";
import { invalidateThresholds, rowToThresholds, THRESHOLD_COLUMNS } from "../services/thresholds.js";
import { BUILT_IN_THRESHOLDS, checkThresholdOrder, HttpError, parseThresholds, requireUuid } from "./validate.js";

const COLUMNS = Object.values(THRESHOLD_COLUMNS);
const KEYS = Object.keys(THRESHOLD_COLUMNS);

// GET /api/facility/snapshot — patients, bands, latest vitals, alerts, contacts and thresholds
export async function getSnapshot(req, res) {
  res.json({ success: true, data: await buildSnapshot(req.user) });
}

async function thresholdRows(facilityId) {
  const { rows } = await query("SELECT * FROM alert_thresholds WHERE facility_id = $1", [facilityId]);
  return rows;
}

// PUT /api/facility/thresholds — the facility default every patient inherits
export async function putFacilityThresholds(req, res) {
  const values = parseThresholds(req.body);
  const merged = { ...BUILT_IN_THRESHOLDS, ...values };
  const error = checkThresholdOrder(merged);
  if (error) throw new HttpError(400, error);

  // Store every field: the facility default is what the dashboard saves as a complete set.
  const params = [req.user.facilityId, req.user.id, ...KEYS.map((k) => merged[k])];
  await query(
    `INSERT INTO alert_thresholds (facility_id, patient_id, updated_by, ${COLUMNS.join(", ")})
     VALUES ($1, NULL, $2, ${KEYS.map((_, i) => `$${i + 3}`).join(", ")})
     ON CONFLICT (facility_id) WHERE patient_id IS NULL
     DO UPDATE SET updated_by = EXCLUDED.updated_by, ${COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(", ")}`,
    params
  );

  invalidateThresholds();
  invalidateSnapshot(req.user.facilityId);
  await audit({ query }, { facilityId: req.user.facilityId, userId: req.user.id, action: "thresholds.facility", entityType: "facility", entityId: req.user.facilityId, changes: merged, ip: req.ip });
  res.json({ success: true, data: merged });
}

// PUT /api/patients/:patientId/thresholds — a per-patient override; {} or null clears it
export async function putPatientThresholds(req, res) {
  const patientId = requireUuid(req.params.patientId, "Patient");
  if (!canSeePatient(req.user, patientId)) throw new HttpError(404, "Patient not found");
  const { rows: found } = await query("SELECT 1 FROM patients WHERE id = $1 AND facility_id = $2", [patientId, req.user.facilityId]);
  if (!found.length) throw new HttpError(404, "Patient not found");

  const override = parseThresholds(req.body ?? {});
  const rows = await thresholdRows(req.user.facilityId);
  const facilityDefault = rowToThresholds(rows.find((r) => r.patient_id === null));
  const merged = { ...BUILT_IN_THRESHOLDS, ...facilityDefault, ...override };
  const error = checkThresholdOrder(merged);
  if (error) throw new HttpError(400, error);

  await transaction(async (db) => {
    if (Object.keys(override).length === 0) {
      await db.query("DELETE FROM alert_thresholds WHERE patient_id = $1", [patientId]);
      return;
    }
    // Unset fields are NULL, so they keep inheriting the facility default.
    await db.query(
      `INSERT INTO alert_thresholds (facility_id, patient_id, updated_by, ${COLUMNS.join(", ")})
       VALUES ($1, $2, $3, ${KEYS.map((_, i) => `$${i + 4}`).join(", ")})
       ON CONFLICT (patient_id) WHERE patient_id IS NOT NULL
       DO UPDATE SET updated_by = EXCLUDED.updated_by, ${COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(", ")}`,
      [req.user.facilityId, patientId, req.user.id, ...KEYS.map((k) => override[k] ?? null)]
    );
  });

  invalidateThresholds(patientId);
  invalidateSnapshot(req.user.facilityId);
  await audit({ query }, { facilityId: req.user.facilityId, userId: req.user.id, action: "thresholds.patient", entityType: "patient", entityId: patientId, changes: override, ip: req.ip });
  res.json({ success: true, data: override });
}
