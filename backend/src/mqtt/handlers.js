// Payload validation and handling, one function per topic kind.
// Topics and QoS follow database/README.md → "MQTT topics".
//
// Payload contract (JSON, timestamps in epoch milliseconds):
//
//   vitals    { "v": 1, "t0": 1757600000000, "dt": 10000,
//               "hr": [74, 75], "spo2": [98, 97], "q": [92, 90] }
//             hr/spo2/q are parallel arrays; spo2 and q are optional; null = no reading.
//   status    { "battery": 82, "charging": false, "rssi": -61, "network": "wifi", "worn": true, "ts": ... }
//   location  { "lat": 10.7626, "lon": 106.6601, "accuracy": 12.5, "source": "gps", "ts": ... }
//   events    { "event_id": "e-000123", "type": "fall_detected", "incident_id": "i-000045", "ts": ... }
//   motion    { "incident_id": "i-000045", "t0": ..., "hz": 50,
//               "ax": [...], "ay": [...], "az": [...], "gx": [...], "gy": [...], "gz": [...] }
//   ack       { "config_version": 3 }
//
// "ts" is optional everywhere; the arrival time is used when it's missing or implausible.
//
// Every events message that carries an event_id gets a reply on <prefix>/<uid>/event_ack (QoS 1):
//   { "event_id": "e-000123", "status": "received", "received_at": "2026-09-17T08:00:00.000Z" }
//   { "event_id": "e-000123", "status": "rejected", "error": "unknown event type \"fal\"" }
// "received" is also sent for a duplicate, so the band stops retrying. A band that gets no
// reply should resend the same event_id — the backend drops the repeat.

import {
  recordConfigAck,
  recordEvent,
  recordLocation,
  recordStatus,
  recordVitals,
} from "./liveStore.js";

// Band clocks drift in deep sleep: accept samples from the last 24 h up to 2 min ahead.
const MAX_SAMPLE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_SAMPLE_LEAD_MS = 2 * 60 * 1000;
// Sensor confidence (0–100) below which a sample is dropped. Tune against the real sensor.
const MIN_SAMPLE_QUALITY = 50;
const MAX_SAMPLES_PER_BATCH = 1000;

const EVENT_TYPES = new Set(["fall_detected", "fall_cancelled", "fall_confirmed", "sos"]);
const NETWORKS = new Set(["wifi", "cellular"]);
const LOCATION_SOURCES = new Set(["gps", "cell", "wifi"]);
const MOTION_AXES = ["ax", "ay", "az", "gx", "gy", "gz"];

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

function eventTime(payload, receivedAt) {
  return new Date(plausibleTimestamp(payload.ts, receivedAt) ? payload.ts : receivedAt).toISOString();
}

function optionalArray(payload, key, length) {
  const value = payload[key];
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length !== length) {
    throw new PayloadError(`"${key}" must be an array the same length as "hr"`);
  }
  return value;
}

function handleVitals(uid, payload, receivedAt, log) {
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

    samples.push({ t: t0 + i * payload.dt, hr, spo2: sp, q, clockCorrected });
  }

  if (clockCorrected) log.warn(`${uid}: vitals timestamps out of range, re-anchored to arrival time`);
  if (samples.length === 0) {
    log.info(`${uid}: vitals batch of ${count} had no usable samples`);
    return;
  }

  recordVitals(uid, samples, receivedAt);
  const latest = samples[samples.length - 1];
  log.info(`${uid}: vitals ${samples.length}/${count} usable, latest hr=${latest.hr} spo2=${latest.spo2}`);
}

function handleStatus(uid, payload, receivedAt, log) {
  const status = {
    battery_pct: inRangeOrNull(payload.battery, 0, 100),
    charging: typeof payload.charging === "boolean" ? payload.charging : null,
    rssi_dbm: inRangeOrNull(payload.rssi, -150, 0),
    network: NETWORKS.has(payload.network) ? payload.network : null,
    worn: typeof payload.worn === "boolean" ? payload.worn : null,
    ts: eventTime(payload, receivedAt),
  };
  if (status.battery_pct === null && status.worn === null && status.rssi_dbm === null) {
    throw new PayloadError("status has none of battery, worn, rssi");
  }

  recordStatus(uid, status, receivedAt);
  log.info(`${uid}: status battery=${status.battery_pct}% worn=${status.worn} network=${status.network}`);
}

function handleLocation(uid, payload, receivedAt, log) {
  const lat = inRangeOrNull(payload.lat, -90, 90);
  const lon = inRangeOrNull(payload.lon, -180, 180);
  if (lat === null || lon === null) throw new PayloadError('"lat"/"lon" missing or out of range');

  const location = {
    lat,
    lon,
    accuracy_m: isNumber(payload.accuracy) && payload.accuracy >= 0 ? payload.accuracy : null,
    source: LOCATION_SOURCES.has(payload.source) ? payload.source : null,
    ts: eventTime(payload, receivedAt),
  };

  recordLocation(uid, location, receivedAt);
  log.info(`${uid}: location ${lat.toFixed(5)},${lon.toFixed(5)} (${location.source ?? "unknown"})`);
}

function handleEvent(uid, payload, receivedAt, log) {
  // Without an event_id there's nothing the band could match a reply to.
  if (typeof payload.event_id !== "string" || payload.event_id.length === 0) {
    throw new PayloadError('"event_id" is required so redeliveries can be ignored');
  }
  if (!EVENT_TYPES.has(payload.type)) {
    const error = `unknown event type "${payload.type}"`;
    throw new PayloadError(error, { event_id: payload.event_id, status: "rejected", error });
  }

  const event = {
    event_id: payload.event_id,
    type: payload.type,
    incident_id: typeof payload.incident_id === "string" ? payload.incident_id : null,
    ts: eventTime(payload, receivedAt),
    received_at: new Date(receivedAt).toISOString(),
  };

  // TODO: once events are written to Postgres, reply only after the transaction commits.
  const reply = { event_id: event.event_id, status: "received", received_at: event.received_at };

  if (!recordEvent(uid, event, receivedAt)) {
    log.info(`${uid}: duplicate event ${event.event_id} ignored`);
    return reply;
  }

  const line = `${uid}: EVENT ${event.type} (event ${event.event_id}, incident ${event.incident_id})`;
  if (event.type === "sos" || event.type === "fall_detected" || event.type === "fall_confirmed") {
    log.warn(line);
  } else {
    log.info(line);
  }
  return reply;
}

function handleMotion(uid, payload, receivedAt, log) {
  if (typeof payload.incident_id !== "string") throw new PayloadError('"incident_id" is required');
  if (!isNumber(payload.hz) || payload.hz <= 0) throw new PayloadError('"hz" must be a positive number');

  const length = Array.isArray(payload.ax) ? payload.ax.length : 0;
  for (const axis of MOTION_AXES) {
    if (!Array.isArray(payload[axis]) || payload[axis].length !== length) {
      throw new PayloadError(`"${axis}" must be an array the same length as "ax"`);
    }
  }

  // Not stored yet — the motion window goes to InfluxDB once it's wired up.
  log.info(`${uid}: motion window for incident ${payload.incident_id}, ${length} samples @ ${payload.hz} Hz`);
}

function handleAck(uid, payload, receivedAt, log) {
  if (!Number.isInteger(payload.config_version) || payload.config_version < 0) {
    throw new PayloadError('"config_version" must be a non-negative integer');
  }

  recordConfigAck(uid, payload.config_version, receivedAt);
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
