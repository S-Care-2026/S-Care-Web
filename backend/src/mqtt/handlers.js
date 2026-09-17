// Payload validation and storage, one function per topic kind.
// Topics and QoS follow database/README.md → "MQTT topics".
//
// Payload contract (JSON, timestamps in epoch milliseconds):
//
//   vitals    { "v": 1, "t0": 1757600000000, "dt": 10000,
//               "hr": [74, 75], "spo2": [98, 97], "q": [92, 90] }
//             hr/spo2/q are parallel arrays; spo2 and q are optional; null = no reading.
//   status    { "battery": 82, "charging": false, "rssi": -61, "network": "wifi", "worn": true, "ts": ... }
//   location  { "lat": 10.7626, "lon": 106.6601, "accuracy": 12.5, "source": "gps", "ts": ... }
//   events    { "event_id": "e-000123", "type": "fall_detected", "incident_id": "i-000045", "ts": ..., "impact_g": 3.2 }
//   motion    { "incident_id": "i-000045", "t0": ..., "hz": 50,
//               "ax": [...], "ay": [...], "az": [...], "gx": [...], "gy": [...], "gz": [...] }
//   ack       { "config_version": 3 }
//
// "ts" is optional everywhere; the arrival time is used when it's missing or implausible.
//
// Every events message that carries an event_id gets a reply on <prefix>/<uid>/event_ack (QoS 1),
// sent after the event is stored:
//   { "event_id": "e-000123", "status": "received", "received_at": "2026-09-17T08:00:00.000Z" }
//   { "event_id": "e-000123", "status": "rejected", "error": "unknown event type \"fal\"" }
// "received" is also sent for a duplicate, so the band stops retrying. A band that gets no
// reply should resend the same event_id — the backend drops the repeat.
//
// Where readings go:
//   Postgres  alerts (falls, SOS, rule breaches), devices.last_seen_at / config_acked_version
//   InfluxDB  vitals, device_status, location, motion
//   memory    latest reading per band + 30 min sample buffer (Redis keeps a copy of the latest)

import { query } from "../db/postgres.js";
import { Point, writePoints } from "../db/influx.js";
import { createAlert } from "../services/alerts.js";
import { deviceContext, invalidateDevice } from "../services/context.js";
import {
  getLiveDevice,
  recordConfigAck,
  recordEvent,
  recordLocation,
  recordStatus,
  recordVitals,
} from "../services/latest.js";
import { deviceSeen } from "../services/presence.js";
import { evaluateBattery, evaluateVitals } from "../services/rules.js";

// Band clocks drift in deep sleep: accept samples from the last 24 h up to 2 min ahead.
const MAX_SAMPLE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_SAMPLE_LEAD_MS = 2 * 60 * 1000;
// Sensor confidence (0–100) below which a sample is dropped. Tune against the real sensor.
const MIN_SAMPLE_QUALITY = 50;
const MAX_SAMPLES_PER_BATCH = 1000;
const MAX_MOTION_SAMPLES = 2000;
// Vitals older than this aren't used as the snapshot on a new alert.
const SNAPSHOT_MAX_AGE_MS = 5 * 60_000;

const EVENT_TYPES = new Set(["fall_detected", "fall_cancelled", "fall_confirmed", "sos"]);
const NETWORKS = new Set(["wifi", "cellular"]);
const LOCATION_SOURCES = new Set(["gps", "cell", "wifi"]);
const MOTION_AXES = ["ax", "ay", "az", "gx", "gy", "gz"];

const db = { query };

export class PayloadError extends Error {
  // `reply`, when set, is sent back to the band so it knows the message was refused.
  constructor(message, reply = null) {
    super(message);
    this.reply = reply;
  }
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function inRangeOrNull(value, min, max) {
  return isNumber(value) && value >= min && value <= max ? value : null;
}

function plausibleTimestamp(ts, receivedAt) {
  return isNumber(ts) && ts >= receivedAt - MAX_SAMPLE_AGE_MS && ts <= receivedAt + MAX_SAMPLE_LEAD_MS;
}

function eventTimeMs(payload, receivedAt) {
  return plausibleTimestamp(payload.ts, receivedAt) ? payload.ts : receivedAt;
}

function optionalArray(payload, key, length) {
  const value = payload[key];
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length !== length) {
    throw new PayloadError(`"${key}" must be an array the same length as "hr"`);
  }
  return value;
}

const unknownLogged = new Map();

// Registered bands only. Unknown uids are logged at most once a minute each.
async function requireContext(uid, log) {
  const ctx = await deviceContext(uid);
  if (!ctx) {
    if (Date.now() - (unknownLogged.get(uid) ?? 0) > 60_000) {
      unknownLogged.set(uid, Date.now());
      log.warn(`${uid}: not registered in the devices table — message ignored`);
    }
    return null;
  }
  return ctx;
}

function tags(point, ctx, { patient = true } = {}) {
  point.setTag("device_id", ctx.deviceId);
  if (ctx.facilityId) point.setTag("facility_id", ctx.facilityId);
  if (patient && ctx.patientId) point.setTag("patient_id", ctx.patientId);
  return point;
}

function latestSnapshot(uid) {
  const vitals = getLiveDevice(uid)?.vitals;
  if (!vitals || Date.now() - Date.parse(vitals.ts) > SNAPSHOT_MAX_AGE_MS) return { hr: null, spo2: null };
  return { hr: vitals.heart_rate, spo2: vitals.spo2 };
}

function parseVitals(payload, receivedAt) {
  if (payload.v !== 1) throw new PayloadError(`unsupported vitals version ${payload.v}`);
  if (!isNumber(payload.t0)) throw new PayloadError('"t0" must be a number');
  if (!isNumber(payload.dt) || payload.dt <= 0) throw new PayloadError('"dt" must be a positive number');
  if (!Array.isArray(payload.hr) || payload.hr.length === 0) {
    throw new PayloadError('"hr" must be a non-empty array');
  }
  const count = payload.hr.length;
  if (count > MAX_SAMPLES_PER_BATCH) throw new PayloadError(`batch of ${count} samples is too large`);

  const spo2 = optionalArray(payload, "spo2", count);
  const quality = optionalArray(payload, "q", count);

  // If the batch's clock is off, re-anchor it so the last sample lands at arrival time.
  const lastT = payload.t0 + (count - 1) * payload.dt;
  const clockCorrected = !plausibleTimestamp(payload.t0, receivedAt) || !plausibleTimestamp(lastT, receivedAt);
  const t0 = clockCorrected ? receivedAt - (count - 1) * payload.dt : payload.t0;

  const samples = [];
  for (let i = 0; i < count; i++) {
    const q = quality ? inRangeOrNull(quality[i], 0, 100) : null;
    if (q !== null && q < MIN_SAMPLE_QUALITY) continue;

    const hr = inRangeOrNull(payload.hr[i], 20, 250);
    const sp = spo2 ? inRangeOrNull(spo2[i], 50, 100) : null;
    if (hr === null && sp === null) continue;

    samples.push({ t: Math.round(t0 + i * payload.dt), hr: hr === null ? null : Math.round(hr), spo2: sp === null ? null : Math.round(sp), q, clockCorrected });
  }
  return { samples, count, clockCorrected };
}

async function handleVitals(uid, payload, receivedAt, log) {
  const { samples, count, clockCorrected } = parseVitals(payload, receivedAt);
  const ctx = await requireContext(uid, log);
  if (!ctx) return;
  await deviceSeen(ctx, receivedAt);

  if (clockCorrected) log.warn(`${uid}: vitals timestamps out of range, re-anchored to arrival time`);
  if (samples.length === 0) {
    log.info(`${uid}: vitals batch of ${count} had no usable samples`);
    return;
  }

  recordVitals(uid, ctx.patientId, samples);
  if (!ctx.patientId) {
    log.info(`${uid}: vitals received but the band isn't assigned to a patient — not stored`);
    return;
  }

  writePoints(
    samples.map((s) => {
      const p = tags(Point.measurement("vitals"), ctx).setTimestamp(new Date(s.t));
      if (s.hr != null) p.setIntegerField("heart_rate", s.hr);
      if (s.spo2 != null) p.setIntegerField("spo2", s.spo2);
      if (s.q != null) p.setIntegerField("quality", Math.round(s.q));
      return p;
    })
  );
  await evaluateVitals(ctx, samples, log);

  const latest = samples[samples.length - 1];
  log.info(`${uid}: vitals ${samples.length}/${count} stored, latest hr=${latest.hr} spo2=${latest.spo2}`);
}

async function handleStatus(uid, payload, receivedAt, log) {
  const status = {
    battery_pct: inRangeOrNull(payload.battery, 0, 100),
    charging: typeof payload.charging === "boolean" ? payload.charging : null,
    rssi_dbm: inRangeOrNull(payload.rssi, -150, 0),
    network: NETWORKS.has(payload.network) ? payload.network : null,
    worn: typeof payload.worn === "boolean" ? payload.worn : null,
    ts: new Date(eventTimeMs(payload, receivedAt)).toISOString(),
  };
  if (status.battery_pct === null && status.worn === null && status.rssi_dbm === null) {
    throw new PayloadError("status has none of battery, worn, rssi");
  }
  if (status.battery_pct !== null) status.battery_pct = Math.round(status.battery_pct);

  const ctx = await requireContext(uid, log);
  if (!ctx) return;
  await deviceSeen(ctx, receivedAt);
  recordStatus(uid, status);

  const point = tags(Point.measurement("device_status"), ctx, { patient: false }).setTimestamp(new Date(status.ts));
  if (status.battery_pct !== null) point.setIntegerField("battery_pct", status.battery_pct);
  if (status.charging !== null) point.setBooleanField("charging", status.charging);
  if (status.rssi_dbm !== null) point.setIntegerField("rssi_dbm", Math.round(status.rssi_dbm));
  if (status.network !== null) point.setStringField("network", status.network);
  if (status.worn !== null) point.setBooleanField("worn", status.worn);
  writePoints([point]);

  await evaluateBattery(ctx, status, receivedAt, log);
  log.info(`${uid}: status battery=${status.battery_pct}% worn=${status.worn} network=${status.network}`);
}

async function handleLocation(uid, payload, receivedAt, log) {
  const lat = inRangeOrNull(payload.lat, -90, 90);
  const lon = inRangeOrNull(payload.lon, -180, 180);
  if (lat === null || lon === null) throw new PayloadError('"lat"/"lon" missing or out of range');

  const location = {
    lat,
    lon,
    accuracy_m: isNumber(payload.accuracy) && payload.accuracy >= 0 ? payload.accuracy : null,
    source: LOCATION_SOURCES.has(payload.source) ? payload.source : null,
    ts: new Date(eventTimeMs(payload, receivedAt)).toISOString(),
  };

  const ctx = await requireContext(uid, log);
  if (!ctx) return;
  await deviceSeen(ctx, receivedAt);
  recordLocation(uid, location);

  const point = tags(Point.measurement("location"), ctx).setTimestamp(new Date(location.ts)).setFloatField("lat", lat).setFloatField("lon", lon);
  if (location.accuracy_m !== null) point.setFloatField("accuracy_m", location.accuracy_m);
  if (location.source !== null) point.setStringField("source", location.source);
  writePoints([point]);

  log.info(`${uid}: location ${lat.toFixed(5)},${lon.toFixed(5)} (${location.source ?? "unknown"})`);
}

async function storeEvent(ctx, event, payload, log) {
  const snapshot = latestSnapshot(ctx.deviceUid);
  const base = {
    facilityId: ctx.facilityId,
    patientId: ctx.patientId,
    deviceId: ctx.deviceId,
    type: event.type === "sos" ? "sos" : "fall",
    severity: "critical",
    source: "device",
    deviceEventId: event.event_id,
    occurredAt: event.tsMs,
    locationLabel: ctx.locationLabel,
    heartRate: snapshot.hr,
    spo2: snapshot.spo2,
    impactG: isNumber(payload.impact_g) ? payload.impact_g : undefined,
  };

  if (event.type === "sos") {
    const r = await createAlert(db, { ...base, status: "open", details: { description: "SOS button pressed on the band.", incident_id: event.incident_id } });
    return r.created ? "SOS alert opened" : "SOS already stored";
  }

  if (event.type === "fall_detected") {
    const r = await createAlert(db, {
      ...base,
      status: "pending",
      details: { description: "Band detected a possible fall. Waiting for the wearer to cancel.", incident_id: event.incident_id },
    });
    return r.created ? "fall alert pending (countdown)" : "fall already stored";
  }

  // fall_cancelled / fall_confirmed: find the pending fall of the same incident (or the latest one).
  const nextStatus = event.type === "fall_cancelled" ? "cancelled" : "open";
  const stamp = event.type === "fall_cancelled" ? "cancelled_at" : "confirmed_at";
  const { rows } = await query(
    `UPDATE alerts
     SET status = $2,
         details = details || jsonb_build_object($3::text, now()::text)
                   || CASE WHEN $2 = 'open' THEN '{"confirmed_by": "band"}'::jsonb ELSE '{}'::jsonb END
     WHERE id = (
       SELECT id FROM alerts
       WHERE device_id = $1 AND type = 'fall' AND status = 'pending'
         AND ($4::text IS NULL OR details->>'incident_id' = $4)
       ORDER BY occurred_at DESC
       LIMIT 1
     )
     RETURNING id`,
    [ctx.deviceId, nextStatus, stamp, event.incident_id]
  );
  if (rows.length) return event.type === "fall_cancelled" ? "fall cancelled by the wearer" : "fall confirmed — alert opened";

  // Nothing pending: already confirmed/cancelled/opened by timeout (a retry), or never detected.
  const { rows: known } = await query(
    `SELECT status FROM alerts
     WHERE device_id = $1 AND type = 'fall'
       AND (($2::text IS NOT NULL AND details->>'incident_id' = $2)
            OR ($2::text IS NULL AND occurred_at > now() - interval '10 minutes'))
     ORDER BY occurred_at DESC
     LIMIT 1`,
    [ctx.deviceId, event.incident_id]
  );
  if (known.length) return `fall already ${known[0].status}`;

  if (event.type === "fall_confirmed") {
    // The fall_detected message never arrived: open the alert now.
    const r = await createAlert(db, {
      ...base,
      status: "open",
      details: { description: "Fall confirmed by the band (no cancel during the countdown).", incident_id: event.incident_id, confirmed_at: new Date().toISOString(), confirmed_by: "band" },
    });
    return r.created ? "fall alert opened" : "fall already stored";
  }
  return "no pending fall to cancel (already opened or unknown incident)";
}

async function handleEvent(uid, payload, receivedAt, log) {
  // Without an event_id there's nothing the band could match a reply to.
  if (typeof payload.event_id !== "string" || payload.event_id.length === 0 || payload.event_id.length > 128) {
    throw new PayloadError('"event_id" is required (1–128 characters) so redeliveries can be ignored');
  }
  const reject = (error) => new PayloadError(error, { event_id: payload.event_id, status: "rejected", error });
  if (!EVENT_TYPES.has(payload.type)) throw reject(`unknown event type "${payload.type}"`);

  const ctx = await deviceContext(uid);
  if (!ctx) throw reject(`device ${uid} is not registered`);
  if (!ctx.facilityId) throw reject(`device ${uid} is not claimed by a facility`);
  await deviceSeen(ctx, receivedAt);

  const tsMs = eventTimeMs(payload, receivedAt);
  const event = {
    event_id: payload.event_id,
    type: payload.type,
    incident_id: typeof payload.incident_id === "string" ? payload.incident_id : null,
    ts: new Date(tsMs).toISOString(),
    received_at: new Date(receivedAt).toISOString(),
  };

  // Store first; the reply means "safely recorded". A database error throws, sends no reply,
  // and the band's retry delivers the event again.
  const outcome = await storeEvent(ctx, { ...event, tsMs }, payload, log);
  const isNew = recordEvent(uid, event);

  const line = `${uid}: EVENT ${event.type} (event ${event.event_id}, incident ${event.incident_id}) — ${outcome}`;
  if (isNew && (event.type === "sos" || event.type === "fall_detected" || event.type === "fall_confirmed")) log.warn(line);
  else log.info(line);

  return { event_id: event.event_id, status: "received", received_at: event.received_at };
}

async function handleMotion(uid, payload, receivedAt, log) {
  if (typeof payload.incident_id !== "string") throw new PayloadError('"incident_id" is required');
  if (!isNumber(payload.hz) || payload.hz <= 0 || payload.hz > 1000) throw new PayloadError('"hz" must be between 0 and 1000');

  const length = Array.isArray(payload.ax) ? payload.ax.length : 0;
  if (length > MAX_MOTION_SAMPLES) throw new PayloadError(`motion window of ${length} samples is too large`);
  for (const axis of MOTION_AXES) {
    if (!Array.isArray(payload[axis]) || payload[axis].length !== length) {
      throw new PayloadError(`"${axis}" must be an array the same length as "ax"`);
    }
  }

  const ctx = await requireContext(uid, log);
  if (!ctx) return;
  await deviceSeen(ctx, receivedAt);

  const stepMs = 1000 / payload.hz;
  const t0 = plausibleTimestamp(payload.t0, receivedAt) ? payload.t0 : receivedAt - (length - 1) * stepMs;
  const points = [];
  for (let i = 0; i < length; i++) {
    const p = tags(Point.measurement("motion"), ctx, { patient: false }).setTimestamp(new Date(Math.round(t0 + i * stepMs)));
    let fields = 0;
    for (const axis of MOTION_AXES) {
      if (isNumber(payload[axis][i])) {
        p.setFloatField(axis, payload[axis][i]);
        fields++;
      }
    }
    if (fields) points.push(p);
  }
  writePoints(points);

  log.info(`${uid}: motion window for incident ${payload.incident_id}, ${points.length} samples @ ${payload.hz} Hz stored`);
}

async function handleAck(uid, payload, receivedAt, log) {
  if (!Number.isInteger(payload.config_version) || payload.config_version < 0) {
    throw new PayloadError('"config_version" must be a non-negative integer');
  }

  const ctx = await requireContext(uid, log);
  if (!ctx) return;
  await deviceSeen(ctx, receivedAt);
  recordConfigAck(uid, payload.config_version);

  await query(
    "UPDATE devices SET config_acked_version = GREATEST(config_acked_version, LEAST($2::int, config_version)) WHERE id = $1",
    [ctx.deviceId, payload.config_version]
  );
  invalidateDevice(uid);
  log.info(`${uid}: acked config version ${payload.config_version}`);
}

// `replyTopic`: where a handler's return value (or a PayloadError's reply) is published.
// It must not be one of these keys, or the backend would receive its own replies.
export const handlers = {
  vitals: { qos: 0, handle: handleVitals },
  status: { qos: 0, handle: handleStatus },
  location: { qos: 0, handle: handleLocation },
  events: { qos: 1, handle: handleEvent, replyTopic: "event_ack" },
  motion: { qos: 1, handle: handleMotion },
  ack: { qos: 1, handle: handleAck },
};
