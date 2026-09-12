// Domain types for the web dashboard. They mirror database/postgres/001_initial_schema.sql
// closely enough that swapping the in-browser simulator for the real API is a data-layer change.

export type Zone = 'North Wing' | 'West Wing' | 'East Wing' | 'South Wing'
export type Sex = 'female' | 'male' | 'other'

export type AlertType =
  | 'fall'
  | 'sos'
  | 'tachycardia'
  | 'bradycardia'
  | 'hypoxemia'
  | 'low_battery'
  | 'offline'
export type Severity = 'critical' | 'warning' | 'info'
export type AlertStatus = 'pending' | 'open' | 'acknowledged' | 'resolved' | 'cancelled'
export type AlertSource = 'device' | 'rules' | 'system' | 'manual'
export type Resolution = 'assisted' | 'false_alarm' | 'no_action_needed'

/** Derived, never stored: offline from check-ins, warning/critical from vitals and open alerts. */
export type PatientStatus = 'normal' | 'warning' | 'critical' | 'offline'

export type VitalKey = 'hr' | 'spo2' | 'temp'

export interface Patient {
  id: string
  name: string
  age: number
  sex: Sex
  room: string
  zone: Zone
  deviceId: string | null
  admittedAt: number
  notes: string
}

export interface Device {
  /** The printed / QR id, e.g. SC-DEV-102. Also its MQTT client id. */
  id: string
  label: string
  patientId: string | null
  battery: number
  charging: boolean
  worn: boolean
  /** 0–4 bars */
  signal: number
  firmware: string
  online: boolean
  lastSeen: number
  heartbeatSec: number
  configVersion: number
  configAcked: number
}

export interface Sample {
  t: number
  v: number
}

export interface Vitals {
  hr: number | null
  spo2: number | null
  temp: number | null
  ts: number
}

export interface AlertEvent {
  at: number
  kind: 'created' | 'escalated' | 'confirmed' | 'cancelled' | 'acknowledged' | 'resolved' | 'notified'
  by?: string
  text: string
}

export interface AlertNotification {
  channel: 'push' | 'sms' | 'sms_device'
  to: string
  status: 'queued' | 'sent' | 'delivered' | 'failed'
  at: number
}

export interface Alert {
  id: string
  type: AlertType
  severity: Severity
  status: AlertStatus
  source: AlertSource
  patientId: string | null
  deviceId: string | null
  occurredAt: number
  /** Falls only: when the band's 15 s cancel window ends. */
  countdownEndsAt?: number
  locationLabel: string
  hrSnapshot: number | null
  spo2Snapshot: number | null
  impactG?: number
  details: string
  smsSentByDevice: boolean
  acknowledgedAt?: number
  acknowledgedBy?: string
  resolvedAt?: number
  resolvedBy?: string
  resolution?: Resolution
  resolutionNotes?: string
  events: AlertEvent[]
  notifications: AlertNotification[]
}

export interface EmergencyContact {
  id: string
  patientId: string
  name: string
  relationship: string
  /** E.164 */
  phone: string
  /** 1 = primary; the band texts in this order */
  priority: number
  notifyOnSos: boolean
  notifyOnFall: boolean
}

export interface Thresholds {
  hrCritLow: number
  hrWarnLow: number
  hrWarnHigh: number
  hrCritHigh: number
  spo2WarnLow: number
  spo2CritLow: number
  batteryWarn: number
  batteryCrit: number
  sustainSeconds: number
}

export type Role = 'admin' | 'caregiver'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  zone: string
}
