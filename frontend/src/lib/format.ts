import type { AlertStatus, AlertType, PatientStatus, Resolution, Severity } from './types'

export function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'yesterday' : `${d}d ago`
}

const pad = (n: number) => String(n).padStart(2, '0')

export function clock(ts: number, seconds = false): string {
  const d = new Date(ts)
  return seconds
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    : `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
}

export function dateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  fall: 'Fall Detected',
  sos: 'SOS Pressed',
  tachycardia: 'Tachycardia',
  bradycardia: 'Bradycardia',
  hypoxemia: 'Low Blood Oxygen',
  low_battery: 'Low Battery',
  offline: 'Band Offline',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Notice',
}

export const STATUS_LABEL: Record<AlertStatus, string> = {
  pending: 'Confirming',
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
}

export const RESOLUTION_LABEL: Record<Resolution, string> = {
  assisted: 'Assisted the patient',
  false_alarm: 'False alarm',
  no_action_needed: 'No action needed',
}

export const PATIENT_STATUS_LABEL: Record<PatientStatus, string> = {
  normal: 'Normal',
  warning: 'Warning',
  critical: 'Critical',
  offline: 'Offline',
}

/** Short reference shown to people: demo ids are already short (ALT-901); database ids are UUIDs. */
export function alertRef(id: string): string {
  return id.startsWith('ALT-') ? id : `ALT-${id.slice(0, 6).toUpperCase()}`
}

export function isActive(status: AlertStatus): boolean {
  return status === 'pending' || status === 'open' || status === 'acknowledged'
}
