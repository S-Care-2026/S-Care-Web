// What each band last reported, plus a short per-patient sample buffer for the live charts.
// Kept in memory (single backend instance). Redis holds a copy of the latest readings so a
// restart doesn't blank the dashboard; InfluxDB refills the sample buffers on startup.

import { redis } from "../db/redis.js";
import { nsToMs, queryRows, toNumber } from "../db/influx.js";

const BUFFER_WINDOW_MS = 30 * 60 * 1000;
const BUFFER_MAX_SAMPLES = 450;
const MAX_RECENT_EVENTS = 200;
const MAX_SEEN_EVENT_KEYS = 5000;
// Upstash bills per command: persist a band's latest readings at most this often.
const PERSIST_EVERY_MS = 30_000;
const REDIS_TTL_S = 7 * 24 * 3600;

const devices = new Map(); // device_uid -> entry
const buffers = new Map(); // patient_id -> { hr: [{t, v}], spo2: [{t, v}] }
const recentEvents = [];
const seenEventKeys = new Set();
const persistTimers = new Map();

const redisKey = (uid) => `scare:dev:${uid}:latest`;

function entry(uid) {
  let device = devices.get(uid);
  if (!device) {
    device = { device_uid: uid, last_seen_at: null, vitals: null, status: null, location: null, config_acked_version: null };
    devices.set(uid, device);
  }
  return device;
}

function schedulePersist(uid) {
  const r = redis();
  if (!r || persistTimers.has(uid)) return;
  persistTimers.set(
    uid,
    setTimeout(() => {
      persistTimers.delete(uid);
      r.set(redisKey(uid), JSON.stringify(devices.get(uid)), "EX", REDIS_TTL_S).catch(() => {});
    }, PERSIST_EVERY_MS)
  );
}

export function markSeen(uid, receivedAt) {
  const device = entry(uid);
  if (!device.last_seen_at || Date.parse(device.last_seen_at) < receivedAt) {
    device.last_seen_at = new Date(receivedAt).toISOString();
  }
  schedulePersist(uid);
}

export function lastSeenMs(uid) {
  const at = devices.get(uid)?.last_seen_at;
  return at ? Date.parse(at) : null;
}

function pushSample(list, t, v) {
  if (v == null) return;
  if (list.length && list[list.length - 1].t >= t) {
    // Late or repeated batch: keep the list ordered by time.
    if (list.some((s) => s.t === t)) return;
    list.push({ t, v });
    list.sort((a, b) => a.t - b.t);
  } else {
    list.push({ t, v });
  }
  const cutoff = Date.now() - BUFFER_WINDOW_MS;
  while (list.length && (list.length > BUFFER_MAX_SAMPLES || list[0].t < cutoff)) list.shift();
}

// samples: [{ t, hr, spo2, q, clockCorrected }] in time order
export function recordVitals(uid, patientId, samples) {
  const device = entry(uid);
  const latest = [...samples].reverse().find((s) => s.hr != null || s.spo2 != null);
  if (latest && (!device.vitals || Date.parse(device.vitals.ts) <= latest.t)) {
    device.vitals = {
      heart_rate: latest.hr,
      spo2: latest.spo2,
      quality: latest.q,
      ts: new Date(latest.t).toISOString(),
      clock_corrected: latest.clockCorrected,
    };
  }
  if (patientId) {
    let buffer = buffers.get(patientId);
    if (!buffer) buffers.set(patientId, (buffer = { hr: [], spo2: [] }));
    for (const s of samples) {
      pushSample(buffer.hr, s.t, s.hr);
      pushSample(buffer.spo2, s.t, s.spo2);
    }
  }
  schedulePersist(uid);
}

export function recordStatus(uid, status) {
  entry(uid).status = status;
  schedulePersist(uid);
}

export function recordLocation(uid, location) {
  entry(uid).location = location;
  schedulePersist(uid);
}

export function recordConfigAck(uid, version) {
  entry(uid).config_acked_version = version;
  schedulePersist(uid);
}

// Returns false when this event_id was already seen (QoS/firmware redelivery).
export function recordEvent(uid, event) {
  const key = `${uid}:${event.event_id}`;
  if (seenEventKeys.has(key)) return false;
  seenEventKeys.add(key);
  if (seenEventKeys.size > MAX_SEEN_EVENT_KEYS) seenEventKeys.delete(seenEventKeys.values().next().value);
  recentEvents.unshift({ device_uid: uid, ...event });
  recentEvents.length = Math.min(recentEvents.length, MAX_RECENT_EVENTS);
  return true;
}

export function getLiveDevices() {
  return [...devices.values()];
}

export function getLiveDevice(uid) {
  return devices.get(uid) ?? null;
}

export function getRecentEvents(limit = 50) {
  return recentEvents.slice(0, limit);
}

export function getBuffer(patientId, limit = 150) {
  const buffer = buffers.get(patientId);
  if (!buffer) return { hr: [], spo2: [] };
  return { hr: buffer.hr.slice(-limit), spo2: buffer.spo2.slice(-limit) };
}

// Startup: latest readings from Redis (one MGET) and recent samples from InfluxDB (one query).
export async function warmLatest(uids) {
  const r = redis();
  if (r && uids.length) {
    try {
      const values = await Promise.race([
        r.mget(uids.map(redisKey)),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timed out after 5 s")), 5_000)),
      ]);
      values.forEach((json, i) => {
        if (json && !devices.has(uids[i])) devices.set(uids[i], JSON.parse(json));
      });
    } catch (err) {
      console.error(`[latest] Redis warm-up failed: ${err.message}`);
    }
  }

  try {
    const rows = await queryRows(
      `SELECT CAST(time AS BIGINT) AS t, patient_id, heart_rate, spo2
       FROM vitals
       WHERE time >= now() - INTERVAL '30 minutes'
       ORDER BY time`
    );
    for (const row of rows) {
      if (!row.patient_id) continue;
      let buffer = buffers.get(row.patient_id);
      if (!buffer) buffers.set(row.patient_id, (buffer = { hr: [], spo2: [] }));
      const t = nsToMs(row.t);
      pushSample(buffer.hr, t, toNumber(row.heart_rate));
      pushSample(buffer.spo2, t, toNumber(row.spo2));
    }
    if (rows.length) console.log(`[latest] loaded ${rows.length} recent samples from InfluxDB`);
  } catch (err) {
    console.error(`[latest] InfluxDB warm-up failed: ${err.message}`);
  }
}
