// Small request validation helpers shared by the controllers.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const E164 = /^\+[1-9][0-9]{7,14}$/;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requireUuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) throw new HttpError(400, `${label} is not a valid id`);
  return value;
}

export function requireText(value, label, max = 200) {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `Enter ${label}.`);
  if (value.trim().length > max) throw new HttpError(400, `${label} is too long (max ${max} characters).`);
  return value.trim();
}

export function requirePhone(value) {
  const phone = typeof value === "string" ? value.replace(/[\s()-]/g, "") : "";
  if (!E164.test(phone)) throw new HttpError(400, "Use international format, e.g. +84901234567.");
  return phone;
}

export function optionalText(value, max = 2000) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, "Notes must be text.");
  return value.trim().slice(0, max) || null;
}

const THRESHOLD_BOUNDS = {
  hrCritLow: [20, 250],
  hrWarnLow: [20, 250],
  hrWarnHigh: [20, 250],
  hrCritHigh: [20, 250],
  spo2WarnLow: [50, 100],
  spo2CritLow: [50, 100],
  batteryWarn: [0, 100],
  batteryCrit: [0, 100],
  sustainSeconds: [0, 3600],
};

export const BUILT_IN_THRESHOLDS = {
  hrCritLow: 45,
  hrWarnLow: 50,
  hrWarnHigh: 100,
  hrCritHigh: 125,
  spo2WarnLow: 95,
  spo2CritLow: 90,
  batteryWarn: 20,
  batteryCrit: 10,
  sustainSeconds: 300,
};

// Accepts a partial thresholds object; unknown keys are ignored, values must be whole numbers in range.
export function parseThresholds(body) {
  if (body == null || typeof body !== "object") throw new HttpError(400, "Send the thresholds as a JSON object.");
  const out = {};
  for (const [key, [min, max]] of Object.entries(THRESHOLD_BOUNDS)) {
    const value = body[key];
    if (value == null || value === "") continue;
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new HttpError(400, `${key} must be a whole number between ${min} and ${max}.`);
    }
    out[key] = value;
  }
  return out;
}

// Same rules as the dashboard's validateThresholds, on the fully merged values.
export function checkThresholdOrder(t) {
  if (!(t.hrCritLow < t.hrWarnLow)) return "Heart rate: critical low must be below warning low.";
  if (!(t.hrWarnLow < t.hrWarnHigh)) return "Heart rate: warning low must be below warning high.";
  if (!(t.hrWarnHigh < t.hrCritHigh)) return "Heart rate: warning high must be below critical high.";
  if (!(t.spo2CritLow < t.spo2WarnLow)) return "SpO₂: critical low must be below warning low.";
  if (!(t.batteryCrit < t.batteryWarn)) return "Battery: critical must be below warning.";
  return null;
}
