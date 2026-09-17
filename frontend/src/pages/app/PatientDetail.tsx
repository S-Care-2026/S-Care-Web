import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/context'
import { AlertCard } from '../../components/app/AlertCard'
import { useAppActions } from '../../components/app/actions-context'
import { StatPanel } from '../../components/charts/StatPanel'
import { TimeSeriesPanel, type Point, type Threshold } from '../../components/charts/TimeSeriesPanel'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/toast-context'
import { Avatar, EmptyState, LivePill, StatusChip } from '../../components/ui'
import { RANGES, type RangeKey } from '../../data/history'
import { formatPhone, thresholdsFor, type Scenario } from '../../data/simulator'
import { patientStatus, perform, sim, useNow, useSim } from '../../data/store'
import { useVitalHistory } from '../../data/useVitalHistory'
import { hrLevel, spo2Level, tempLevel, validateThresholds, type Level } from '../../lib/thresholds'
import { timeAgo } from '../../lib/format'
import type { Thresholds, VitalKey } from '../../lib/types'

const VITALS: Record<VitalKey, { label: string; unit: string; color: string; fill: string; decimals: number; softMin: number; softMax: number; typical: number }> = {
  hr: { label: 'Heart rate', unit: 'bpm', color: 'var(--sc-hr)', fill: 'var(--sc-hr-fill)', decimals: 0, softMin: 50, softMax: 110, typical: 74 },
  spo2: { label: 'SpO₂', unit: '%', color: 'var(--sc-spo2)', fill: 'var(--sc-spo2-fill)', decimals: 0, softMin: 88, softMax: 100, typical: 97 },
  temp: { label: 'Skin temp', unit: '°C', color: 'var(--sc-temp)', fill: 'var(--sc-temp-fill)', decimals: 1, softMin: 35.5, softMax: 37.8, typical: 36.6 },
}

function thresholdLines(vital: VitalKey, t: Thresholds): Threshold[] {
  if (vital === 'hr')
    return [
      { value: t.hrCritHigh, tone: 'critical', label: 'Critical high' },
      { value: t.hrWarnHigh, tone: 'warning', label: 'Warn high' },
      { value: t.hrWarnLow, tone: 'warning', label: 'Warn low' },
    ]
  if (vital === 'spo2')
    return [
      { value: t.spo2WarnLow, tone: 'warning', label: 'Warn low' },
      { value: t.spo2CritLow, tone: 'critical', label: 'Critical low' },
    ]
  return [{ value: 37.6, tone: 'warning', label: 'Warn high' }]
}

const SCENARIOS: { key: Scenario; label: string }[] = [
  { key: 'normal', label: 'Normal' },
  { key: 'tachycardia', label: 'High HR' },
  { key: 'bradycardia', label: 'Low HR' },
  { key: 'hypoxemia', label: 'Low SpO₂' },
]

export function PatientDetail() {
  const { patientId } = useParams()
  const state = useSim()
  const patient = state.patients.find((p) => p.id === patientId)

  if (!patient && state.ready === false) {
    return <p className="card mx-auto max-w-[480px] p-6 text-center text-[13px] text-t2">Loading patient…</p>
  }
  if (!patient) {
    return (
      <EmptyState
        icon="patients"
        title="Patient not found"
        body="They may have been discharged, or the link is out of date."
        action={<Link to="/patients" className="btn btn-ghost btn-sm">Back to patients</Link>}
      />
    )
  }
  return <PatientView key={patient.id} patientId={patient.id} />
}

function PatientView({ patientId }: { patientId: string }) {
  const state = useSim()
  const now = useNow(1000)
  const { simulateAlert } = useAppActions()
  const patient = state.patients.find((p) => p.id === patientId)!
  const device = state.devices.find((d) => d.id === patient.deviceId)
  const t = thresholdsFor(state, patientId)
  const status = patientStatus(state, patient)
  const v = state.vitals[patientId]
  const buffer = state.buffers[patientId] ?? { hr: [], spo2: [], temp: [] }
  const reporting = Boolean(device?.online && device.worn)

  const [vital, setVital] = useState<VitalKey>('hr')
  const [frozen, setFrozen] = useState<Point[] | null>(null)
  const [range, setRange] = useState<Exclude<RangeKey, 'live'>>('24h')

  const livePoints = reporting ? buffer[vital].slice(-150) : []
  const shownLive = frozen ?? livePoints

  const levels: Record<VitalKey, Level | null> = {
    hr: reporting ? hrLevel(v?.hr ?? null, t) : null,
    spo2: reporting ? spo2Level(v?.spo2 ?? null, t) : null,
    temp: reporting ? tempLevel(v?.temp ?? null) : null,
  }
  const minuteBucket = Math.floor(state.now / 60_000)
  const typical = useMemo(() => {
    const b = buffer[vital]
    return b.length ? b.reduce((s, x) => s + x.v, 0) / b.length : VITALS[vital].typical
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vital, minuteBucket, patientId])
  const vitalHistory = useVitalHistory(patientId, vital, range, minuteBucket, typical)
  const live = sim.kind === 'live'

  const patientAlerts = state.alerts
    .filter((a) => a.patientId === patientId)
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .slice(0, 5)
  const spec = VITALS[vital]
  const level = levels[vital]

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/patients" className="icon-btn" aria-label="Back to patients">
          <Icon name="chevron-left" size={18} strokeWidth={2.4} />
        </Link>
        <Avatar name={patient.name} status={status} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[20px] font-extrabold tracking-[-0.4px]">{patient.name}</h2>
          <p className="text-[12px] text-t3">
            Room {patient.room} • {patient.zone} · {patient.age} yrs · <span className="font-mono">{patient.deviceId ?? 'no band'}</span>
          </p>
        </div>
        <StatusChip status={status} />
        <button type="button" className="btn btn-danger btn-sm" onClick={() => simulateAlert(patientId)}>
          <Icon name="bell" size={14} />
          {live ? 'Raise alert' : 'Simulate alert'}
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex h-7 items-center gap-2">
            <Icon name="chevron-down" size={14} strokeWidth={2.6} className="text-t2" />
            <b className="text-[13px]">Live monitor</b>
            <span className="flex-1" />
            <LivePill running={state.running && !frozen && reporting} label="LIVE" />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!reporting}
              onClick={() => setFrozen(frozen ? null : livePoints)}
              aria-pressed={Boolean(frozen)}
            >
              <Icon name={frozen ? 'play' : 'pause'} size={13} strokeWidth={2.6} />
              {frozen ? 'Resume' : 'Pause'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {(Object.keys(VITALS) as VitalKey[]).map((k) => (
              <StatPanel
                key={k}
                label={VITALS[k].label}
                value={reporting && v?.[k] != null ? v[k]!.toFixed(VITALS[k].decimals) : '—'}
                unit={VITALS[k].unit}
                level={levels[k]}
                color={VITALS[k].color}
                spark={reporting ? buffer[k].slice(-45).map((s) => s.v) : undefined}
                selected={vital === k}
                onSelect={() => {
                  setVital(k)
                  setFrozen(null)
                }}
              />
            ))}
          </div>

          <TimeSeriesPanel
            title={`${spec.label} — ${frozen ? 'paused' : 'streaming'}`}
            unit={spec.unit}
            color={spec.color}
            fill={spec.fill}
            points={shownLive}
            thresholds={thresholdLines(vital, t)}
            softMin={spec.softMin}
            softMax={spec.softMax}
            decimals={spec.decimals}
            timeFormat="seconds"
            live={!frozen}
            alarm={level === 'critical'}
            height={200}
            source={`Source: ${device?.label ?? 'S-Care Band'} (${device?.id ?? '—'}) · ${live ? 'as reported by the band · last 30 min' : 'every 2 s · last 5 min'}`}
            emptyText={!device ? 'No band paired.' : !device.online ? `Band offline — last seen ${timeAgo(device.lastSeen, now)}.` : 'Band not worn — no readings.'}
          />

          <div className="flex h-8 flex-wrap items-center gap-2">
            <Icon name="chevron-down" size={14} strokeWidth={2.6} className="text-t2" />
            <b className="text-[13px]">Vitals history</b>
            <span className="flex-1" />
            <div className="seg" role="group" aria-label="Time range">
              {RANGES.filter((r) => r.key !== 'live').map((r) => (
                <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key as Exclude<RangeKey, 'live'>)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <TimeSeriesPanel
            title={`${spec.label} — last ${RANGES.find((r) => r.key === range)!.label}`}
            unit={spec.unit}
            color={spec.color}
            fill={spec.fill}
            points={vitalHistory.points}
            thresholds={thresholdLines(vital, t)}
            softMin={spec.softMin}
            softMax={spec.softMax}
            decimals={spec.decimals}
            timeFormat={range === '7d' ? 'days' : 'minutes'}
            height={170}
            source={
              live
                ? `Source: InfluxDB scare_raw · ${RANGES.find((r) => r.key === range)!.stepMs / 60_000} min buckets${vitalHistory.failed ? ' · couldn’t refresh' : ''}`
                : `Source: InfluxDB ${range === '1h' ? 'scare_raw' : 'scare_1m'} (simulated) · ${RANGES.find((r) => r.key === range)!.stepMs / 60_000} min buckets`
            }
            emptyText={
              vital === 'temp' && live
                ? 'The band has no temperature sensor.'
                : vitalHistory.loading
                  ? 'Loading history…'
                  : 'No readings in this period yet.'
            }
          />

          <section className="flex flex-col gap-2.5">
            <b className="text-[14px]">Recent alerts</b>
            {patientAlerts.length ? (
              <div className="grid gap-2.5 lg:grid-cols-2">
                {patientAlerts.map((a) => <AlertCard key={a.id} alert={a} patient={patient} compact />)}
              </div>
            ) : (
              <p className="card p-4 text-[13px] text-t2">No alerts for {patient.name} yet.</p>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <BandCard patientId={patientId} />
          {!live && <DriveCard patientId={patientId} />}
          <ContactsCard patientId={patientId} />
          <ThresholdsCard patientId={patientId} />
          {patient.notes && (
            <section className="card p-4">
              <h3 className="text-[11px] font-extrabold tracking-[0.8px] text-t3 uppercase">Care notes</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-t2">{patient.notes}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

function Switch({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3">
      <span>
        <span className="block text-[13px] font-semibold text-t1">{label}</span>
        {hint && <span className="block text-[11px] text-t3">{hint}</span>}
      </span>
      <span className="relative inline-flex flex-none">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full border border-line bg-elev transition-colors peer-checked:border-green peer-checked:bg-green peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-green" />
        <span className="absolute top-1 left-1 h-4 w-4 rounded-full bg-t3 transition-transform peer-checked:translate-x-5 peer-checked:bg-on-green" />
      </span>
    </label>
  )
}

function BandCard({ patientId }: { patientId: string }) {
  const state = useSim()
  const now = useNow(5000)
  const { pairDevice } = useAppActions()
  const { user } = useAuth()
  const toast = useToast()
  const [confirmUnpair, setConfirmUnpair] = useState(false)
  const canManage = user?.role === 'admin' || user?.role === 'caregiver'
  const patient = state.patients.find((p) => p.id === patientId)!
  const device = state.devices.find((d) => d.id === patient.deviceId)
  const t = thresholdsFor(state, patientId)

  if (!device) {
    return (
      <section className="card flex flex-col gap-3 p-4">
        <h3 className="text-[11px] font-extrabold tracking-[0.8px] text-t3 uppercase">Band</h3>
        <p className="text-[13px] text-t2">No band paired with {patient.name}.</p>
        <button type="button" className="btn btn-primary btn-sm self-start" onClick={pairDevice}>
          <Icon name="scan" size={14} />
          Pair a band
        </button>
      </section>
    )
  }
  const battery = device.battery
  const batteryTone = battery == null ? 'bg-slate' : battery <= t.batteryCrit ? 'bg-red' : battery <= t.batteryWarn ? 'bg-amber' : 'bg-green'
  const synced = device.configAcked >= device.configVersion

  return (
    <section className="card flex flex-col gap-3.5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-extrabold tracking-[0.8px] text-t3 uppercase">Band</h3>
        <span className={`chip ${device.online ? 'bg-green text-on-green' : 'bg-slate text-on-slate'}`}>{device.online ? 'Online' : 'Offline'}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-elev text-green"><Icon name="watch" size={20} /></span>
        <div>
          <b className="font-mono text-[14px]">{device.id}</b>
          <p className="text-[11px] text-t3">{device.label} · firmware {device.firmware}</p>
        </div>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[12px]">
          <span className="font-semibold text-t2">Battery</span>
          <b className="tabular-nums">{battery == null ? 'Not reported' : `${Math.round(battery)}%`}</b>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-elev" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={battery == null ? undefined : Math.round(battery)} aria-label="Battery">
          <div className={`h-full ${batteryTone}`} style={{ width: `${battery ?? 0}%` }} />
        </div>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
        <dt className="text-t3">Signal</dt>
        <dd className="m-0 flex items-end gap-0.5 justify-self-end" aria-label={`${device.signal} of 4 bars`}>
          {[1, 2, 3, 4].map((b) => <span key={b} className={`w-1 rounded-sm ${b <= device.signal && device.online ? 'bg-green' : 'bg-hair'}`} style={{ height: 4 + b * 3 }} />)}
        </dd>
        <dt className="text-t3">Worn</dt>
        <dd className="m-0 justify-self-end font-semibold">{device.worn ? 'Yes' : 'No'}</dd>
        <dt className="text-t3">Last check-in</dt>
        <dd className="m-0 justify-self-end font-semibold">{device.online ? 'Live' : timeAgo(device.lastSeen, now)}</dd>
        <dt className="text-t3">SMS numbers on band</dt>
        <dd className={`m-0 justify-self-end font-semibold ${synced ? 'text-green' : 'text-amber'}`}>
          {synced ? `Up to date (v${device.configVersion})` : device.online ? 'Syncing…' : `Stale (band has v${device.configAcked})`}
        </dd>
      </dl>
      {canManage &&
        (confirmUnpair ? (
          <div className="flex flex-col gap-2 rounded-md border border-amber bg-amber-surf p-3">
            <p className="text-[12px] text-t1">
              Stop monitoring {patient.name} with {device.id}? Readings stop showing here and the band’s emergency numbers are cleared.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  if (await perform(() => sim.unpair(device.id))) {
                    toast({ tone: 'info', title: `${device.id} unpaired`, body: 'Pair it again from the dashboard when it’s ready for someone else.' })
                  }
                  setConfirmUnpair(false)
                }}
              >
                Unpair band
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmUnpair(false)}>Keep it</button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => setConfirmUnpair(true)}>
            Unpair band
          </button>
        ))}
    </section>
  )
}

function DriveCard({ patientId }: { patientId: string }) {
  const state = useSim()
  const toast = useToast()
  const patient = state.patients.find((p) => p.id === patientId)!
  const device = state.devices.find((d) => d.id === patient.deviceId)
  const scenario = state.scenarios[patientId] ?? 'normal'
  if (!device) return null

  return (
    <section className="card flex flex-col gap-3.5 border-dashed p-4">
      <div>
        <h3 className="text-[11px] font-extrabold tracking-[0.8px] text-t3 uppercase">Test controls</h3>
        <p className="mt-1 text-[12px] text-t3">Simulated band behaviour — lets you watch the rules raise and resolve alerts.</p>
      </div>
      <div>
        <span className="field-label" id={`drive-${patientId}`}>Drive vitals toward</span>
        <div className="seg flex w-full" role="group" aria-labelledby={`drive-${patientId}`}>
          {SCENARIOS.map((s) => (
            <button key={s.key} type="button" className="flex-1 px-1!" aria-pressed={scenario === s.key} onClick={() => sim.setScenario(patientId, s.key)} disabled={!device.worn || !device.online}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <Switch id={`worn-${patientId}`} label="Band worn" hint="Off = no vitals, like at night" checked={device.worn} onChange={(worn) => sim.setDevice(device.id, { worn })} />
      <Switch id={`online-${patientId}`} label="Band connected" hint="Off = offline alert after 2 missed check-ins" checked={device.online} onChange={(online) => sim.setDevice(device.id, { online })} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            sim.setDevice(device.id, { battery: 9, online: true })
            toast({ tone: 'info', title: 'Battery set to 9%', body: 'A low-battery alert escalates on the next check-in.' })
          }}
        >
          <Icon name="battery" size={14} />
          Drain battery
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => sim.setDevice(device.id, { battery: 100, charging: false })}>
          Charge to 100%
        </button>
      </div>
    </section>
  )
}

function ContactsCard({ patientId }: { patientId: string }) {
  const state = useSim()
  const toast = useToast()
  const contacts = state.contacts.filter((c) => c.patientId === patientId).sort((a, b) => a.priority - b.priority)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-extrabold tracking-[0.8px] text-t3 uppercase">Emergency contacts</h3>
        <span className="text-[11px] text-t3">{contacts.length} / 5 on band</span>
      </div>
      <p className="text-[12px] text-t3">The band texts these numbers in order on SOS or a fall — straight over its SIM, even without Wi-Fi.</p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {contacts.map((c, i) => (
          <li key={c.id} className="rounded-md border border-hair bg-elev p-2.5">
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded text-[11px] font-extrabold ${c.priority === 1 ? 'bg-green text-on-green' : 'border border-line text-t2'}`}>{c.priority}</span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13px]">{c.name}</b>
                <span className="block text-[11px] text-t3">{c.relationship} · <span className="font-mono">{formatPhone(c.phone)}</span></span>
              </div>
              <div className="flex gap-0.5">
                <button type="button" className="icon-btn h-7 w-7" disabled={i === 0} onClick={() => void perform(() => sim.moveContact(c.id, -1))} aria-label={`Move ${c.name} up`}><Icon name="arrow-up" size={13} /></button>
                <button type="button" className="icon-btn h-7 w-7" disabled={i === contacts.length - 1} onClick={() => void perform(() => sim.moveContact(c.id, 1))} aria-label={`Move ${c.name} down`}><Icon name="arrow-down" size={13} /></button>
                <button
                  type="button"
                  className="icon-btn h-7 w-7 hover:text-red"
                  onClick={async () => {
                    if (await perform(() => sim.removeContact(c.id))) {
                      toast({ tone: 'info', title: `Removed ${c.name}`, body: 'The band gets the new list on its next check-in.' })
                    }
                  }}
                  aria-label={`Remove ${c.name}`}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
            <div className="mt-2 flex gap-4 pl-7 text-[11px] text-t2">
              <label className="flex items-center gap-1.5" htmlFor={`sos-${c.id}`}>
                <input id={`sos-${c.id}`} type="checkbox" checked={c.notifyOnSos} onChange={(e) => void perform(() => sim.updateContact(c.id, { notifyOnSos: e.target.checked }))} className="accent-[var(--sc-green)]" />
                SOS
              </label>
              <label className="flex items-center gap-1.5" htmlFor={`fall-${c.id}`}>
                <input id={`fall-${c.id}`} type="checkbox" checked={c.notifyOnFall} onChange={(e) => void perform(() => sim.updateContact(c.id, { notifyOnFall: e.target.checked }))} className="accent-[var(--sc-green)]" />
                Falls
              </label>
            </div>
          </li>
        ))}
      </ol>
      {adding ? (
        <form
          className="flex flex-col gap-2.5 border-t border-hair pt-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!name.trim() || !relationship.trim()) return setError('Enter a name and relationship.')
            const err = await sim.addContact({ patientId, name: name.trim(), relationship: relationship.trim(), phone: phone.replace(/[\s()-]/g, ''), notifyOnSos: true, notifyOnFall: true })
            if (err) return setError(err)
            toast({ tone: 'success', title: `Added ${name.trim()}`, body: 'Syncing to the band.' })
            setName('')
            setRelationship('')
            setPhone('')
            setError(null)
            setAdding(false)
          }}
        >
          <input id={`c-name-${patientId}`} className="input h-9" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Contact name" />
          <input id={`c-rel-${patientId}`} className="input h-9" placeholder="Relationship (e.g. Daughter)" value={relationship} onChange={(e) => setRelationship(e.target.value)} aria-label="Relationship" />
          <input id={`c-phone-${patientId}`} className="input h-9 font-mono" placeholder="+84901234567" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone number" inputMode="tel" />
          {error && <p className="text-[12px] text-red" role="alert">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={() => { setAdding(false); setError(null) }}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm flex-1">Add contact</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-outline btn-sm self-start" disabled={contacts.length >= 5} onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} />
          Add contact
        </button>
      )}
    </section>
  )
}

const OVERRIDE_FIELDS: { key: keyof Thresholds; label: string; unit: string }[] = [
  { key: 'hrWarnLow', label: 'HR warn low', unit: 'bpm' },
  { key: 'hrWarnHigh', label: 'HR warn high', unit: 'bpm' },
  { key: 'spo2WarnLow', label: 'SpO₂ warn low', unit: '%' },
  { key: 'sustainSeconds', label: 'Sustain for', unit: 's' },
]

function ThresholdsCard({ patientId }: { patientId: string }) {
  const state = useSim()
  const { user } = useAuth()
  const toast = useToast()
  const t = thresholdsFor(state, patientId)
  const override = state.overrides[patientId]
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<Record<keyof Thresholds, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const isAdmin = user?.role === 'admin'

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-extrabold tracking-[0.8px] text-t3 uppercase">Alert thresholds</h3>
        <span className={`chip ${override ? 'bg-info text-on-info' : 'border border-line text-t2'}`}>{override ? 'Custom' : 'Facility default'}</span>
      </div>
      {editing ? (
        <form
          className="flex flex-col gap-2.5"
          onSubmit={async (e) => {
            e.preventDefault()
            const next: Partial<Thresholds> = {}
            for (const f of OVERRIDE_FIELDS) {
              const raw = draft[f.key]
              if (raw !== undefined && raw !== '') next[f.key] = Number(raw)
            }
            const merged = { ...t, ...next }
            const err = validateThresholds(merged)
            if (err) return setError(err)
            if (!(await perform(() => sim.setOverride(patientId, next)))) return
            toast({ tone: 'success', title: 'Thresholds saved', body: 'Rules use the new values from the next reading.' })
            setEditing(false)
            setError(null)
          }}
        >
          <div className="grid grid-cols-2 gap-2.5">
            {OVERRIDE_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="field-label" htmlFor={`thr-${patientId}-${f.key}`}>{f.label} ({f.unit})</label>
                <input
                  id={`thr-${patientId}-${f.key}`}
                  className="input h-9 tabular-nums"
                  type="number"
                  placeholder={String(t[f.key])}
                  value={draft[f.key] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-t3">Leave a field empty to inherit the facility default.</p>
          {error && <p className="text-[12px] text-red" role="alert">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={() => { setEditing(false); setError(null) }}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm flex-1">Save</button>
          </div>
        </form>
      ) : (
        <>
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[12px] tabular-nums">
            <dt className="text-t3">Heart rate warning</dt><dd className="m-0 text-right font-semibold">{t.hrWarnLow}–{t.hrWarnHigh} bpm</dd>
            <dt className="text-t3">Heart rate critical</dt><dd className="m-0 text-right font-semibold">≤{t.hrCritLow} / ≥{t.hrCritHigh} bpm</dd>
            <dt className="text-t3">SpO₂ warning / critical</dt><dd className="m-0 text-right font-semibold">&lt;{t.spo2WarnLow}% / ≤{t.spo2CritLow}%</dd>
            <dt className="text-t3">Must persist for</dt><dd className="m-0 text-right font-semibold">{t.sustainSeconds} s</dd>
          </dl>
          {isAdmin ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setDraft(Object.fromEntries(Object.entries(override ?? {}).map(([k, val]) => [k, String(val)])))
                  setEditing(true)
                }}
              >
                Customise
              </button>
              {override && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { if (await perform(() => sim.setOverride(patientId, undefined))) toast({ tone: 'info', title: 'Back to facility defaults' }) }}>
                  Use defaults
                </button>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-t3">Only admins can change thresholds.{sim.kind === 'demo' ? ' Sign in as the demo admin to try it.' : ''}</p>
          )}
        </>
      )}
    </section>
  )
}
