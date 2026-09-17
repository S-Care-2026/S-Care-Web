import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAppActions } from '../../components/app/actions-context'
import { Sparkline } from '../../components/charts/Sparkline'
import { Icon } from '../../components/Icon'
import { Avatar, EmptyState, StatusChip } from '../../components/ui'
import { patientStatus, useNow, useSim } from '../../data/store'
import { thresholdsFor } from '../../data/simulator'
import { hrLevel, spo2Level, type Level } from '../../lib/thresholds'
import { PATIENT_STATUS_LABEL, timeAgo } from '../../lib/format'
import type { PatientStatus } from '../../lib/types'

const FILTERS: ('all' | PatientStatus)[] = ['all', 'critical', 'warning', 'normal', 'offline']
const ORDER: Record<PatientStatus, number> = { critical: 0, warning: 1, offline: 2, normal: 3 }
const LEVEL_TEXT: Record<Level, string> = { normal: 'text-t1', warning: 'text-amber', critical: 'text-red' }

export function Patients() {
  const state = useSim()
  const now = useNow(5000)
  const navigate = useNavigate()
  const { pairDevice } = useAppActions()
  const [params, setParams] = useSearchParams()
  const filter = (FILTERS as string[]).includes(params.get('status') ?? '') ? (params.get('status') as 'all' | PatientStatus) : 'all'
  const [query, setQuery] = useState('')

  const rows = state.patients
    .map((p) => ({ p, status: patientStatus(state, p), device: state.devices.find((d) => d.id === p.deviceId), t: thresholdsFor(state, p.id) }))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.p.name.localeCompare(b.p.name))
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === 'all' ? rows.length : rows.filter((r) => r.status === f).length]))
  const q = query.trim().toLowerCase()
  const visible = rows.filter(
    (r) =>
      (filter === 'all' || r.status === filter) &&
      (!q || r.p.name.toLowerCase().includes(q) || r.p.room.includes(q) || r.p.zone.toLowerCase().includes(q) || (r.p.deviceId ?? '').toLowerCase().includes(q)),
  )

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-t3" />
          <input id="patient-search" className="input h-9 pl-9" placeholder="Search name, room, wing or band" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search patients" />
        </div>
        <div className="seg" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setParams(f === 'all' ? {} : { status: f }, { replace: true })}
            >
              {f === 'all' ? 'All' : PATIENT_STATUS_LABEL[f]} <span className="tabular-nums opacity-80">{counts[f]}</span>
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <button type="button" className="btn btn-primary" onClick={pairDevice}>
          <Icon name="scan" size={16} />
          Pair band
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="patients" title="No patients match" body="Try another status or clear the search." action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQuery(''); setParams({}) }}>Clear filters</button>} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-elev text-left text-[10px] font-extrabold tracking-[0.8px] text-t3 uppercase">
                <th className="px-4 py-2.5">Patient</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Heart rate</th>
                <th className="px-3 py-2.5 text-right">SpO₂</th>
                <th className="w-[140px] px-3 py-2.5">Last 2 min</th>
                <th className="px-3 py-2.5">Band</th>
                <th className="px-3 py-2.5 text-right">Battery</th>
                <th className="px-4 py-2.5 text-right">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ p, status, device, t }) => {
                const v = state.vitals[p.id]
                const worn = Boolean(device?.online && device.worn)
                const hr = state.buffers[p.id]?.hr.slice(-60).map((s) => s.v) ?? []
                return (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-t border-hair hover:bg-elev"
                    onClick={() => navigate(`/patients/${p.id}`)}
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-3">
                        <Avatar name={p.name} status={status} size={32} />
                        <span>
                          <Link to={`/patients/${p.id}`} className="block font-bold text-t1 no-underline hover:text-green" onClick={(e) => e.stopPropagation()}>
                            {p.name}
                          </Link>
                          <span className="text-[11px] text-t3">Room {p.room} • {p.zone} · {p.age} yrs</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5"><StatusChip status={status} /></td>
                    <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${worn ? LEVEL_TEXT[hrLevel(v?.hr ?? null, t)] : 'text-t3'}`}>
                      {worn ? `${v?.hr} bpm` : '—'}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${worn ? LEVEL_TEXT[spo2Level(v?.spo2 ?? null, t)] : 'text-t3'}`}>
                      {worn ? `${v?.spo2}%` : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block h-6 w-[120px]">
                        {worn && hr.length > 1 ? <Sparkline values={hr} color="var(--sc-hr)" /> : <span className="text-[11px] text-t3">{device?.online ? 'Not worn' : 'No data'}</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-t2">{p.deviceId ?? '—'}</td>
                    <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${device?.battery != null && device.battery <= t.batteryWarn ? 'text-amber' : 'text-t2'}`}>
                      {device?.battery != null ? `${Math.round(device.battery)}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12px] text-t3">
                      {device ? (device.online ? 'Live' : timeAgo(device.lastSeen, now)) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-t3">Status combines band check-ins, live vitals against each patient’s thresholds, and open alerts. Values are colored by threshold and the status column says it in words.</p>
    </div>
  )
}
