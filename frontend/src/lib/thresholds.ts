import type { PatientStatus, Thresholds } from './types'

export const BUILT_IN_THRESHOLDS: Thresholds = {
  hrCritLow: 45,
  hrWarnLow: 50,
  hrWarnHigh: 100,
  hrCritHigh: 125,
  spo2WarnLow: 95,
  spo2CritLow: 90,
  batteryWarn: 20,
  batteryCrit: 10,
  sustainSeconds: 300,
}

/** Override → facility default → built-in, one column at a time. */
export function effectiveThresholds(
  facilityDefault: Partial<Thresholds>,
  override: Partial<Thresholds> | undefined,
): Thresholds {
  const out = { ...BUILT_IN_THRESHOLDS }
  for (const key of Object.keys(out) as (keyof Thresholds)[]) {
    const v = override?.[key] ?? facilityDefault[key]
    if (typeof v === 'number') out[key] = v
  }
  return out
}

export type Level = 'normal' | 'warning' | 'critical'

export function hrLevel(hr: number | null, t: Thresholds): Level {
  if (hr == null) return 'normal'
  if (hr >= t.hrCritHigh || hr <= t.hrCritLow) return 'critical'
  if (hr > t.hrWarnHigh || hr < t.hrWarnLow) return 'warning'
  return 'normal'
}

export function spo2Level(spo2: number | null, t: Thresholds): Level {
  if (spo2 == null) return 'normal'
  if (spo2 <= t.spo2CritLow) return 'critical'
  if (spo2 < t.spo2WarnLow) return 'warning'
  return 'normal'
}

export function tempLevel(temp: number | null): Level {
  if (temp == null) return 'normal'
  if (temp >= 38.5 || temp <= 35) return 'critical'
  if (temp >= 37.6 || temp < 35.8) return 'warning'
  return 'normal'
}

export function batteryLevel(battery: number, t: Thresholds): Level {
  if (battery <= t.batteryCrit) return 'critical'
  if (battery <= t.batteryWarn) return 'warning'
  return 'normal'
}

export function worst(...levels: (Level | PatientStatus)[]): PatientStatus {
  if (levels.includes('offline')) return 'offline'
  if (levels.includes('critical')) return 'critical'
  if (levels.includes('warning')) return 'warning'
  return 'normal'
}

export function validateThresholds(t: Thresholds): string | null {
  if (!(t.hrCritLow < t.hrWarnLow)) return 'Heart rate: critical low must be below warning low.'
  if (!(t.hrWarnLow < t.hrWarnHigh)) return 'Heart rate: warning low must be below warning high.'
  if (!(t.hrWarnHigh < t.hrCritHigh)) return 'Heart rate: warning high must be below critical high.'
  if (!(t.spo2CritLow < t.spo2WarnLow)) return 'SpO₂: critical low must be below warning low.'
  if (!(t.batteryCrit < t.batteryWarn)) return 'Battery: critical must be below warning.'
  if (t.sustainSeconds < 0 || t.sustainSeconds > 3600) return 'Sustain time must be between 0 and 3600 seconds.'
  return null
}
