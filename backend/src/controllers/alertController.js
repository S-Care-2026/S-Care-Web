import { query } from "../db/postgres.js";
import { canSeePatient } from "../auth/auth.js";
import { createAlert, dedupes, findActive, getAlert } from "../services/alerts.js";
import { audit } from "../services/audit.js";
import { locationLabel } from "../services/context.js";
import { getLiveDevice } from "../services/latest.js";
import { forgetAlertState } from "../services/rules.js";
import { invalidateSnapshot } from "../services/snapshot.js";
import { HttpError, optionalText, requireUuid } from "./validate.js";

const db = { query };
const ALERT_TYPES = new Set(["fall", "sos", "tachycardia", "bradycardia", "hypoxemia", "low_battery", "offline"]);
const RESOLUTIONS = new Set(["assisted", "false_alarm", "no_action_needed"]);

const DEFAULT_DETAILS = {
  fall: "Fall raised manually. Waiting for the 15 s cancel window.",
  sos: "SOS raised manually from the dashboard.",
  low_battery: "Low battery raised manually from the dashboard.",
  offline: "Band marked offline manually from the dashboard.",
};

async function alertInFacility(req) {
  const alertId = requireUuid(req.params.alertId, "Alert");
  const alert = await getAlert(req.user.facilityId, alertId);
  if (!alert || (alert.patientId && !canSeePatient(req.user, alert.patientId))) throw new HttpError(404, "Alert not found");
  return alert;
}

// POST /api/alerts — raise an alert by hand (the dashboard's "Simulate alert" on real data)
export async function createManualAlert(req, res) {
  const { patientId, type } = req.body ?? {};
  requireUuid(patientId, "Patient");
  if (!ALERT_TYPES.has(type)) throw new HttpError(400, `Unknown alert type "${type}".`);
  if (!canSeePatient(req.user, patientId)) throw new HttpError(404, "Patient not found");
  const notes = optionalText(req.body.notes);

  const { rows } = await query(
    `SELECT p.id, r.name AS room, z.name AS zone, d.id AS device_id, d.device_uid
     FROM patients p
     LEFT JOIN rooms r ON r.id = p.room_id
     LEFT JOIN zones z ON z.id = r.zone_id
     LEFT JOIN device_assignments a ON a.patient_id = p.id AND a.unassigned_at IS NULL
     LEFT JOIN devices d ON d.id = a.device_id
     WHERE p.id = $1 AND p.facility_id = $2 AND p.discharged_at IS NULL`,
    [patientId, req.user.facilityId]
  );
  const patient = rows[0];
  if (!patient) throw new HttpError(404, "Patient not found");
  if ((type === "low_battery" || type === "offline") && !patient.device_id) {
    throw new HttpError(400, "This patient has no band paired.");
  }

  if (dedupes(type)) {
    const existing = await findActive(db, { type, patientId, deviceId: patient.device_id });
    if (existing) {
      return res.json({ success: true, data: { alert: await getAlert(req.user.facilityId, existing.id), duplicate: true } });
    }
  }

  const vitals = patient.device_uid ? getLiveDevice(patient.device_uid)?.vitals : null;
  const fresh = vitals && Date.now() - Date.parse(vitals.ts) < 5 * 60_000;
  const severity = type === "fall" || type === "sos" ? "critical" : type === "low_battery" ? "info" : "warning";

  const result = await createAlert(db, {
    facilityId: req.user.facilityId,
    patientId,
    deviceId: patient.device_id,
    type,
    severity,
    status: type === "fall" ? "pending" : "open",
    source: "manual",
    occurredAt: Date.now(),
    locationLabel: locationLabel(patient.room, patient.zone),
    heartRate: fresh ? vitals.heart_rate : null,
    spo2: fresh ? vitals.spo2 : null,
    details: { description: notes ?? DEFAULT_DETAILS[type] ?? "Raised manually from the dashboard.", raised_by: req.user.name },
  });

  await audit(db, { facilityId: req.user.facilityId, userId: req.user.id, action: "alert.create", entityType: "alert", entityId: result.id, changes: { type, patientId }, ip: req.ip });
  invalidateSnapshot(req.user.facilityId);
  const alert = await getAlert(req.user.facilityId, result.id);
  res.status(result.created ? 201 : 200).json({ success: true, data: { alert, duplicate: !result.created } });
}

// POST /api/alerts/:alertId/acknowledge
export async function acknowledgeAlert(req, res) {
  const alert = await alertInFacility(req);
  const { rowCount } = await query(
    "UPDATE alerts SET status = 'acknowledged', acknowledged_at = now(), acknowledged_by = $2 WHERE id = $1 AND status = 'open'",
    [alert.id, req.user.id]
  );
  if (!rowCount) throw new HttpError(409, "Only open alerts can be acknowledged.");
  await audit(db, { facilityId: req.user.facilityId, userId: req.user.id, action: "alert.acknowledge", entityType: "alert", entityId: alert.id, ip: req.ip });
  invalidateSnapshot(req.user.facilityId);
  res.json({ success: true, data: await getAlert(req.user.facilityId, alert.id) });
}

// POST /api/alerts/:alertId/resolve  { resolution, notes }
export async function resolveAlert(req, res) {
  const alert = await alertInFacility(req);
  const resolution = req.body?.resolution;
  if (!RESOLUTIONS.has(resolution)) throw new HttpError(400, "Choose an outcome: assisted, false_alarm or no_action_needed.");
  const notes = optionalText(req.body.notes);
  if (resolution === "false_alarm" && !notes) throw new HttpError(400, "Add a note for false alarms — say what triggered it.");

  const { rows } = await query(
    `UPDATE alerts
     SET status = 'resolved', resolved_at = now(), resolved_by = $2, resolution = $3, resolution_notes = $4
     WHERE id = $1 AND status IN ('open', 'acknowledged')
     RETURNING patient_id, device_id`,
    [alert.id, req.user.id, resolution, notes]
  );
  if (!rows[0]) throw new HttpError(409, "Only open or acknowledged alerts can be resolved.");
  if (rows[0].patient_id) forgetAlertState(rows[0].patient_id);
  if (rows[0].device_id) forgetAlertState(rows[0].device_id);

  await audit(db, { facilityId: req.user.facilityId, userId: req.user.id, action: "alert.resolve", entityType: "alert", entityId: alert.id, changes: { resolution, notes }, ip: req.ip });
  invalidateSnapshot(req.user.facilityId);
  res.json({ success: true, data: await getAlert(req.user.facilityId, alert.id) });
}

// POST /api/alerts/:alertId/cancel — a fall still in its cancel window
export async function cancelAlert(req, res) {
  const alert = await alertInFacility(req);
  const { rowCount } = await query(
    `UPDATE alerts
     SET status = 'cancelled', details = details || jsonb_build_object('cancelled_at', now()::text, 'cancelled_by', $2::text)
     WHERE id = $1 AND status = 'pending'`,
    [alert.id, req.user.name]
  );
  if (!rowCount) throw new HttpError(409, "Only a fall that is still confirming can be cancelled.");
  await audit(db, { facilityId: req.user.facilityId, userId: req.user.id, action: "alert.cancel", entityType: "alert", entityId: alert.id, ip: req.ip });
  invalidateSnapshot(req.user.facilityId);
  res.json({ success: true, data: await getAlert(req.user.facilityId, alert.id) });
}
