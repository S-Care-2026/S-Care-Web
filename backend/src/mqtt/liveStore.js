// In-memory view of what the bands last reported.
// Stand-in for the Redis keys in database/README.md — lost on restart,
// and only valid while the backend runs as a single instance.

const MAX_RECENT_EVENTS = 200;
const MAX_SEEN_EVENT_KEYS = 5000;

const devices = new Map();
const recentEvents = [];
const seenEventKeys = new Set();

function touch(uid, receivedAt) {
  let device = devices.get(uid);
  if (!device) {
    device = {
      device_uid: uid,
      last_seen_at: null,
      vitals: null,
      status: null,
      location: null,
      config_acked_version: null,
    };
    devices.set(uid, device);
  }
  device.last_seen_at = new Date(receivedAt).toISOString();
  return device;
}

export function recordVitals(uid, samples, receivedAt) {
  const device = touch(uid, receivedAt);
  const latest = samples[samples.length - 1];
  device.vitals = {
    heart_rate: latest.hr,
    spo2: latest.spo2,
    quality: latest.q,
    ts: new Date(latest.t).toISOString(),
    clock_corrected: latest.clockCorrected,
  };
}

export function recordStatus(uid, status, receivedAt) {
  touch(uid, receivedAt).status = status;
}

export function recordLocation(uid, location, receivedAt) {
  touch(uid, receivedAt).location = location;
}

export function recordConfigAck(uid, version, receivedAt) {
  touch(uid, receivedAt).config_acked_version = version;
}

// Returns false for a QoS 1 redelivery that was already recorded.
export function recordEvent(uid, event, receivedAt) {
  const key = `${uid}:${event.event_id}`;
  if (seenEventKeys.has(key)) return false;

  seenEventKeys.add(key);
  if (seenEventKeys.size > MAX_SEEN_EVENT_KEYS) {
    seenEventKeys.delete(seenEventKeys.values().next().value);
  }

  touch(uid, receivedAt);
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
