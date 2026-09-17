import { useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { AlertCard } from '../../components/app/AlertCard'
import { Icon } from '../../components/Icon'
import { Avatar, StatusChip } from '../../components/ui'
import { activeAlertsFor, patientStatus, useSim } from '../../data/store'
import { PATIENT_STATUS_LABEL, initials } from '../../lib/format'
import type { PatientStatus, Zone } from '../../lib/types'

const W = 1000
const H = 640

const WINGS: Record<Zone, { x: number; y: number; w: number; h: number }> = {
  'North Wing': { x: 60, y: 50, w: 380, h: 230 },
  'West Wing': { x: 560, y: 50, w: 380, h: 230 },
  'South Wing': { x: 60, y: 370, w: 380, h: 220 },
  'East Wing': { x: 560, y: 370, w: 380, h: 220 },
}

const RING: Record<PatientStatus, string> = {
  critical: 'var(--sc-red)',
  warning: 'var(--sc-amber)',
  normal: 'var(--sc-green)',
  offline: 'var(--sc-slate)',
}

export function MapPage() {
  const state = useSim()
  const [selected, setSelected] = useState<string | null>(null)

  // Real facilities may use zone names other than the four wings drawn here: place those in the first wing.
  const wingOf = (zone: string): Zone => (zone in WINGS ? (zone as Zone) : 'North Wing')
  const byZone = new Map<Zone, string[]>()
  for (const p of state.patients) byZone.set(wingOf(p.zone), [...(byZone.get(wingOf(p.zone)) ?? []), p.id])

  const markers = state.patients.map((p) => {
    const wing = WINGS[wingOf(p.zone)]
    const ids = byZone.get(wingOf(p.zone))!
    const i = ids.indexOf(p.id)
    const cols = 3
    const x = wing.x + 70 + (i % cols) * ((wing.w - 140) / (cols - 1))
    const y = wing.y + 110 + Math.floor(i / cols) * 70
    return { p, x, y, status: patientStatus(state, p) }
  })

  const sel = markers.find((m) => m.p.id === selected)
  const counts = (['critical', 'warning', 'normal', 'offline'] as PatientStatus[]).map((s) => ({ s, n: markers.filter((m) => m.status === s).length }))

  const onKey = (id: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setSelected(id)
    }
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {counts.map(({ s, n }) => (
          <span key={s} className="flex items-center gap-2 rounded-md border border-line bg-card px-2.5 py-1.5 text-[12px] font-semibold text-t2">
            <span className="h-3 w-3 rounded-full border-[3px]" style={{ borderColor: RING[s] }} />
            {PATIENT_STATUS_LABEL[s]} <b className="text-t1 tabular-nums">{n}</b>
          </span>
        ))}
        <span className="flex-1" />
        <span className="text-[12px] text-t3">Positions follow room assignments. Band location replaces them once bands report it.</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card overflow-x-auto p-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[640px]" role="group" aria-label="Campus map with patient markers">
            <rect x={0} y={0} width={W} height={H} fill="var(--sc-canvas)" rx={6} />
            <rect x={24} y={20} width={W - 48} height={H - 40} rx={14} fill="none" stroke="var(--sc-hair)" strokeWidth={2} strokeDasharray="10 8" />
            <text x={40} y={H - 30} fontSize={11} fill="var(--sc-t3)" fontWeight={700}>Geofence perimeter</text>
            <path d={`M0 ${H / 2 + 4}H${W}M${W / 2} 0V${H}`} stroke="var(--sc-elev)" strokeWidth={36} />
            <rect x={W / 2 - 70} y={H / 2 - 50} width={140} height={108} rx={16} fill="var(--sc-green-surf)" stroke="var(--sc-border)" />
            <text x={W / 2} y={H / 2 + 8} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--sc-t2)">Courtyard</text>

            {(Object.keys(WINGS) as Zone[]).map((z) => {
              const w = WINGS[z]
              return (
                <g key={z}>
                  <rect x={w.x} y={w.y} width={w.w} height={w.h} rx={10} fill="var(--sc-card)" stroke="var(--sc-border)" strokeWidth={1.5} />
                  <text x={w.x + 18} y={w.y + 32} fontSize={15} fontWeight={800} fill="var(--sc-t1)">{z}</text>
                  <text x={w.x + 18} y={w.y + 52} fontSize={11} fill="var(--sc-t3)">
                    {(byZone.get(z) ?? []).length} patients
                  </text>
                </g>
              )
            })}

            {markers.map(({ p, x, y, status }) => {
              const isSel = p.id === selected
              return (
                <g
                  key={p.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.name}, room ${p.room}, ${PATIENT_STATUS_LABEL[status]}`}
                  aria-pressed={isSel}
                  onClick={() => setSelected(p.id)}
                  onKeyDown={onKey(p.id)}
                  className="cursor-pointer outline-none [&:focus-visible>circle.focus]:stroke-[var(--sc-green)]"
                >
                  {status === 'critical' && (
                    <circle cx={x} cy={y} r={22} fill="none" stroke={RING.critical} strokeWidth={2} className="animate-sc-ping" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
                  )}
                  <circle className="focus" cx={x} cy={y} r={30} fill="transparent" stroke="transparent" strokeWidth={2} />
                  <circle cx={x} cy={y} r={22} fill={isSel ? 'var(--sc-elev)' : 'var(--sc-card)'} stroke={RING[status]} strokeWidth={4} strokeDasharray={status === 'offline' ? '5 4' : undefined} />
                  <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fontWeight={800} fill="var(--sc-t1)">{initials(p.name)}</text>
                  <text x={x} y={y + 42} textAnchor="middle" fontSize={11} fontWeight={700} fill={isSel ? 'var(--sc-t1)' : 'var(--sc-t2)'}>
                    {p.name.split(' ')[0]} · {p.room}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        <aside className="flex flex-col gap-3">
          {sel ? (
            <SelectedPatient patientId={sel.p.id} onClear={() => setSelected(null)} />
          ) : (
            <div className="card flex flex-col items-center gap-2 p-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-surf text-green"><Icon name="pin" size={20} /></span>
              <b className="text-[14px]">Select a patient</b>
              <p className="text-[12px] text-t2">Click a marker, or tab to it and press Enter, to see live vitals and open alerts.</p>
            </div>
          )}
          <ul className="card m-0 list-none divide-y divide-hair p-0">
            {markers
              .slice()
              .sort((a, b) => ['critical', 'warning', 'offline', 'normal'].indexOf(a.status) - ['critical', 'warning', 'offline', 'normal'].indexOf(b.status))
              .map(({ p, status }) => (
                <li key={p.id}>
                  <button type="button" className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-elev ${p.id === selected ? 'bg-elev' : ''}`} onClick={() => setSelected(p.id)}>
                    <Avatar name={p.name} status={status} size={28} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13px] text-t1">{p.name}</b>
                      <span className="text-[11px] text-t3">Room {p.room} • {p.zone}</span>
                    </span>
                    <StatusChip status={status} />
                  </button>
                </li>
              ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}

function SelectedPatient({ patientId, onClear }: { patientId: string; onClear: () => void }) {
  const state = useSim()
  const p = state.patients.find((x) => x.id === patientId)!
  const status = patientStatus(state, p)
  const device = state.devices.find((d) => d.id === p.deviceId)
  const v = state.vitals[p.id]
  const worn = device?.online && device.worn
  const alerts = activeAlertsFor(state, p.id)
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={p.name} status={status} size={40} />
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[15px]">{p.name}</b>
          <span className="text-[12px] text-t3">Room {p.room} • {p.zone}</span>
        </div>
        <button type="button" className="icon-btn h-8 w-8" onClick={onClear} aria-label="Clear selection"><Icon name="x" size={14} /></button>
      </div>
      <StatusChip status={status} />
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'HR', value: worn ? v?.hr : null, unit: 'bpm' },
          { label: 'SpO₂', value: worn ? v?.spo2 : null, unit: '%' },
          { label: 'Battery', value: device?.battery != null ? Math.round(device.battery) : null, unit: '%' },
        ].map((s) => (
          <div key={s.label} className="rounded-md border border-hair bg-elev px-2 py-2">
            <span className="block text-[10px] font-bold text-t3">{s.label}</span>
            <b className="text-[16px] tabular-nums">{s.value ?? '—'}</b> <span className="text-[10px] text-t3">{s.value != null ? s.unit : ''}</span>
          </div>
        ))}
      </div>
      {alerts.map((a) => <AlertCard key={a.id} alert={a} patient={p} compact />)}
      <Link to={`/patients/${p.id}`} className="btn btn-primary btn-sm">Open patient</Link>
    </section>
  )
}
