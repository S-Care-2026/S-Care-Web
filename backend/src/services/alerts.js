// Alert rows: create (deduplicated by the database), escalate, resolve, and shape for the dashboard.

import { query } from "../db/postgres.js";

export const ACTIVE_STATUSES = ["pending", "open", "acknowledged"];
// These types allow only one active alert per patient (vitals) or per band (device health).
const PER_PATIENT_TYPES = new Set(["tachycardia", "bradycardia", "hypoxemia"]);
const PER_DEVICE_TYPES = new Set(["low_battery", "offline"]);
export const FALL_COUNTDOWN_MS = 15_000;

const ALERT_SELECT = `
  SELECT a.*, d.device_uid,
         ack.full_name AS acknowledged_by_name,
         res.full_name AS resolved_by_name
  FROM alerts a
  LEFT JOIN devices d ON d.id = a.device_id
  LEFT JOIN users ack ON ack.id = a.acknowledged_by
  LEFT JOIN users res ON res.id = a.resolved_by`;

const clampSmallint = (v, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : null);

// Returns { id, created }. When an equivalent active alert (or the same device event) already
// exists, nothing is inserted and `id` is the existing alert's id when it can be found.
export async function createAlert(db, a) {
  const { rows } = await db.query(
    `INSERT INTO alerts (facility_id, patient_id, device_id, type, severity, status, source, device_event_id,
                         occurred_at, location_label, heart_rate_snapshot, spo2_snapshot, impact_g, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      a.facilityId,
      a.patientId ?? null,
      a.deviceId ?? null,
      a.type,
      a.severity,
      a.status ?? "open",
      a.source,
      a.deviceEventId ?? null,
      new Date(a.occurredAt ?? Date.now()),
      a.locationLabel ?? null,
      clampSmallint(a.heartRate, 0, 300),
      clampSmallint(a.spo2, 0, 100),
      Number.isFinite(a.impactG) && a.impactG >= 0 && a.impactG < 100 ? a.impactG : null,
      JSON.stringify(a.details ?? {}),
    ]
  );
  if (rows[0]) return { id: rows[0].id, created: true };

  const row = a.deviceEventId
    ? (await db.query("SELECT id, severity FROM alerts WHERE device_id = $1 AND device_event_id = $2", [a.deviceId, a.deviceEventId])).rows[0]
    : await findActive(db, a);
  return { id: row?.id ?? null, severity: row?.severity, created: false };
}

export async function findActive(db, { type, patientId, deviceId }) {
  if (PER_PATIENT_TYPES.has(type) && patientId) {
    const { rows } = await db.query(
      "SELECT id, severity FROM alerts WHERE patient_id = $1 AND type = $2 AND status = ANY($3) LIMIT 1",
      [patientId, type, ACTIVE_STATUSES]
    );
    return rows[0] ?? null;
  }
  if (PER_DEVICE_TYPES.has(type) && deviceId) {
    const { rows } = await db.query(
      "SELECT id, severity FROM alerts WHERE device_id = $1 AND type = $2 AND status = ANY($3) LIMIT 1",
      [deviceId, type, ACTIVE_STATUSES]
    );
    return rows[0] ?? null;
  }
  return null;
}

export function dedupes(type) {
  return PER_PATIENT_TYPES.has(type) || PER_DEVICE_TYPES.has(type);
}

export async function escalate(db, alertId, severity, reason) {
  const rank = { info: 0, warning: 1, critical: 2 };
  const { rows } = await db.query(
    `UPDATE alerts
     SET severity = $2,
         details = details || jsonb_build_object('escalated_at', now()::text, 'escalation', $3::text)
     WHERE id = $1 AND status = ANY($4)
       AND (CASE severity WHEN 'info' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END) < $5
     RETURNING id`,
    [alertId, severity, reason, ACTIVE_STATUSES, rank[severity]]
  );
  return rows.length > 0;
}

// Closes active alerts of a type for a band without a person, e.g. "Band reconnected".
export async function autoResolve(db, deviceId, type, notes) {
  const { rows } = await db.query(
    `UPDATE alerts
     SET status = 'resolved', resolved_at = now(), resolution = 'no_action_needed', resolution_notes = $3
     WHERE device_id = $1 AND type = $2 AND status IN ('open', 'acknowledged')
     RETURNING id`,
    [deviceId, type, notes]
  );
  return rows.map((r) => r.id);
}

export async function listAlerts(facilityId, { patientIds = null, days = 7, limit = 300 } = {}) {
  const { rows } = await query(
    `${ALERT_SELECT}
     WHERE a.facility_id = $1
       AND (a.status = ANY($2) OR a.occurred_at >= now() - make_interval(days => $3))
       AND ($4::uuid[] IS NULL OR a.patient_id = ANY($4))
     ORDER BY a.occurred_at DESC
     LIMIT $5`,
    [facilityId, ACTIVE_STATUSES, days, patientIds, limit]
  );
  return attachNotifications(rows);
}

export async function getAlert(facilityId, alertId) {
  const { rows } = await query(`${ALERT_SELECT} WHERE a.facility_id = $1 AND a.id = $2`, [facilityId, alertId]);
  if (!rows[0]) return null;
  return (await attachNotifications(rows))[0];
}

async function attachNotifications(alertRows) {
  if (alertRows.length === 0) return [];
  const { rows } = await query(
    `SELECT n.alert_id, n.channel, n.status, n.destination, n.created_at, n.sent_at,
            u.full_name AS user_name, c.name AS contact_name, c.phone AS contact_phone
     FROM alert_notifications n
     LEFT JOIN users u ON u.id = n.recipient_user_id
     LEFT JOIN emergency_contacts c ON c.id = n.emergency_contact_id
     WHERE n.alert_id = ANY($1)
     ORDER BY n.created_at`,
    [alertRows.map((a) => a.id)]
  );
  const byAlert = new Map();
  for (const n of rows) {
    if (!byAlert.has(n.alert_id)) byAlert.set(n.alert_id, []);
    byAlert.get(n.alert_id).push(n);
  }
  return alertRows.map((a) => toApiAlert(a, byAlert.get(a.id) ?? []));
}

const ms = (value) => (value ? new Date(value).getTime() : undefined);

const RESOLUTION_TEXT = {
  assisted: "assisted the patient",
  false_alarm: "false alarm",
  no_action_needed: "no action needed",
};

function createdText(a, details) {
  if (a.type === "fall" && a.source === "device") return "Band detected a possible fall and started its 15 s cancel countdown";
  if (a.type === "fall") return "Fall raised manually — 15 s cancel countdown started";
  if (a.type === "sos" && a.source === "device") return "SOS pressed on the band";
  if (a.source === "manual") return "Raised manually from the dashboard";
  return details.description ?? "Alert raised";
}

// Database row → the dashboard's Alert shape (frontend/src/lib/types.ts).
export function toApiAlert(a, notifications = []) {
  const details = a.details ?? {};
  const occurredAt = ms(a.occurred_at);
  const events = [{ at: occurredAt, kind: "created", text: createdText(a, details) }];

  if (details.confirmed_at && a.type === "fall") {
    events.push({
      at: ms(details.confirmed_at),
      kind: "confirmed",
      text: details.confirmed_by === "band" ? "Countdown ended without a cancel — alert opened" : "No cancel received — alert opened",
    });
  }
  if (details.escalated_at) {
    events.push({ at: ms(details.escalated_at), kind: "escalated", text: `Escalated to ${a.severity}${details.escalation ? ` — ${details.escalation}` : ""}` });
  }
  if (a.status === "cancelled") {
    events.push({ at: ms(details.cancelled_at) ?? ms(a.updated_at), kind: "cancelled", text: "Cancelled before it opened — kept as false-alarm data" });
  }
  if (a.acknowledged_at) {
    events.push({ at: ms(a.acknowledged_at), kind: "acknowledged", by: a.acknowledged_by_name ?? undefined, text: "Acknowledged — on the way" });
  }
  if (notifications.length) {
    events.push({ at: ms(notifications[0].created_at), kind: "notified", text: `${notifications.length} notification${notifications.length === 1 ? "" : "s"} queued` });
  }
  if (a.resolved_at) {
    events.push({
      at: ms(a.resolved_at),
      kind: "resolved",
      by: a.resolved_by_name ?? "System",
      text: `Resolved — ${RESOLUTION_TEXT[a.resolution] ?? "closed"}`,
    });
  }
  events.sort((x, y) => x.at - y.at);

  return {
    id: a.id,
    type: a.type,
    severity: a.severity,
    status: a.status,
    source: a.source,
    patientId: a.patient_id,
    deviceId: a.device_uid ?? null,
    occurredAt,
    countdownEndsAt: a.status === "pending" ? occurredAt + FALL_COUNTDOWN_MS : undefined,
    locationLabel: a.location_label ?? "Unassigned band",
    hrSnapshot: a.heart_rate_snapshot,
    spo2Snapshot: a.spo2_snapshot,
    impactG: a.impact_g != null ? Number(a.impact_g) : undefined,
    details: details.description ?? "",
    smsSentByDevice: a.sms_sent_by_device,
    acknowledgedAt: ms(a.acknowledged_at),
    acknowledgedBy: a.acknowledged_by_name ?? undefined,
    resolvedAt: ms(a.resolved_at),
    resolvedBy: a.resolved_at ? (a.resolved_by_name ?? "System") : undefined,
    resolution: a.resolution ?? undefined,
    resolutionNotes: a.resolution_notes ?? undefined,
    events,
    notifications: notifications.map((n) => ({
      channel: n.channel === "email" ? "push" : n.channel,
      to: n.user_name ?? (n.contact_name ? `${n.contact_name} · ${n.contact_phone}` : (n.destination ?? "—")),
      status: n.status,
      at: ms(n.sent_at) ?? ms(n.created_at),
    })),
  };
}
