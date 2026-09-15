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
  id: string
  label: string
  patientId: string | null
  battery: number
  charging: boolean
  worn: boolean
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
  phone: string
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
