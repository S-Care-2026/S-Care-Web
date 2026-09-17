// Alert rules evaluated on incoming readings, mirroring the dashboard simulator:
// a vital past its warning bound for `sustain_seconds`, or past its critical bound on
// 2 consecutive samples, opens an alert (warning → critical escalates the open one).

import { query } from "../db/postgres.js";
import { autoResolve, createAlert, escalate } from "./alerts.js";
import { thresholdsFor } from "./thresholds.js";

const db = { query };
// A gap this long between out-of-range samples starts a new streak.
const STREAK_GAP_MS = 5 * 60_000;
// Remember "an alert of this kind is already open" briefly, to skip redundant inserts.
const ACTIVE_TTL_MS = 60_000;
const BUILT_IN_BATTERY = { warn: 20, crit: 10 };

const breaches = new Map(); // `${patientId}:${type}` -> { since, lastT, critCount }
const known = new Map(); // key -> { severity: 'none' | 'info' | 'warning' | 'critical', expires }

const RANK = { none: -1, info: 0, warning: 1, critical: 2 };

function hrLevel(hr, t) {
  if (hr >= t.hr_crit_high || hr <= t.hr_crit_low) return "critical";
  if (hr > t.hr_warn_high || hr < t.hr_warn_low) return "warning";
  return "normal";
}

function spo2Level(spo2, t) {
  if (spo2 <= t.spo2_crit_low) return "critical";
  if (spo2 < t.spo2_warn_low) return "warning";
  return "normal";
}

function knownSeverity(key) {
  const hit = known.get(key);
  return hit && hit.expires > Date.now() ? hit.severity : null;
}

function remember(key, severity) {
  known.set(key, { severity, expires: Date.now() + ACTIVE_TTL_MS });
}

export function forgetAlertState(patientOrDeviceId) {
  for (const key of known.keys()) if (key.startsWith(`${patientOrDeviceId}:`)) known.delete(key);
}

// Opens the alert, or escalates the active one; returns what happened for logging.
async function raise(key, alert, severity) {
  const cached = knownSeverity(key);
  if (cached && RANK[cached] >= RANK[severity]) return null;

  const result = await createAlert(db, { ...alert, severity });
  if (result.created) {
    remember(key, severity);
    return "opened";
  }
  if (result.id && RANK[severity] > RANK[result.severity ?? "info"]) {
    await escalate(db, result.id, severity, alert.details.description);
    remember(key, severity);
    return "escalated";
  }
  remember(key, result.severity ?? severity);
  return null;
}

async function vitalRule(ctx, t, sample, type, level, detail, log) {
  const key = `${ctx.patientId}:${type}`;
  if (level === "normal") {
    breaches.delete(key);
    return;
  }
  const prev = breaches.get(key);
  const continues = prev && sample.t - prev.lastT <= STREAK_GAP_MS;
  const streak = {
    since: continues ? prev.since : sample.t,
    lastT: sample.t,
    critCount: level === "critical" ? (continues ? prev.critCount : 0) + 1 : 0,
  };
  breaches.set(key, streak);

  const sustainedMs = sample.t - streak.since;
  if (!(streak.critCount >= 2 || sustainedMs >= t.sustain_seconds * 1000)) return;

  const severity = level === "critical" ? "critical" : "warning";
  const description =
    streak.critCount >= 2 ? `${detail} — critical on 2 consecutive samples.` : `${detail} for ${Math.round(sustainedMs / 1000)} s.`;
  const outcome = await raise(
    key,
    {
      facilityId: ctx.facilityId,
      patientId: ctx.patientId,
      deviceId: ctx.deviceId,
      type,
      source: "rules",
      occurredAt: sample.t,
      locationLabel: ctx.locationLabel,
      heartRate: sample.hr,
      spo2: sample.spo2,
      details: { description },
    },
    severity
  );
  if (outcome) log.warn(`${ctx.deviceUid}: ${type} ${severity} alert ${outcome} for ${ctx.patientName} — ${description}`);
}

export async function evaluateVitals(ctx, samples, log) {
  if (!ctx.patientId || !ctx.facilityId) return;
  const t = await thresholdsFor(ctx.patientId);
  if (!t) return;

  for (const s of samples) {
    if (s.hr != null) {
      const level = hrLevel(s.hr, t);
      const high = s.hr > t.hr_warn_high;
      await vitalRule(ctx, t, s, "tachycardia", high ? level : "normal", `Heart rate ${s.hr} bpm, above ${t.hr_warn_high} bpm`, log);
      await vitalRule(ctx, t, s, "bradycardia", high ? "normal" : level, `Heart rate ${s.hr} bpm, below ${t.hr_warn_low} bpm`, log);
    }
    if (s.spo2 != null) {
      await vitalRule(ctx, t, s, "hypoxemia", spo2Level(s.spo2, t), `SpO₂ ${s.spo2}%, below ${t.spo2_warn_low}%`, log);
    }
  }
}

// Notice at the warning level, warning at the critical level; closes itself once charging.
export async function evaluateBattery(ctx, status, receivedAt, log) {
  if (!ctx.facilityId || status.battery_pct == null) return;
  const t = ctx.patientId ? await thresholdsFor(ctx.patientId) : null;
  const warn = t?.battery_warn_pct ?? BUILT_IN_BATTERY.warn;
  const crit = t?.battery_crit_pct ?? BUILT_IN_BATTERY.crit;
  const key = `${ctx.deviceId}:low_battery`;

  if (status.charging || status.battery_pct > warn) {
    if (knownSeverity(key) === "none") return;
    const closed = await autoResolve(db, ctx.deviceId, "low_battery", status.charging ? "Band is charging." : `Battery back to ${status.battery_pct}%.`);
    if (closed.length) log.info(`${ctx.deviceUid}: low battery alert resolved`);
    remember(key, "none");
    return;
  }

  const severity = status.battery_pct <= crit ? "warning" : "info";
  const description = `Band battery at ${status.battery_pct}%.`;
  const outcome = await raise(
    key,
    {
      facilityId: ctx.facilityId,
      patientId: ctx.patientId,
      deviceId: ctx.deviceId,
      type: "low_battery",
      source: "rules",
      occurredAt: receivedAt,
      locationLabel: ctx.locationLabel,
      details: { description, battery_pct: status.battery_pct },
    },
    severity
  );
  if (outcome) log.warn(`${ctx.deviceUid}: low battery ${severity} alert ${outcome} — ${description}`);
}
