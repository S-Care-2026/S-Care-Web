import { useEffect, useState, useSyncExternalStore } from 'react'
import { createLiveSource } from './live'
import { getDataMode } from './mode'
import { createSimulator, thresholdsFor, type SimState } from './simulator'
import type { DataSource } from './source'
import { batteryLevel, hrLevel, spo2Level, worst } from '../lib/thresholds'
import { isActive } from '../lib/format'
import type { Alert, Patient, PatientStatus } from '../lib/types'

/** The public home page always previews simulated data, whatever the dashboard uses. */
export const demoSim: DataSource = { kind: 'demo', ...createSimulator() }

/** The dashboard's data: the simulator, or real bands through the server (Settings → Data source). */
export const sim: DataSource = getDataMode() === 'live' ? createLiveSource() : demoSim

export function useSim(): SimState {
  return useSyncExternalStore(sim.subscribe, sim.getState, sim.getState)
}

export function useDemoSim(): SimState {
  return useSyncExternalStore(demoSim.subscribe, demoSim.getState, demoSim.getState)
}

/**
 * Runs a data change and reports a failure (real data: the server refused it or can't be reached)
 * through the source's error events. Returns true when it went through.
 */
export async function perform(action: () => unknown): Promise<boolean> {
  try {
    await action()
    return true
  } catch (err) {
    errorListeners.forEach((l) => l(err instanceof Error ? err.message : 'Something went wrong.'))
    return false
  }
}

const errorListeners = new Set<(message: string) => void>()

export function onActionError(listener: (message: string) => void) {
  errorListeners.add(listener)
  return () => {
    errorListeners.delete(listener)
  }
}

const wallClock = () => Date.now()

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(wallClock)
  useEffect(() => {
    const id = setInterval(() => setNow(wallClock()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function activeAlertsFor(state: SimState, patientId: string): Alert[] {
  return state.alerts.filter((a) => a.patientId === patientId && isActive(a.status))
}

/** Live status, derived like the backend would: check-ins, vitals, battery, open alerts. */
export function patientStatus(state: SimState, patient: Patient): PatientStatus {
  const device = state.devices.find((d) => d.id === patient.deviceId)
  if (!device || !device.online) return 'offline'
  const t = thresholdsFor(state, patient.id)
  const v = state.vitals[patient.id]
  const alerts = activeAlertsFor(state, patient.id)
  const battery = batteryLevel(device.battery, t)
  return worst(
    device.worn ? hrLevel(v?.hr ?? null, t) : 'normal',
    device.worn ? spo2Level(v?.spo2 ?? null, t) : 'normal',
    battery === 'critical' ? 'warning' : 'normal',
    alerts.some((a) => a.severity === 'critical') ? 'critical' : 'normal',
    alerts.some((a) => a.severity === 'warning') ? 'warning' : 'normal',
  )
}

export const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const

export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    const act = Number(isActive(b.status)) - Number(isActive(a.status))
    if (act) return act
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (sev && isActive(a.status)) return sev
    return b.occurredAt - a.occurredAt
  })
}
