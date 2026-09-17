import { batteryLevel, effectiveThresholds, hrLevel, spo2Level } from '../lib/thresholds'
import type {
  Alert,
  AlertNotification,
  AlertType,
  Device,
  EmergencyContact,
  Patient,
  Resolution,
  Sample,
  Severity,
  Sex,
  Thresholds,
  Vitals,
  Zone,
} from '../lib/types'
import { isActive } from '../lib/format'
import {
  SEED_FACILITY_THRESHOLDS,
  SEED_PATIENTS,
  seedAlerts,
  seedContacts,
  type Baseline,
} from './seed'

export const TICK_MS = 2000
const BUFFER_SAMPLES = 450
const FALL_COUNTDOWN_MS = 15_000

export type Scenario = 'normal' | 'tachycardia' | 'bradycardia' | 'hypoxemia'

export interface VitalBuffers {
  hr: Sample[]
  spo2: Sample[]
  temp: Sample[]
}

export interface SimState {
  now: number
  running: boolean
  /** Real data only: false until the first snapshot arrives from the server. */
  ready?: boolean
  facilityName?: string
  patients: Patient[]
  devices: Device[]
  vitals: Record<string, Vitals>
  buffers: Record<string, VitalBuffers>
  alerts: Alert[]
  contacts: EmergencyContact[]
  facilityThresholds: Partial<Thresholds>
  overrides: Record<string, Partial<Thresholds>>
  scenarios: Record<string, Scenario>
}

export type SimEvent =
  | { kind: 'alert-opened'; alert: Alert }
  | { kind: 'alert-escalated'; alert: Alert }

const STORAGE_KEY = 'scare.sim.v1'

interface Persisted {
  v: 1
  patients: Patient[]
  devices: Device[]
  alerts: Alert[]
  contacts: EmergencyContact[]
  facilityThresholds: Partial<Thresholds>
  overrides: Record<string, Partial<Thresholds>>
  scenarios: Record<string, Scenario>
  running: boolean
  alertSeq: number
  baselines: [string, Baseline][]
}

function loadSaved(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Persisted
    return parsed?.v === 1 && Array.isArray(parsed.patients) && Array.isArray(parsed.alerts) ? parsed : null
  } catch {
    return null
  }
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round1 = (v: number) => Math.round(v * 10) / 10

function targetFor(base: Baseline, scenario: Scenario): Baseline {
  switch (scenario) {
    case 'tachycardia':
      return { ...base, hr: 134 }
    case 'bradycardia':
      return { ...base, hr: 41 }
    case 'hypoxemia':
      return { ...base, spo2: 87 }
    default:
      return base
  }
}

/** Mean-reverting random walk toward the target, clamped to physiological range. */
function step(prev: Vitals, target: Baseline, t: number): Vitals {
  const hr0 = prev.hr ?? target.hr
  const spo20 = prev.spo2 ?? target.spo2
  const temp0 = prev.temp ?? target.temp
  return {
    hr: Math.round(clamp(hr0 + (target.hr - hr0) * 0.12 + rand(-2.6, 2.6), 35, 180)),
    spo2: Math.round(clamp(spo20 + (target.spo2 - spo20) * 0.15 + rand(-0.9, 0.9), 80, 100)),
    temp: round1(clamp(temp0 + (target.temp - temp0) * 0.1 + rand(-0.06, 0.06), 34, 41)),
    ts: t,
  }
}

function seedBuffers(base: Baseline, now: number, worn: boolean, online: boolean): VitalBuffers {
  const buffers: VitalBuffers = { hr: [], spo2: [], temp: [] }
  if (!worn || !online) return buffers
  let v: Vitals = { hr: base.hr, spo2: base.spo2, temp: base.temp, ts: now }
  for (let i = 150; i > 0; i--) {
    v = step(v, base, now - i * TICK_MS)
    buffers.hr.push({ t: v.ts, v: v.hr! })
    buffers.spo2.push({ t: v.ts, v: v.spo2! })
    buffers.temp.push({ t: v.ts, v: v.temp! })
  }
  return buffers
}

const push = (arr: Sample[], s: Sample) => {
  const next = arr.length >= BUFFER_SAMPLES ? arr.slice(arr.length - BUFFER_SAMPLES + 1) : arr.slice()
  next.push(s)
  return next
}

export function locationLabel(p: Patient | undefined): string {
  return p ? `Room ${p.room} • ${p.zone}` : 'Unassigned band'
}

export function thresholdsFor(state: SimState, patientId: string): Thresholds {
  return effectiveThresholds(state.facilityThresholds, state.overrides[patientId])
}

const ON_DUTY = ['Jordan Cole', 'Sarah Jenkins']

function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`
  return e164
}
export { formatPhone }

export interface PairInput {
  deviceId: string
  /** Real bands only: the secret code printed with the band's QR label. */
  claimCode?: string
  existingPatientId?: string
  /** `zone` is one of the four wings in the demo; real facilities name their own areas. */
  newPatient?: { name: string; age: number; sex: Sex; room: string; zone: string }
}

/** In-browser stand-in for the backend: bands publishing vitals, the MQTT subscriber's rule engine and the alert API. */
export function createSimulator() {
  const baselines = new Map<string, Baseline>()
  const breaches = new Map<string, { since: number; critCount: number }>()
  const listeners = new Set<() => void>()
  const eventListeners = new Set<(e: SimEvent) => void>()
  let timer: ReturnType<typeof setInterval> | null = null
  let alertSeq = 906

  function initialState(): SimState {
    const now = Date.now()
    baselines.clear()
    const patients: Patient[] = []
    const devices: Device[] = []
    const vitals: Record<string, Vitals> = {}
    const buffers: Record<string, VitalBuffers> = {}
    for (const seed of SEED_PATIENTS) {
      baselines.set(seed.patient.id, seed.baseline)
      patients.push({ ...seed.patient, admittedAt: now - 90 * 86_400_000 })
      const { lastSeenAgoSec, ...device } = seed.device
      devices.push({ ...device, lastSeen: now - lastSeenAgoSec * 1000 })
      const b = seedBuffers(seed.baseline, now, device.worn, device.online)
      buffers[seed.patient.id] = b
      vitals[seed.patient.id] = b.hr.length
        ? { hr: b.hr.at(-1)!.v, spo2: b.spo2.at(-1)!.v, temp: b.temp.at(-1)!.v, ts: now }
        : { hr: null, spo2: null, temp: null, ts: now }
    }
    breaches.clear()
    alertSeq = 906
    return {
      now,
      running: true,
      patients,
      devices,
      vitals,
      buffers,
      alerts: seedAlerts(now),
      contacts: seedContacts(),
      facilityThresholds: { ...SEED_FACILITY_THRESHOLDS },
      overrides: {},
      scenarios: {},
    }
  }

  function restoreState(saved: Persisted): SimState {
    const now = Date.now()
    baselines.clear()
    for (const [id, b] of saved.baselines) baselines.set(id, b)
    const devices = saved.devices.map((d) => (d.online ? { ...d, lastSeen: now } : d))
    const vitals: Record<string, Vitals> = {}
    const buffers: Record<string, VitalBuffers> = {}
    for (const p of saved.patients) {
      const d = devices.find((x) => x.id === p.deviceId)
      const b = seedBuffers(baselines.get(p.id) ?? { hr: 72, spo2: 97, temp: 36.5 }, now, Boolean(d?.worn), Boolean(d?.online))
      buffers[p.id] = b
      vitals[p.id] = b.hr.length
        ? { hr: b.hr.at(-1)!.v, spo2: b.spo2.at(-1)!.v, temp: b.temp.at(-1)!.v, ts: now }
        : { hr: null, spo2: null, temp: null, ts: now }
    }
    breaches.clear()
    alertSeq = saved.alertSeq
    return {
      now,
      running: saved.running,
      patients: saved.patients,
      devices,
      vitals,
      buffers,
      alerts: saved.alerts,
      contacts: saved.contacts,
      facilityThresholds: saved.facilityThresholds,
      overrides: saved.overrides,
      scenarios: saved.scenarios,
    }
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function persist() {
    try {
      const saved: Persisted = {
        v: 1,
        patients: state.patients,
        devices: state.devices,
        alerts: state.alerts,
        contacts: state.contacts,
        facilityThresholds: state.facilityThresholds,
        overrides: state.overrides,
        scenarios: state.scenarios,
        running: state.running,
        alertSeq,
        baselines: [...baselines],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      /* storage unavailable */
    }
  }

  const saved = loadSaved()
  let state = saved ? restoreState(saved) : initialState()

  const emit = () => {
    listeners.forEach((l) => l())
    if (!saveTimer)
      saveTimer = setTimeout(() => {
        saveTimer = null
        persist()
      }, 1000)
  }
  const emitEvent = (e: SimEvent) => eventListeners.forEach((l) => l(e))
  const set = (patch: Partial<SimState>) => {
    state = { ...state, ...patch }
    emit()
  }

  function notificationsFor(type: AlertType, patientId: string | null, contacts: EmergencyContact[], now: number) {
    const rows: AlertNotification[] = ON_DUTY.map((to) => ({ channel: 'push', to, status: 'sent', at: now }))
    let sms = 0
    if (patientId && (type === 'sos' || type === 'fall')) {
      for (const c of contacts
        .filter((c) => c.patientId === patientId && (type === 'sos' ? c.notifyOnSos : c.notifyOnFall))
        .sort((a, b) => a.priority - b.priority)) {
        rows.push({ channel: 'sms_device', to: `${c.name} · ${formatPhone(c.phone)}`, status: 'sent', at: now })
        sms++
      }
    }
    const text = sms
      ? `Push sent to ${ON_DUTY.length} caregivers · band texted ${sms} emergency contact${sms === 1 ? '' : 's'}`
      : `Push sent to ${ON_DUTY.length} caregivers`
    return { rows, text, sms }
  }

  function buildAlert(
    s: SimState,
    input: {
      type: AlertType
      severity: Severity
      source: Alert['source']
      patientId: string | null
      deviceId: string | null
      details: string
      pending?: boolean
      impactG?: number
    },
  ): Alert {
    const patient = s.patients.find((p) => p.id === input.patientId)
    const v = input.patientId ? s.vitals[input.patientId] : undefined
    const now = s.now
    const alert: Alert = {
      id: `ALT-${alertSeq++}`,
      type: input.type,
      severity: input.severity,
      status: input.pending ? 'pending' : 'open',
      source: input.source,
      patientId: input.patientId,
      deviceId: input.deviceId,
      occurredAt: now,
      countdownEndsAt: input.pending ? now + FALL_COUNTDOWN_MS : undefined,
      locationLabel: locationLabel(patient),
      hrSnapshot: v?.hr ?? null,
      spo2Snapshot: v?.spo2 ?? null,
      impactG: input.impactG,
      details: input.details,
      smsSentByDevice: false,
      events: [
        {
          at: now,
          kind: 'created',
          text: input.pending
            ? `Band detected a fall (${input.impactG?.toFixed(1)} g) and started its 15 s cancel countdown`
            : input.source === 'manual'
              ? 'Raised manually from the dashboard'
              : input.source === 'device'
                ? 'SOS pressed on the band'
                : input.details,
        },
      ],
      notifications: [],
    }
    if (!input.pending) openAlert(alert, s.contacts, now)
    return alert
  }

  /** Mutates a freshly built or copied alert into the open state and attaches notifications. */
  function openAlert(alert: Alert, contacts: EmergencyContact[], now: number) {
    const n = notificationsFor(alert.type, alert.patientId, contacts, now)
    alert.status = 'open'
    alert.notifications = n.rows
    alert.smsSentByDevice = n.sms > 0
    alert.events = [...alert.events, { at: now, kind: 'notified', text: n.text }]
  }

  const activeOf = (alerts: Alert[], pred: (a: Alert) => boolean) =>
    alerts.find((a) => isActive(a.status) && pred(a))

  /** One step: confirm pending falls, flag missed check-ins, then run the battery and vitals rules with dedupe. */
  function tick() {
    const now = Date.now()
    let s: SimState = { ...state, now }
    const vitals = { ...s.vitals }
    const buffers = { ...s.buffers }
    let alerts = s.alerts
    const opened: SimEvent[] = []

    const devices = s.devices.map((d) => {
      let dev = d
      if (dev.online) {
        const drain = dev.worn ? rand(0.01, 0.03) : 0
        const level = dev.battery ?? 100
        const battery = dev.charging ? Math.min(100, level + 0.4) : Math.max(0, level - drain)
        dev = { ...dev, battery, lastSeen: now }
        if (dev.configAcked < dev.configVersion && Math.random() < 0.5) dev = { ...dev, configAcked: dev.configVersion }
        if (battery <= 0) dev = { ...dev, online: false, worn: false }
      }
      return dev
    })
    s = { ...s, devices }

    alerts = alerts.map((a) => {
      if (a.status !== 'pending' || !a.countdownEndsAt || now < a.countdownEndsAt) return a
      const next: Alert = {
        ...a,
        events: [...a.events, { at: now, kind: 'confirmed', text: 'Countdown ended without a cancel — alert opened' }],
      }
      openAlert(next, s.contacts, now)
      opened.push({ kind: 'alert-opened', alert: next })
      return next
    })

    const raise = (a: Alert) => {
      alerts = [a, ...alerts]
      if (a.status === 'open') opened.push({ kind: 'alert-opened', alert: a })
    }

    for (const dev of devices) {
      const patient = s.patients.find((p) => p.id === dev.patientId)

      const overdue = !dev.online && now - dev.lastSeen > dev.heartbeatSec * 2000
      const activeOffline = activeOf(alerts, (a) => a.type === 'offline' && a.deviceId === dev.id)
      if (overdue && !activeOffline) {
        raise(buildAlert({ ...s, alerts }, {
          type: 'offline', severity: 'warning', source: 'system', patientId: patient?.id ?? null, deviceId: dev.id,
          details: `${dev.id} missed two check-ins (every ${dev.heartbeatSec} s).`,
        }))
      } else if (dev.online && activeOffline) {
        alerts = alerts.map((a) =>
          a.id === activeOffline.id
            ? {
                ...a, status: 'resolved', resolvedAt: now, resolvedBy: 'System', resolution: 'no_action_needed',
                resolutionNotes: 'Band reconnected.',
                events: [...a.events, { at: now, kind: 'resolved', by: 'System', text: 'Band reconnected — resolved automatically' }],
              }
            : a,
        )
      }

      if (!patient) continue
      const t = thresholdsFor(s, patient.id)

      const bLevel = batteryLevel(dev.battery, t)
      const activeBattery = activeOf(alerts, (a) => a.type === 'low_battery' && a.deviceId === dev.id)
      if (dev.online && bLevel !== 'normal') {
        const severity: Severity = bLevel === 'critical' ? 'warning' : 'info'
        if (!activeBattery) {
          raise(buildAlert({ ...s, alerts }, {
            type: 'low_battery', severity, source: 'rules', patientId: patient.id, deviceId: dev.id,
            details: `Band battery at ${Math.round(dev.battery ?? 0)}%.`,
          }))
        } else if (severity === 'warning' && activeBattery.severity === 'info') {
          alerts = alerts.map((a) => a.id === activeBattery.id
            ? { ...a, severity, events: [...a.events, { at: now, kind: 'escalated', text: `Escalated to warning — battery at ${Math.round(dev.battery ?? 0)}%` }] }
            : a)
        }
      }

      if (!dev.online || !dev.worn) {
        if (dev.online) vitals[patient.id] = { hr: null, spo2: null, temp: null, ts: now }
        continue
      }
      const base = baselines.get(patient.id) ?? { hr: 72, spo2: 97, temp: 36.5 }
      const v = step(s.vitals[patient.id] ?? { ...base, ts: now }, targetFor(base, s.scenarios[patient.id] ?? 'normal'), now)
      vitals[patient.id] = v
      const b = buffers[patient.id] ?? { hr: [], spo2: [], temp: [] }
      buffers[patient.id] = { hr: push(b.hr, { t: now, v: v.hr! }), spo2: push(b.spo2, { t: now, v: v.spo2! }), temp: push(b.temp, { t: now, v: v.temp! }) }

      const rules: { key: AlertType; level: ReturnType<typeof hrLevel>; detail: string }[] = []
      const hl = hrLevel(v.hr, t)
      const hrHigh = v.hr! > t.hrWarnHigh
      rules.push({ key: 'tachycardia', level: hrHigh ? hl : 'normal', detail: `Heart rate ${v.hr} bpm, above ${t.hrWarnHigh} bpm` })
      rules.push({ key: 'bradycardia', level: !hrHigh ? hl : 'normal', detail: `Heart rate ${v.hr} bpm, below ${t.hrWarnLow} bpm` })
      rules.push({ key: 'hypoxemia', level: spo2Level(v.spo2, t), detail: `SpO₂ ${v.spo2}%, below ${t.spo2WarnLow}%` })

      for (const rule of rules) {
        const bk = `${patient.id}:${rule.key}`
        if (rule.level === 'normal') {
          breaches.delete(bk)
          continue
        }
        const prev = breaches.get(bk)
        const br = {
          since: prev?.since ?? now,
          critCount: rule.level === 'critical' ? (prev?.critCount ?? 0) + 1 : 0,
        }
        breaches.set(bk, br)
        const sustainedFor = Math.round((now - br.since) / 1000)
        const fire = br.critCount >= 2 || now - br.since >= t.sustainSeconds * 1000
        if (!fire) continue
        const severity: Severity = rule.level === 'critical' ? 'critical' : 'warning'
        const existing = activeOf(alerts, (a) => a.type === rule.key && a.patientId === patient.id)
        if (!existing) {
          raise(buildAlert({ ...s, alerts, vitals }, {
            type: rule.key, severity, source: 'rules', patientId: patient.id, deviceId: dev.id,
            details: br.critCount >= 2
              ? `${rule.detail} — critical on 2 consecutive samples.`
              : `${rule.detail} for ${sustainedFor} s.`,
          }))
        } else if (severity === 'critical' && existing.severity === 'warning') {
          const escalated: Alert = {
            ...existing,
            severity: 'critical',
            events: [...existing.events, { at: now, kind: 'escalated', text: `Escalated to critical — ${rule.detail}` }],
          }
          alerts = alerts.map((a) => (a.id === existing.id ? escalated : a))
          opened.push({ kind: 'alert-escalated', alert: escalated })
        }
      }
    }

    alerts = alerts.map((a) =>
      a.notifications.some((n) => n.channel === 'push' && n.status === 'sent' && now - n.at >= TICK_MS)
        ? { ...a, notifications: a.notifications.map((n) => (n.channel === 'push' && n.status === 'sent' ? { ...n, status: 'delivered' } : n)) }
        : a,
    )

    state = { ...s, vitals, buffers, alerts }
    emit()
    opened.forEach(emitEvent)
  }

  function start() {
    if (timer || !state.running) return
    timer = setInterval(tick, TICK_MS)
  }
  function stop() {
    if (timer) clearInterval(timer)
    timer = null
  }

  const mapAlert = (id: string, fn: (a: Alert) => Alert) => set({ alerts: state.alerts.map((a) => (a.id === id ? fn(a) : a)) })
  const bumpConfig = (patientId: string) =>
    state.devices.map((d) => (d.patientId === patientId ? { ...d, configVersion: d.configVersion + 1 } : d))

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      start()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop()
      }
    },
    onEvent(listener: (e: SimEvent) => void) {
      eventListeners.add(listener)
      return () => {
        eventListeners.delete(listener)
      }
    },

    setRunning(running: boolean) {
      set({ running })
      if (running) {
        start()
        tick()
      } else stop()
    },
    reset() {
      stop()
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* ignore */
      }
      state = initialState()
      emit()
      if (listeners.size) start()
    },
    setScenario(patientId: string, scenario: Scenario) {
      set({ scenarios: { ...state.scenarios, [patientId]: scenario } })
    },
    setDevice(deviceId: string, patch: Partial<Pick<Device, 'worn' | 'online' | 'battery' | 'charging'>>) {
      set({
        devices: state.devices.map((d) => {
          if (d.id !== deviceId) return d
          const next = { ...d, ...patch }
          if (patch.online === true) next.lastSeen = state.now
          return next
        }),
      })
    },

    acknowledge(alertId: string, by: string) {
      mapAlert(alertId, (a) =>
        a.status !== 'open' ? a : {
          ...a, status: 'acknowledged', acknowledgedAt: Date.now(), acknowledgedBy: by,
          events: [...a.events, { at: Date.now(), kind: 'acknowledged', by, text: 'Acknowledged — on the way' }],
        })
    },
    resolve(alertId: string, by: string, resolution: Resolution, notes: string) {
      mapAlert(alertId, (a) =>
        !isActive(a.status) || a.status === 'pending' ? a : {
          ...a, status: 'resolved', resolvedAt: Date.now(), resolvedBy: by, resolution, resolutionNotes: notes || undefined,
          events: [...a.events, { at: Date.now(), kind: 'resolved', by, text: `Resolved — ${resolution === 'assisted' ? 'assisted the patient' : resolution === 'false_alarm' ? 'false alarm' : 'no action needed'}` }],
        })
    },
    cancelPending(alertId: string) {
      mapAlert(alertId, (a) => {
        if (a.status !== 'pending') return a
        const secs = Math.round((Date.now() - a.occurredAt) / 1000)
        return { ...a, status: 'cancelled', events: [...a.events, { at: Date.now(), kind: 'cancelled', text: `Wearer pressed Cancel after ${secs} s — kept as false-alarm data` }] }
      })
    },
    /** Returns the alert that now represents this incident (an existing active one when deduplicated). */
    trigger(patientId: string, type: AlertType, notes: string): { alert: Alert; duplicate: boolean } {
      const s = { ...state, now: Date.now() }
      const patient = s.patients.find((p) => p.id === patientId)
      const deviceId = patient?.deviceId ?? null
      const dedupes = type !== 'fall' && type !== 'sos'
      const existing = dedupes ? activeOf(s.alerts, (a) => a.type === type && (type === 'offline' || type === 'low_battery' ? a.deviceId === deviceId : a.patientId === patientId)) : undefined
      if (existing) return { alert: existing, duplicate: true }

      let alert: Alert
      if (type === 'fall') {
        const impactG = Math.round(rand(2.6, 4.2) * 10) / 10
        alert = buildAlert(s, { type, severity: 'critical', source: 'device', patientId, deviceId, pending: true, impactG, details: notes || `Impact ${impactG} g detected. Waiting for the wearer to cancel.` })
      } else if (type === 'sos') {
        alert = buildAlert(s, { type, severity: 'critical', source: 'device', patientId, deviceId, details: notes || 'SOS button held for 3 s.' })
      } else {
        const severity: Severity = type === 'low_battery' ? 'info' : 'warning'
        alert = buildAlert(s, { type, severity, source: 'manual', patientId, deviceId, details: notes || 'Raised manually from the dashboard.' })
      }
      state = { ...s, alerts: [alert, ...s.alerts] }
      emit()
      if (alert.status === 'open') emitEvent({ kind: 'alert-opened', alert })
      return { alert, duplicate: false }
    },

    setFacilityThresholds(t: Partial<Thresholds>) {
      set({ facilityThresholds: { ...t }, devices: state.devices.map((d) => ({ ...d, configVersion: d.configVersion + 1 })) })
    },
    setOverride(patientId: string, override: Partial<Thresholds> | undefined) {
      const overrides = { ...state.overrides }
      if (override && Object.keys(override).length) overrides[patientId] = override
      else delete overrides[patientId]
      set({ overrides, devices: bumpConfig(patientId) })
    },

    addContact(c: Omit<EmergencyContact, 'id' | 'priority'>): string | null {
      const mine = state.contacts.filter((x) => x.patientId === c.patientId)
      if (mine.length >= 5) return 'A band stores at most 5 emergency numbers.'
      if (!/^\+[1-9][0-9]{7,14}$/.test(c.phone)) return 'Use international format, e.g. +84901234567.'
      const contact: EmergencyContact = { ...c, id: `c-${Date.now().toString(36)}`, priority: mine.length + 1 }
      set({ contacts: [...state.contacts, contact], devices: bumpConfig(c.patientId) })
      return null
    },
    removeContact(id: string) {
      const target = state.contacts.find((c) => c.id === id)
      if (!target) return
      const contacts = state.contacts
        .filter((c) => c.id !== id)
        .map((c) => (c.patientId === target.patientId && c.priority > target.priority ? { ...c, priority: c.priority - 1 } : c))
      set({ contacts, devices: bumpConfig(target.patientId) })
    },
    moveContact(id: string, dir: -1 | 1) {
      const target = state.contacts.find((c) => c.id === id)
      if (!target) return
      const swap = state.contacts.find((c) => c.patientId === target.patientId && c.priority === target.priority + dir)
      if (!swap) return
      set({
        contacts: state.contacts.map((c) =>
          c.id === target.id ? { ...c, priority: swap.priority } : c.id === swap.id ? { ...c, priority: target.priority } : c),
        devices: bumpConfig(target.patientId),
      })
    },
    updateContact(id: string, patch: Partial<Pick<EmergencyContact, 'notifyOnSos' | 'notifyOnFall'>>) {
      const target = state.contacts.find((c) => c.id === id)
      if (!target) return
      set({ contacts: state.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)), devices: bumpConfig(target.patientId) })
    },

    pair(input: PairInput): { error: string } | { patientId: string } {
      const uid = input.deviceId.trim().toUpperCase()
      if (!/^[A-Z0-9_-]{3,64}$/.test(uid)) return { error: 'Band ids use letters, digits, - and _ only (they become part of an MQTT topic).' }
      if (state.devices.some((d) => d.id === uid)) return { error: `${uid} is already registered to this facility.` }
      const now = Date.now()
      let patients = state.patients
      let patientId = input.existingPatientId
      if (patientId) {
        const p = patients.find((x) => x.id === patientId)
        if (!p) return { error: 'That patient no longer exists.' }
        if (p.deviceId) return { error: `${p.name} already wears ${p.deviceId}. Unpair it first.` }
        patients = patients.map((x) => (x.id === patientId ? { ...x, deviceId: uid } : x))
      } else if (input.newPatient) {
        const np = input.newPatient
        if (!np.name.trim()) return { error: 'Enter the patient’s name.' }
        if (!np.room.trim()) return { error: 'Enter a room.' }
        patientId = `pat-${now.toString(36)}`
        patients = [...patients, { id: patientId, name: np.name.trim(), age: np.age, sex: np.sex, room: np.room.trim(), zone: np.zone as Zone, deviceId: uid, admittedAt: now, notes: '' }]
      } else {
        return { error: 'Choose a patient for this band.' }
      }
      const base: Baseline = { hr: Math.round(rand(66, 80)), spo2: Math.round(rand(96, 99)), temp: round1(rand(36.3, 36.8)) }
      baselines.set(patientId, base)
      const device: Device = {
        id: uid, label: 'S-Care Band', patientId, battery: 100, charging: false, worn: true, signal: 4, firmware: '2.1.3',
        online: true, lastSeen: now, heartbeatSec: 10, configVersion: 1, configAcked: 0,
      }
      set({
        patients,
        devices: [...state.devices, device],
        buffers: { ...state.buffers, [patientId]: { hr: [], spo2: [], temp: [] } },
        vitals: { ...state.vitals, [patientId]: { ...base, ts: now } },
      })
      return { patientId }
    },
    unpair(deviceId: string) {
      set({
        devices: state.devices.filter((d) => d.id !== deviceId),
        patients: state.patients.map((p) => (p.deviceId === deviceId ? { ...p, deviceId: null } : p)),
      })
    },
  }
}

export type Simulator = ReturnType<typeof createSimulator>
