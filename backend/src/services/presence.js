// Band check-ins and the background checks that don't wait for a message:
// offline bands, and falls whose cancel window passed without word from the band.

import { query } from "../db/postgres.js";
import { autoResolve, createAlert } from "./alerts.js";
import { locationLabel } from "./context.js";
import { lastSeenMs, markSeen } from "./latest.js";

const db = { query };
const SWEEP_EVERY_MS = 15_000;
const LAST_SEEN_FLUSH_MS = 30_000;
// A band-detected fall opens if neither cancel nor confirm arrives within countdown + 30 s.
const DEVICE_FALL_TIMEOUT_S = 45;
const MANUAL_FALL_TIMEOUT_S = 15;

const log = {
  info: (msg) => console.log(`[presence] ${msg}`),
  warn: (msg) => console.warn(`[presence] ${msg}`),
  error: (msg) => console.error(`[presence] ${msg}`),
};

const lastFlushed = new Map(); // device_id -> ms
// device_ids offline in the current outage. Stays set after a person resolves the alert,
// so it isn't raised again until the band has checked in once.
const offlineOpen = new Set();
let timer = null;
let sweeping = false;

// Called for every message from a registered band.
export async function deviceSeen(ctx, receivedAt) {
  markSeen(ctx.deviceUid, receivedAt);

  if (receivedAt - (lastFlushed.get(ctx.deviceId) ?? 0) >= LAST_SEEN_FLUSH_MS) {
    lastFlushed.set(ctx.deviceId, receivedAt);
    await query("UPDATE devices SET last_seen_at = GREATEST(COALESCE(last_seen_at, 'epoch'), $2) WHERE id = $1", [
      ctx.deviceId,
      new Date(receivedAt),
    ]);
  }

  if (offlineOpen.has(ctx.deviceId)) {
    offlineOpen.delete(ctx.deviceId);
    const closed = await autoResolve(db, ctx.deviceId, "offline", "Band reconnected.");
    if (closed.length) log.info(`${ctx.deviceUid} reconnected — offline alert resolved`);
  }
}

async function sweepOffline() {
  const { rows } = await query(
    `SELECT d.id, d.device_uid, d.facility_id, d.heartbeat_interval_s, d.last_seen_at,
            a.patient_id, r.name AS room, z.name AS zone
     FROM devices d
     JOIN device_assignments a ON a.device_id = d.id AND a.unassigned_at IS NULL
     JOIN patients p ON p.id = a.patient_id AND p.discharged_at IS NULL
     LEFT JOIN rooms r ON r.id = p.room_id
     LEFT JOIN zones z ON z.id = r.zone_id
     WHERE d.lifecycle = 'active' AND d.facility_id IS NOT NULL`
  );
  const now = Date.now();

  for (const d of rows) {
    const seen = Math.max(lastSeenMs(d.device_uid) ?? 0, d.last_seen_at ? d.last_seen_at.getTime() : 0);
    if (!seen || offlineOpen.has(d.id)) continue; // never connected: nothing to miss yet
    const deadline = seen + d.heartbeat_interval_s * 2 * 1000;
    if (now <= deadline) continue;

    const result = await createAlert(db, {
      facilityId: d.facility_id,
      patientId: d.patient_id,
      deviceId: d.id,
      type: "offline",
      severity: "warning",
      source: "system",
      occurredAt: deadline,
      locationLabel: locationLabel(d.room, d.zone),
      details: { description: `${d.device_uid} missed two check-ins (every ${d.heartbeat_interval_s} s).`, last_seen_at: new Date(seen).toISOString() },
    });
    offlineOpen.add(d.id);
    if (result.created) log.warn(`${d.device_uid} offline — last seen ${new Date(seen).toISOString()}`);
  }
}

async function sweepPendingFalls() {
  const { rows } = await query(
    `UPDATE alerts
     SET status = 'open',
         details = details || jsonb_build_object('confirmed_at', now()::text, 'confirmed_by', 'timeout')
     WHERE status = 'pending'
       AND received_at < now() - make_interval(secs => CASE WHEN source = 'manual' THEN $1::int ELSE $2::int END)
     RETURNING id`,
    [MANUAL_FALL_TIMEOUT_S, DEVICE_FALL_TIMEOUT_S]
  );
  if (rows.length) log.warn(`${rows.length} fall alert(s) opened after the cancel window passed`);
}

async function sweep() {
  if (sweeping) return;
  sweeping = true;
  try {
    await sweepPendingFalls();
    await sweepOffline();
  } catch (err) {
    log.error(`sweep failed: ${err.message}`);
  } finally {
    sweeping = false;
  }
}

export async function startPresence() {
  const { rows } = await query("SELECT DISTINCT device_id FROM alerts WHERE type = 'offline' AND status IN ('open', 'acknowledged')");
  rows.forEach((r) => offlineOpen.add(r.device_id));
  timer = setInterval(() => void sweep(), SWEEP_EVERY_MS);
  void sweep();
}

export function stopPresence() {
  if (timer) clearInterval(timer);
  timer = null;
}
