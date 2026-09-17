import type { PairInput, Scenario, SimEvent, SimState } from './simulator'
import type { Alert, AlertType, Device, EmergencyContact, Resolution, Thresholds } from '../lib/types'

type MaybePromise<T> = T | Promise<T>

export type SourceEvent = SimEvent | { kind: 'error'; message: string }

/** What the pages need from their data: the in-browser simulator and the real server both provide it. */
export interface DataSource {
  kind: 'demo' | 'live'
  getState(): SimState
  subscribe(listener: () => void): () => void
  onEvent(listener: (e: SourceEvent) => void): () => void

  setRunning(running: boolean): void
  reset(): void
  setScenario(patientId: string, scenario: Scenario): void
  setDevice(deviceId: string, patch: Partial<Pick<Device, 'worn' | 'online' | 'battery' | 'charging'>>): void

  acknowledge(alertId: string, by: string): MaybePromise<void>
  resolve(alertId: string, by: string, resolution: Resolution, notes: string): MaybePromise<void>
  cancelPending(alertId: string): MaybePromise<void>
  trigger(patientId: string, type: AlertType, notes: string): MaybePromise<{ alert: Alert; duplicate: boolean }>

  setFacilityThresholds(t: Partial<Thresholds>): MaybePromise<void>
  setOverride(patientId: string, override: Partial<Thresholds> | undefined): MaybePromise<void>

  /** Resolves to an error message to show, or null when added. */
  addContact(c: Omit<EmergencyContact, 'id' | 'priority'>): MaybePromise<string | null>
  removeContact(id: string): MaybePromise<void>
  moveContact(id: string, dir: -1 | 1): MaybePromise<void>
  updateContact(id: string, patch: Partial<Pick<EmergencyContact, 'notifyOnSos' | 'notifyOnFall'>>): MaybePromise<void>

  pair(input: PairInput): MaybePromise<{ error: string } | { patientId: string }>
  unpair(deviceId: string): void
}
