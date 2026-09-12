import type { KeyboardEvent } from 'react'
import { useAuth } from '../../auth/context'
import { sim, useNow } from '../../data/store'
import { ALERT_TYPE_LABEL, isActive, timeAgo } from '../../lib/format'
import type { Alert, Patient } from '../../lib/types'
import { Icon } from '../Icon'
import { AlertTypeIcon, SeverityChip } from '../ui'
import { useToast } from '../toast-context'
import { useAppActions } from './actions-context'

export function AlertCard({ alert, patient, compact = false }: { alert: Alert; patient?: Patient; compact?: boolean }) {
  const now = useNow(1000)
  const { openAlert } = useAppActions()
  const { user } = useAuth()
  const toast = useToast()
  const active = isActive(alert.status)
  const muted = !active

  const open = () => openAlert(alert.id)
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open()
    }
  }

  const secondsLeft = alert.countdownEndsAt ? Math.max(0, Math.ceil((alert.countdownEndsAt - now) / 1000)) : 0

  const footer =
    alert.status === 'pending' ? (
      <span className="text-[11px] font-extrabold tracking-[0.3px] text-amber">CONFIRMING · {secondsLeft} S TO CANCEL</span>
    ) : alert.status === 'open' ? (
      <span className={`text-[11px] font-extrabold tracking-[0.3px] ${alert.severity === 'critical' ? 'text-red' : alert.severity === 'warning' ? 'text-amber' : 'text-info'}`}>
        {alert.severity === 'critical' ? 'ACTION REQUIRED' : alert.severity === 'warning' ? 'NEEDS REVIEW' : 'NOTICE'}
      </span>
    ) : alert.status === 'acknowledged' ? (
      <span className="text-[11px] font-extrabold tracking-[0.3px] text-info">ACKNOWLEDGED · {alert.acknowledgedBy?.toUpperCase()}</span>
    ) : alert.status === 'resolved' ? (
      <span className="chip bg-green-surf text-green">
        <Icon name="check" size={11} strokeWidth={3} />
        Resolved
      </span>
    ) : (
      <span className="chip border border-line bg-elev text-t2">Cancelled by wearer</span>
    )

  return (
    <article
      tabIndex={0}
      role="button"
      aria-label={`${ALERT_TYPE_LABEL[alert.type]}, ${patient?.name ?? alert.deviceId}, ${alert.status}`}
      onClick={open}
      onKeyDown={onKey}
      className={`card flex cursor-pointer gap-3 p-3.5 transition-colors hover:bg-elev ${
        active && alert.severity === 'critical' ? 'border-red' : ''
      } ${muted ? 'opacity-80' : ''}`}
    >
      <AlertTypeIcon type={alert.type} severity={alert.severity} muted={muted} size={compact ? 36 : 42} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <b className="min-w-0 flex-1 truncate text-[14px] font-bold">{ALERT_TYPE_LABEL[alert.type]}</b>
          {muted ? <span className="chip bg-slate text-on-slate">{alert.status === 'resolved' ? 'Resolved' : 'Cancelled'}</span> : <SeverityChip severity={alert.severity} />}
        </div>
        <p className="truncate text-[12px] font-semibold text-t2">
          {patient?.name ?? alert.deviceId ?? 'Unknown'} • {alert.locationLabel}
        </p>
        {!compact && <p className="line-clamp-2 text-[12px] leading-[1.45] text-t3">{alert.details}</p>}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-hair pt-2">
          <span className="text-[11px] font-semibold whitespace-nowrap text-t3" title={new Date(alert.occurredAt).toLocaleString()}>
            {timeAgo(alert.occurredAt, now)} · <span className="font-mono">{alert.id}</span>
          </span>
          <span className="ml-auto flex items-center gap-2 whitespace-nowrap">
            {footer}
            {alert.status === 'open' && user && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={(e) => {
                  e.stopPropagation()
                  sim.acknowledge(alert.id, user.name)
                  toast({ tone: 'info', title: `Acknowledged ${alert.id}`, body: `${patient?.name ?? 'Band'} — you’re on it.` })
                }}
              >
                Acknowledge
              </button>
            )}
          </span>
        </div>
      </div>
    </article>
  )
}
