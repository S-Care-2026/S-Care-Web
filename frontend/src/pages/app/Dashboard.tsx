import { Link } from 'react-router'
import { AlertCard } from '../../components/app/AlertCard'
import { useAppActions } from '../../components/app/actions-context'
import { Sparkline } from '../../components/charts/Sparkline'
import { Icon, type IconName } from '../../components/Icon'
import { Avatar, LivePill, SectionHeader, StatusChip } from '../../components/ui'
import { patientStatus, sortAlerts, useNow, useSim } from '../../data/store'
import { ALERT_TYPE_LABEL, isActive, timeAgo } from '../../lib/format'
import type { PatientStatus } from '../../lib/types'

const STATUS_ORDER: Record<PatientStatus, number> = { critical: 0, warning: 1, offline: 2, normal: 3 }

export function Dashboard() {
  const state = useSim()
  const now = useNow(1000)
  const { openAlert, pairDevice, simulateAlert } = useAppActions()

  const rows = state.patients
    .map((p) => ({ patient: p, status: patientStatus(state, p), device: state.devices.find((d) => d.id === p.deviceId) }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.patient.name.localeCompare(b.patient.name))

  const active = sortAlerts(state.alerts.filter((a) => isActive(a.status)))
  const headline = active.find((a) => a.severity === 'critical')
  const headlinePatient = state.patients.find((p) => p.id === headline?.patientId)
  const online = state.devices.filter((d) => d.online)
  const reporting = rows.filter((r) => r.device?.online && r.device.worn)
  const avg = (vals: (number | null | undefined)[]) => {
    const v = vals.filter((x): x is number => typeof x === 'number')
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
  }
  const count = (s: PatientStatus) => rows.filter((r) => r.status === s).length

  const kpis: { label: string; value: number; sub: string; icon: IconName; tone: string; valueTone?: string }[] = [
    { label: 'Active Patients', value: state.patients.length, sub: `${online.length} bands online`, icon: 'patients', tone: 'bg-info text-on-info' },
    { label: 'Active Alerts', value: active.length, sub: `${active.filter((a) => a.severity === 'critical').length} critical attention`, icon: 'bell', tone: 'bg-red text-on-red', valueTone: 'text-red' },
    { label: 'Normal Status', value: count('normal'), sub: 'Stable vital signs', icon: 'check', tone: 'bg-green text-on-green', valueTone: 'text-green' },
    { label: 'Anomalies', value: count('warning') + count('critical'), sub: `${count('offline')} offline`, icon: 'warning', tone: 'bg-amber text-on-amber', valueTone: 'text-amber' },
  ]

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      {headline && (
        <button
          type="button"
          onClick={() => openAlert(headline.id)}
          className="flex items-center gap-3.5 rounded-lg border border-red bg-red-surf px-4 py-3.5 text-left hover:brightness-110"
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-red text-on-red">
            <Icon name="warning" size={19} strokeWidth={2.2} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-baseline gap-2.5">
              <b className="text-[12px] font-extrabold tracking-[0.5px] text-red uppercase">
                {headline.status === 'pending' ? 'Possible fall — confirming' : ALERT_TYPE_LABEL[headline.type]}
              </b>
              <span className="text-[11px] font-semibold text-t2">{timeAgo(headline.occurredAt, now)}</span>
            </span>
            <span className="truncate text-[13px] font-bold text-t1">
              {headlinePatient?.name ?? headline.deviceId} ({headline.locationLabel})
            </span>
            <span className="truncate text-[12px] text-t2">{headline.details}</span>
          </span>
          <span className="btn btn-danger btn-sm hidden sm:inline-flex">View alert</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-t2">{k.label}</span>
              <span className={`flex h-7 w-7 items-center justify-center rounded-md ${k.tone}`}>
                <Icon name={k.icon} size={15} strokeWidth={2.2} />
              </span>
            </div>
            <b className={`text-[28px] leading-none font-extrabold tracking-[-1px] ${k.valueTone ?? 'text-t1'}`}>{k.value}</b>
            <span className="text-[11px] font-medium text-t3">{k.sub}</span>
          </div>
        ))}
      </div>

      <section className="card flex flex-col gap-3.5 p-4" aria-label="Ward averages">
        <div className="flex items-center justify-between">
          <b className="text-[14px]">Live vital telemetry — ward average</b>
          <LivePill running={state.running} label="LIVE STREAM" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'AVG HEART RATE', value: avg(reporting.map((r) => state.vitals[r.patient.id]?.hr)), unit: 'bpm', icon: 'heart' as IconName, border: 'border-hr', chip: 'bg-hr text-on-red' },
            { label: 'AVG SpO₂', value: avg(reporting.map((r) => state.vitals[r.patient.id]?.spo2)), unit: '%', icon: 'drop' as IconName, border: 'border-spo2', chip: 'bg-spo2 text-on-info' },
            { label: 'BANDS REPORTING', value: reporting.length, unit: `/ ${state.devices.length}`, icon: 'watch' as IconName, border: 'border-green', chip: 'bg-green text-on-green' },
            { label: 'AVG BATTERY', value: avg(online.map((d) => d.battery)), unit: '%', icon: 'battery' as IconName, border: 'border-info', chip: 'bg-info text-on-info' },
          ].map((v) => (
            <div key={v.label} className={`flex items-center gap-2.5 rounded-md border-l-[3px] bg-elev p-3 ${v.border}`}>
              <span className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-md ${v.chip}`}>
                <Icon name={v.icon} size={16} strokeWidth={2.2} />
              </span>
              <span>
                <span className="block text-[10px] font-bold tracking-[0.2px] text-t3">{v.label}</span>
                <b className="text-[17px] font-extrabold tracking-[-0.4px] text-t1 tabular-nums">
                  {v.value ?? '—'} <span className="text-[11px] font-semibold text-t3">{v.unit}</span>
                </b>
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex flex-col gap-2.5">
          <SectionHeader
            title="Monitored Patients"
            count={rows.length}
            action={<Link to="/patients" className="flex items-center gap-0.5 text-[12px] font-bold no-underline">View all<Icon name="chevron-right" size={14} strokeWidth={2.6} /></Link>}
          />
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {rows.map(({ patient: p, status, device }) => {
              const v = state.vitals[p.id]
              const hr = state.buffers[p.id]?.hr.slice(-60).map((s) => s.v) ?? []
              const worn = device?.online && device.worn
              return (
                <Link
                  key={p.id}
                  to={`/patients/${p.id}`}
                  className={`card flex flex-col gap-2.5 p-3.5 text-t1 no-underline hover:bg-elev hover:text-t1 ${status === 'critical' ? 'border-red' : ''}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <Avatar name={p.name} status={status} />
                    <StatusChip status={status} />
                  </span>
                  <span>
                    <b className="block text-[14px] leading-tight font-bold">{p.name}</b>
                    <span className="text-[11px] font-medium text-t3">Room {p.room} • {p.zone}</span>
                  </span>
                  <span className="block h-7">
                    {worn && hr.length > 1 ? (
                      <Sparkline values={hr} color="var(--sc-hr)" />
                    ) : (
                      <span className="flex h-full items-center text-[11px] text-t3">
                        {!device ? 'No band paired' : !device.online ? `Offline · last seen ${timeAgo(device.lastSeen, now)}` : 'Band not worn'}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center justify-between gap-1.5 border-t border-hair pt-2.5 text-[13px] font-bold tabular-nums">
                    <span className="flex items-center gap-1"><Icon name="heart" size={12} className="text-hr" />{worn ? v?.hr : '—'}<u className="text-[10px] font-semibold text-t3 no-underline">bpm</u></span>
                    <span className="flex items-center gap-1"><Icon name="drop" size={12} className="text-spo2" />{worn ? v?.spo2 : '—'}<u className="text-[10px] font-semibold text-t3 no-underline">%</u></span>
                    <span className="flex items-center gap-1"><Icon name="battery" size={12} className="text-t3" />{device ? Math.round(device.battery) : '—'}<u className="text-[10px] font-semibold text-t3 no-underline">%</u></span>
                  </span>
                </Link>
              )
            })}
          </div>
        </section>

        <aside className="flex flex-col gap-5">
          <section className="flex flex-col gap-2.5">
            <SectionHeader
              title="Needs attention"
              count={active.length}
              action={<Link to="/alerts" className="flex items-center gap-0.5 text-[12px] font-bold no-underline">All alerts<Icon name="chevron-right" size={14} strokeWidth={2.6} /></Link>}
            />
            {active.length === 0 ? (
              <div className="card flex items-center gap-3 p-4 text-[13px] text-t2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-green text-on-green"><Icon name="check" size={16} strokeWidth={3} /></span>
                All clear — no active alerts.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {active.slice(0, 4).map((a) => (
                  <AlertCard key={a.id} alert={a} patient={state.patients.find((p) => p.id === a.patientId)} compact />
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader title="Quick Actions" />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="btn btn-outline h-[46px]" onClick={pairDevice}>
                <Icon name="scan" size={17} />
                Pair Device
              </button>
              <button type="button" className="btn btn-danger h-[46px]" onClick={() => simulateAlert()}>
                <Icon name="bell" size={17} />
                Simulate Alert
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
