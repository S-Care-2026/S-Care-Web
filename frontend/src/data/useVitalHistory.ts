import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { history, type RangeKey } from './history'
import { sim } from './store'
import type { VitalKey } from '../lib/types'

export interface HistoryPoint {
  t: number
  v: number
  lo: number
  hi: number
}

type HistoryRange = Exclude<RangeKey, 'live'>

const REFRESH_MS = 60_000

/**
 * Chart history for one vital. Demo data is generated from the patient's recent average;
 * real data comes from InfluxDB through the server, refreshed every minute.
 */
export function useVitalHistory(patientId: string, vital: VitalKey, range: HistoryRange, minuteBucket: number, typical: number) {
  const live = sim.kind === 'live'
  const key = `${patientId}:${vital}:${range}`

  const demo = useMemo<HistoryPoint[]>(
    () => (live ? [] : history(patientId, vital, range, minuteBucket * 60_000, typical).map((b) => ({ t: b.t, v: b.mean, lo: b.min, hi: b.max }))),
    [live, patientId, vital, range, minuteBucket, typical],
  )

  const [loaded, setLoaded] = useState<{ key: string; points: HistoryPoint[]; failed: boolean } | null>(null)

  useEffect(() => {
    if (!live) return
    let cancelled = false
    const load = () =>
      api<{ t: number; mean: number; min: number; max: number }[]>('GET', `/patients/${patientId}/history?vital=${vital}&range=${range}`)
        .then((rows) => {
          if (!cancelled) setLoaded({ key, points: rows.map((r) => ({ t: r.t, v: r.mean, lo: r.min, hi: r.max })), failed: false })
        })
        .catch(() => {
          if (!cancelled) setLoaded((prev) => ({ key, points: prev?.key === key ? prev.points : [], failed: true }))
        })
    void load()
    const id = setInterval(() => void load(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [live, key, patientId, vital, range])

  if (!live) return { points: demo, loading: false, failed: false }
  const current = loaded?.key === key ? loaded : null
  return { points: current?.points ?? [], loading: !current, failed: current?.failed ?? false }
}
