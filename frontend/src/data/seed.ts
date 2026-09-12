// The demo world. Patients, bands and alerts are the same ones S-Care Mobile's
// MockDataGenerator uses, so both apps show the same ward.

import type { Alert, Device, EmergencyContact, Patient, Thresholds, User } from '../lib/types'

export interface Baseline {
  hr: number
  spo2: number
  temp: number
}

export interface SeedPatient {
  patient: Omit<Patient, 'admittedAt'>
  device: Omit<Device, 'lastSeen'> & { lastSeenAgoSec: number }
  baseline: Baseline
}

export const SEED_PATIENTS: SeedPatient[] = [
  {
    patient: { id: 'pat-eleanor', name: 'Eleanor Vance', age: 79, sex: 'female', room: '204', zone: 'North Wing', deviceId: 'SC-DEV-101', notes: 'Mild hypertension. Walks the garden courtyard most mornings.' },
    device: { id: 'SC-DEV-101', label: 'S-Care Band Alpha', patientId: 'pat-eleanor', battery: 88, charging: false, worn: true, signal: 4, firmware: '2.1.3', online: true, heartbeatSec: 10, configVersion: 3, configAcked: 3, lastSeenAgoSec: 2 },
    baseline: { hr: 74, spo2: 98, temp: 36.6 },
  },
  {
    patient: { id: 'pat-arthur', name: 'Arthur Pendelton', age: 84, sex: 'male', room: '112', zone: 'West Wing', deviceId: 'SC-DEV-102', notes: 'History of falls. Uses a walker; stairs near the West Hallway.' },
    device: { id: 'SC-DEV-102', label: 'S-Care Band Beta', patientId: 'pat-arthur', battery: 42, charging: false, worn: true, signal: 3, firmware: '2.1.3', online: true, heartbeatSec: 10, configVersion: 4, configAcked: 4, lastSeenAgoSec: 2 },
    baseline: { hr: 112, spo2: 93, temp: 37.1 },
  },
  {
    patient: { id: 'pat-clara', name: 'Clara Zhang', age: 76, sex: 'female', room: '305', zone: 'East Wing', deviceId: 'SC-DEV-103', notes: 'Atrial fibrillation, on anticoagulants.' },
    device: { id: 'SC-DEV-103', label: 'S-Care Band Gamma', patientId: 'pat-clara', battery: 95, charging: false, worn: true, signal: 4, firmware: '2.1.3', online: true, heartbeatSec: 10, configVersion: 2, configAcked: 2, lastSeenAgoSec: 2 },
    baseline: { hr: 104, spo2: 96, temp: 36.8 },
  },
  {
    patient: { id: 'pat-robert', name: 'Robert Kim', age: 82, sex: 'male', room: '108', zone: 'South Wing', deviceId: 'SC-DEV-104', notes: 'COPD. Oxygen concentrator at night.' },
    device: { id: 'SC-DEV-104', label: 'S-Care Band Delta', patientId: 'pat-robert', battery: 67, charging: false, worn: true, signal: 4, firmware: '2.1.2', online: true, heartbeatSec: 10, configVersion: 5, configAcked: 5, lastSeenAgoSec: 2 },
    baseline: { hr: 68, spo2: 97, temp: 36.5 },
  },
  {
    patient: { id: 'pat-evelyn', name: 'Evelyn Miller', age: 88, sex: 'female', room: '210', zone: 'North Wing', deviceId: 'SC-DEV-105', notes: 'Early-stage dementia. Tends to remove the band at night.' },
    device: { id: 'SC-DEV-105', label: 'S-Care Band Epsilon', patientId: 'pat-evelyn', battery: 15, charging: false, worn: false, signal: 2, firmware: '2.1.3', online: true, heartbeatSec: 10, configVersion: 2, configAcked: 2, lastSeenAgoSec: 4 },
    baseline: { hr: 70, spo2: 97, temp: 36.4 },
  },
  {
    patient: { id: 'pat-thomas', name: 'Thomas Hayes', age: 81, sex: 'male', room: '103', zone: 'West Wing', deviceId: 'SC-DEV-106', notes: 'Recovering from hip surgery.' },
    device: { id: 'SC-DEV-106', label: 'S-Care Band Zeta', patientId: 'pat-thomas', battery: 3, charging: false, worn: false, signal: 0, firmware: '2.0.9', online: false, heartbeatSec: 10, configVersion: 1, configAcked: 1, lastSeenAgoSec: 3 * 3600 },
    baseline: { hr: 72, spo2: 97, temp: 36.5 },
  },
]

/** Facility defaults. Sustain time is short so the rule engine is visible in a demo. */
export const SEED_FACILITY_THRESHOLDS: Partial<Thresholds> = {
  sustainSeconds: 20,
}

export function seedContacts(): EmergencyContact[] {
  const out: EmergencyContact[] = []
  for (const { patient } of SEED_PATIENTS) {
    const surname = patient.name.split(' ').slice(-1)[0]
    const family = patient.sex === 'female' ? `Daniel ${surname}` : `Grace ${surname}`
    const suffix = patient.id.length
    out.push(
      { id: `${patient.id}-c1`, patientId: patient.id, name: 'Sarah Jenkins', relationship: 'Head Nurse', phone: '+15552345678', priority: 1, notifyOnSos: true, notifyOnFall: true },
      { id: `${patient.id}-c2`, patientId: patient.id, name: 'Dr. Marcus Vance', relationship: 'Attending Physician', phone: '+15558765432', priority: 2, notifyOnSos: true, notifyOnFall: true },
      { id: `${patient.id}-c3`, patientId: patient.id, name: family, relationship: patient.sex === 'female' ? 'Son' : 'Daughter', phone: `+1555345${String(6700 + suffix * 7).slice(-4)}`, priority: 3, notifyOnSos: true, notifyOnFall: false },
    )
  }
  return out
}

const MIN = 60_000
const HOUR = 60 * MIN

export function seedAlerts(now: number): Alert[] {
  return [
    {
      id: 'ALT-901', type: 'fall', severity: 'critical', status: 'open', source: 'device',
      patientId: 'pat-arthur', deviceId: 'SC-DEV-102', occurredAt: now - 4 * MIN,
      locationLabel: 'Room 112 • West Wing', hrSnapshot: 118, spo2Snapshot: 93, impactG: 3.8,
      details: 'High impact acceleration near the West Hallway stairs. No movement for 40 s after impact.',
      smsSentByDevice: true,
      events: [
        { at: now - 4 * MIN - 15_000, kind: 'created', text: 'Band detected a fall (3.8 g) and started its 15 s cancel countdown' },
        { at: now - 4 * MIN, kind: 'confirmed', text: 'Countdown ended without a cancel — alert opened' },
        { at: now - 4 * MIN, kind: 'notified', text: 'Push sent to 2 caregivers · band texted 2 emergency contacts' },
      ],
      notifications: [
        { channel: 'push', to: 'Jordan Cole', status: 'delivered', at: now - 4 * MIN },
        { channel: 'push', to: 'Sarah Jenkins', status: 'delivered', at: now - 4 * MIN },
        { channel: 'sms_device', to: 'Sarah Jenkins · +1 555 234 5678', status: 'sent', at: now - 4 * MIN },
        { channel: 'sms_device', to: 'Dr. Marcus Vance · +1 555 876 5432', status: 'sent', at: now - 4 * MIN },
      ],
    },
    {
      id: 'ALT-902', type: 'tachycardia', severity: 'warning', status: 'open', source: 'rules',
      patientId: 'pat-clara', deviceId: 'SC-DEV-103', occurredAt: now - 22 * MIN,
      locationLabel: 'Room 305 • East Wing', hrSnapshot: 108, spo2Snapshot: 95,
      details: 'Heart rate held above 100 bpm for 6 minutes at rest (peak 108 bpm).',
      smsSentByDevice: false,
      events: [
        { at: now - 22 * MIN, kind: 'created', text: 'Rule fired: heart rate above 100 bpm, sustained' },
        { at: now - 22 * MIN, kind: 'notified', text: 'Push sent to 2 caregivers' },
      ],
      notifications: [
        { channel: 'push', to: 'Jordan Cole', status: 'delivered', at: now - 22 * MIN },
        { channel: 'push', to: 'Sarah Jenkins', status: 'delivered', at: now - 22 * MIN },
      ],
    },
    {
      id: 'ALT-903', type: 'low_battery', severity: 'info', status: 'acknowledged', source: 'rules',
      patientId: 'pat-evelyn', deviceId: 'SC-DEV-105', occurredAt: now - 45 * MIN,
      locationLabel: 'Room 210 • North Wing', hrSnapshot: null, spo2Snapshot: null,
      details: 'Band at 15%. The charging dock is in the room but the band is undocked.',
      smsSentByDevice: false,
      acknowledgedAt: now - 38 * MIN, acknowledgedBy: 'Sarah Jenkins',
      events: [
        { at: now - 45 * MIN, kind: 'created', text: 'Battery fell below 20%' },
        { at: now - 38 * MIN, kind: 'acknowledged', by: 'Sarah Jenkins', text: 'Acknowledged' },
      ],
      notifications: [{ channel: 'push', to: 'Sarah Jenkins', status: 'delivered', at: now - 45 * MIN }],
    },
    {
      id: 'ALT-904', type: 'sos', severity: 'critical', status: 'resolved', source: 'device',
      patientId: 'pat-eleanor', deviceId: 'SC-DEV-101', occurredAt: now - 2 * HOUR - 15 * MIN,
      locationLabel: 'Room 204 • North Wing', hrSnapshot: 86, spo2Snapshot: 98,
      details: 'SOS button held for 3 s.',
      smsSentByDevice: true,
      resolvedAt: now - 2 * HOUR - 8 * MIN, resolvedBy: 'Sarah Jenkins', resolution: 'assisted',
      resolutionNotes: 'Pressed SOS for help getting out of bed. Assisted safely, no injury.',
      events: [
        { at: now - 2 * HOUR - 15 * MIN, kind: 'created', text: 'SOS pressed on the band' },
        { at: now - 2 * HOUR - 15 * MIN, kind: 'notified', text: 'Push sent to 2 caregivers · band texted 3 emergency contacts' },
        { at: now - 2 * HOUR - 8 * MIN, kind: 'resolved', by: 'Sarah Jenkins', text: 'Resolved — assisted the patient' },
      ],
      notifications: [
        { channel: 'push', to: 'Sarah Jenkins', status: 'delivered', at: now - 2 * HOUR - 15 * MIN },
        { channel: 'sms_device', to: 'Sarah Jenkins · +1 555 234 5678', status: 'sent', at: now - 2 * HOUR - 15 * MIN },
      ],
    },
    {
      id: 'ALT-905', type: 'hypoxemia', severity: 'warning', status: 'resolved', source: 'rules',
      patientId: 'pat-robert', deviceId: 'SC-DEV-104', occurredAt: now - 5 * HOUR,
      locationLabel: 'Room 108 • South Wing', hrSnapshot: 78, spo2Snapshot: 92,
      details: 'SpO₂ dipped to 92% during the night.',
      smsSentByDevice: false,
      resolvedAt: now - 4 * HOUR - 40 * MIN, resolvedBy: 'Dr. Marcus Vance', resolution: 'assisted',
      resolutionNotes: 'Oxygen concentrator tubing had come loose. Refitted; recovered to 99%.',
      events: [
        { at: now - 5 * HOUR, kind: 'created', text: 'Rule fired: SpO₂ below 95%, sustained' },
        { at: now - 4 * HOUR - 40 * MIN, kind: 'resolved', by: 'Dr. Marcus Vance', text: 'Resolved — assisted the patient' },
      ],
      notifications: [{ channel: 'push', to: 'Dr. Marcus Vance', status: 'delivered', at: now - 5 * HOUR }],
    },
    {
      id: 'ALT-900', type: 'fall', severity: 'critical', status: 'cancelled', source: 'device',
      patientId: 'pat-robert', deviceId: 'SC-DEV-104', occurredAt: now - 26 * HOUR,
      locationLabel: 'Room 108 • South Wing', hrSnapshot: 81, spo2Snapshot: 98, impactG: 2.1,
      details: 'Possible fall (2.1 g) while sitting down in the dining hall.',
      smsSentByDevice: false,
      events: [
        { at: now - 26 * HOUR, kind: 'created', text: 'Band detected a possible fall (2.1 g) and started its 15 s cancel countdown' },
        { at: now - 26 * HOUR + 6_000, kind: 'cancelled', text: 'Wearer pressed Cancel after 6 s — kept as false-alarm data' },
      ],
      notifications: [],
    },
  ]
}

export const DEMO_USERS: (User & { password: string })[] = [
  { id: 'usr-jordan', email: 'caregiver@scare.demo', password: 'demo1234', name: 'Jordan Cole', role: 'caregiver', zone: 'West Wing' },
  { id: 'usr-sarah', email: 'admin@scare.demo', password: 'admin1234', name: 'Sarah Jenkins', role: 'admin', zone: 'Head Nurse' },
]
