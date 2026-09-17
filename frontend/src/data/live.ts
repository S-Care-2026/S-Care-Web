import { api, ApiError } from './api'
import type { DataSource, SourceEvent } from './source'
import type { SimState } from './simulator'
import { isActive } from '../lib/format'
import type { Alert } from '../lib/types'

/** How often the dashboard asks the server for the latest snapshot. */
const POLL_MS = 4000
/** Alerts that show up already open are only announced if they're this recent. */
const ANNOUNCE_WITHIN_MS = 2 * 60_000

function emptyState(): SimState {
  return {
    now: Date.now(),
    running: false,
    ready: false,
    patients: [],
    devices: [],
    vitals: {},
    buffers: {},
    alerts: [],
    contacts: [],
    facilityThresholds: {},
    overrides: {},
    scenarios: {},
  }
}

interface Snapshot extends Omit<SimState, 'ready' | 'facilityName'> {
  facility: { id: string; name: string }
}

/** Real bands, through the S-Care server: polls the facility snapshot and sends changes to the API. */
export function createLiveSource(): DataSource {
  let state = emptyState()
  const listeners = new Set<() => void>()
  const eventListeners = new Set<(e: SourceEvent) => void>()
  let timer: ReturnType<typeof setInterval> | null = null
  let inflight: Promise<void> | null = null

  const emit = () => listeners.forEach((l) => l())
  const emitEvent = (e: SourceEvent) => eventListeners.forEach((l) => l(e))

  function announce(prev: SimState, next: Alert[]) {
    const before = new Map(prev.alerts.map((a) => [a.id, a]))
    const now = Date.now()
    for (const a of next) {
      const old = before.get(a.id)
      if (a.status === 'open' && (old ? old.status === 'pending' : now - a.occurredAt < ANNOUNCE_WITHIN_MS)) {
        emitEvent({ kind: 'alert-opened', alert: a })
      } else if (old && isActive(a.status) && old.severity === 'warning' && a.severity === 'critical') {
        emitEvent({ kind: 'alert-escalated', alert: a })
      }
    }
  }

  function refresh(): Promise<void> {
    if (inflight) return inflight
    inflight = api<Snapshot>('GET', '/facility/snapshot')
      .then((snap) => {
        const prev = state
        const { facility, ...rest } = snap
        state = { ...rest, now: Date.now(), running: true, ready: true, facilityName: facility.name }
        if (prev.ready) announce(prev, state.alerts)
        emit()
      })
      .catch((err: unknown) => {
        if (state.running) {
          state = { ...state, running: false }
          emit()
        }
        if (err instanceof ApiError && err.status !== 401 && !state.ready) {
          emitEvent({ kind: 'error', message: err.message })
        }
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }

  /** Runs a change on the server, then reloads so every page shows the result. Errors reach the caller. */
  async function mutate<T>(request: () => Promise<T>): Promise<T> {
    const result = await request()
    await refresh()
    return result
  }

  const ignore = () => {}

  return {
    kind: 'live',
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      if (!timer) {
        void refresh()
        timer = setInterval(() => void refresh(), POLL_MS)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && timer) {
          clearInterval(timer)
          timer = null
        }
      }
    },
    onEvent(listener) {
      eventListeners.add(listener)
      return () => {
        eventListeners.delete(listener)
      }
    },

    // Simulator-only controls: real bands can't be paused or driven from the dashboard.
    setRunning: ignore,
    reset: ignore,
    setScenario: ignore,
    setDevice: ignore,

    acknowledge: (alertId) => mutate(() => api('POST', `/alerts/${alertId}/acknowledge`)).then(ignore),
    resolve: (alertId, _by, resolution, notes) => mutate(() => api('POST', `/alerts/${alertId}/resolve`, { resolution, notes })).then(ignore),
    cancelPending: (alertId) => mutate(() => api('POST', `/alerts/${alertId}/cancel`)).then(ignore),
    trigger: (patientId, type, notes) => mutate(() => api<{ alert: Alert; duplicate: boolean }>('POST', '/alerts', { patientId, type, notes })),

    setFacilityThresholds: (t) => mutate(() => api('PUT', '/facility/thresholds', t)).then(ignore),
    setOverride: (patientId, override) => mutate(() => api('PUT', `/patients/${patientId}/thresholds`, override ?? {})).then(ignore),

    addContact: (c) =>
      mutate(() => api('POST', `/patients/${c.patientId}/contacts`, c)).then(
        () => null,
        (err: unknown) => (err instanceof ApiError ? err.message : 'Could not add the contact.'),
      ),
    removeContact: (id) => mutate(() => api('DELETE', `/contacts/${id}`)).then(ignore),
    moveContact: (id, dir) => mutate(() => api('POST', `/contacts/${id}/move`, { dir })).then(ignore),
    updateContact: (id, patch) => mutate(() => api('PATCH', `/contacts/${id}`, patch)).then(ignore),

    pair: (input) =>
      mutate(() =>
        api<{ patientId: string }>('POST', '/devices/pair', {
          deviceUid: input.deviceId,
          claimCode: input.claimCode,
          patientId: input.existingPatientId,
          newPatient: input.newPatient,
        }),
      ).catch((err: unknown) => ({ error: err instanceof ApiError ? err.message : 'Could not pair the band.' })),
    unpair: (deviceId) => mutate(() => api('POST', `/devices/${encodeURIComponent(deviceId)}/unpair`)).then(ignore),
  }
}
