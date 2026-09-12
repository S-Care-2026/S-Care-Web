// Synthetic long-range history, standing in for InfluxDB rollups (vitals_1m) until
// real bands report. Each bucket's value is derived from its own timestamp, so the
// window slides smoothly instead of re-rolling every refresh.

import type { VitalKey } from '../lib/types'

export type RangeKey = 'live' | '1h' | '6h' | '24h' | '7d'

export const RANGES: { key: RangeKey; label: string; stepMs: number; points: number }[] = [
  { key: 'live', label: 'Live', stepMs: 2000, points: 150 },
  { key: '1h', label: '1 h', stepMs: 60_000, points: 60 },
  { key: '6h', label: '6 h', stepMs: 5 * 60_000, points: 72 },
  { key: '24h', label: '24 h', stepMs: 15 * 60_000, points: 96 },
  { key: '7d', label: '7 d', stepMs: 2 * 3_600_000, points: 84 },
]

export interface Bucket {
  t: number
  mean: number
  min: number
  max: number
}

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic 0..1 from an integer key. */
function unit(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const SPEC: Record<VitalKey, { amp: number; spread: number; night: number; lo: number; hi: number; decimals: number }> = {
  hr: { amp: 6, spread: 7, night: -7, lo: 38, hi: 170, decimals: 0 },
  spo2: { amp: 1.1, spread: 1.4, night: -0.6, lo: 82, hi: 100, decimals: 0 },
  temp: { amp: 0.15, spread: 0.12, night: -0.25, lo: 34.5, hi: 40, decimals: 1 },
}

const roundTo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d

export function history(patientId: string, vital: VitalKey, range: Exclude<RangeKey, 'live'>, end: number, typical: number): Bucket[] {
  const spec = SPEC[vital]
  const r = RANGES.find((x) => x.key === range)!
  const seed = hash(`${patientId}:${vital}`)
  const last = Math.floor(end / r.stepMs)
  const out: Bucket[] = []
  for (let i = last - r.points + 1; i <= last; i++) {
    const t = i * r.stepMs
    const hour = new Date(t).getHours() + new Date(t).getMinutes() / 60
    // Deeper at 03:00, flat through the day.
    const circadian = spec.night * Math.max(0, Math.cos(((hour - 3) / 24) * Math.PI * 2))
    const slow = Math.sin(i * 0.09 + (seed % 97)) * spec.amp + Math.sin(i * 0.37 + (seed % 13)) * spec.amp * 0.4
    const jitter = (unit(seed ^ i) - 0.5) * spec.amp
    const mean = Math.min(spec.hi, Math.max(spec.lo, typical + circadian + slow + jitter))
    const spread = spec.spread * (0.5 + unit((seed * 31) ^ i))
    out.push({
      t,
      mean: roundTo(mean, spec.decimals + (range === '7d' ? 1 : 0)),
      min: roundTo(Math.max(spec.lo, mean - spread), spec.decimals),
      max: roundTo(Math.min(spec.hi, mean + spread * (vital === 'spo2' ? 0.4 : 1)), spec.decimals),
    })
  }
  return out
}
