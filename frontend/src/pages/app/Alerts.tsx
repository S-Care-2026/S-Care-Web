import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { AlertCard } from '../../components/app/AlertCard'
import { useAppActions } from '../../components/app/actions-context'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/ui'
import { sortAlerts, useSim } from '../../data/store'
import { ALERT_TYPE_LABEL, SEVERITY_LABEL, alertRef, isActive } from '../../lib/format'
import type { Alert, AlertType, Severity } from '../../lib/types'

type StatusTab = 'active' | 'resolved' | 'cancelled' | 'all'
const TABS: { key: StatusTab; label: string; match: (a: Alert) => boolean }[] = [
  { key: 'active', label: 'Active', match: (a) => isActive(a.status) },
  { key: 'resolved', label: 'Resolved', match: (a) => a.status === 'resolved' },
  { key: 'cancelled', label: 'Cancelled', match: (a) => a.status === 'cancelled' },
  { key: 'all', label: 'All', match: () => true },
]
const SEVERITIES: ('all' | Severity)[] = ['all', 'critical', 'warning', 'info']

export function Alerts() {
  const state = useSim()
  const { simulateAlert } = useAppActions()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.key === params.get('status'))?.key ?? 'active') as StatusTab
  const [severity, setSeverity] = useState<'all' | Severity>('all')
  const [type, setType] = useState<'all' | AlertType>('all')
  const [query, setQuery] = useState('')

  const nameOf = (a: Alert) => state.patients.find((p) => p.id === a.patientId)?.name ?? ''
  const q = query.trim().toLowerCase()
  const inTab = state.alerts.filter(TABS.find((t) => t.key === tab)!.match)
  const visible = sortAlerts(
    inTab.filter(
      (a) =>
        (severity === 'all' || a.severity === severity) &&
        (type === 'all' || a.type === type) &&
        (!q || nameOf(a).toLowerCase().includes(q) || alertRef(a.id).toLowerCase().includes(q) || a.locationLabel.toLowerCase().includes(q)),
    ),
  )
  const active = state.alerts.filter((a) => isActive(a.status))
  const filtered = severity !== 'all' || type !== 'all' || q

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="seg" role="tablist" aria-label="Alert status">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              aria-pressed={tab === t.key}
              onClick={() => setParams(t.key === 'active' ? {} : { status: t.key }, { replace: true })}
            >
              {t.label} <span className="tabular-nums opacity-80">{state.alerts.filter(t.match).length}</span>
            </button>
          ))}
        </div>
        {active.length > 0 && (
          <span className="chip bg-red text-on-red">{active.filter((a) => a.severity === 'critical').length} critical</span>
        )}
        <span className="flex-1" />
        <button type="button" className="btn btn-danger" onClick={() => simulateAlert()}>
          <Icon name="bell" size={16} />
          Simulate alert
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1 sm:max-w-[300px]">
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-t3" />
          <input id="alert-search" className="input h-9 pl-9" placeholder="Search patient, room or alert id" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search alerts" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Severity">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={severity === s}
              onClick={() => setSeverity(s)}
              className={`h-8 rounded-md border px-3 text-[12px] font-bold ${severity === s ? 'border-green bg-green text-on-green' : 'border-line bg-card text-t2 hover:bg-elev'}`}
            >
              {s === 'all' ? 'Any severity' : SEVERITY_LABEL[s]}
            </button>
          ))}
        </div>
        <select id="alert-type" className="input h-8 w-auto py-0 text-[12px]" value={type} onChange={(e) => setType(e.target.value as 'all' | AlertType)} aria-label="Alert type">
          <option value="all">Any type</option>
          {(Object.keys(ALERT_TYPE_LABEL) as AlertType[]).map((t) => (
            <option key={t} value={t}>{ALERT_TYPE_LABEL[t]}</option>
          ))}
        </select>
        {filtered && (
          <button type="button" className="text-[12px] font-bold text-green hover:underline" onClick={() => { setSeverity('all'); setType('all'); setQuery('') }}>
            Clear filters
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        tab === 'active' && !filtered ? (
          <EmptyState icon="check" title="All clear" body="No active alerts on the ward. New falls, SOS presses and vitals warnings appear here the moment they’re raised." action={<button type="button" className="btn btn-outline btn-sm" onClick={() => simulateAlert()}>Simulate an alert</button>} />
        ) : (
          <EmptyState icon="filter" title="No alerts match" body="Try a different status, severity or type." />
        )
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((a) => (
            <AlertCard key={a.id} alert={a} patient={state.patients.find((p) => p.id === a.patientId)} />
          ))}
        </div>
      )}
    </div>
  )
}
