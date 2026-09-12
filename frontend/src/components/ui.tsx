import { useEffect, useRef, type ReactNode } from 'react'
import { ALERT_ICON } from './alert-icons'
import { Icon, type IconName } from './Icon'
import { ALERT_TYPE_LABEL, PATIENT_STATUS_LABEL, SEVERITY_LABEL, STATUS_LABEL, initials } from '../lib/format'
import type { AlertStatus, AlertType, PatientStatus, Severity } from '../lib/types'

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex flex-none items-center justify-center bg-green text-on-green"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}
    >
      <Icon name="heart" size={Math.round(size * 0.55)} strokeWidth={2.3} />
    </span>
  )
}

export function Brand({ size = 36, subtitle }: { size?: number; subtitle?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={size} />
      <span className="flex flex-col leading-tight">
        <b className="text-[18px] font-extrabold tracking-[-0.4px] text-t1">S-Care</b>
        {subtitle && <span className="text-[11px] font-medium text-t3">{subtitle}</span>}
      </span>
    </span>
  )
}

const TONE: Record<string, string> = {
  critical: 'bg-red text-on-red',
  warning: 'bg-amber text-on-amber',
  info: 'bg-info text-on-info',
  normal: 'bg-green text-on-green',
  offline: 'bg-slate text-on-slate',
  resolved: 'bg-green-surf text-green',
  cancelled: 'bg-elev text-t2 border border-line',
}

const STATUS_ICON: Record<PatientStatus, IconName> = {
  normal: 'check',
  warning: 'warning',
  critical: 'alert',
  offline: 'offline',
}

export function StatusChip({ status }: { status: PatientStatus }) {
  return (
    <span className={`chip ${TONE[status]}`}>
      <Icon name={STATUS_ICON[status]} size={11} strokeWidth={3} />
      {PATIENT_STATUS_LABEL[status]}
    </span>
  )
}

export function SeverityChip({ severity }: { severity: Severity }) {
  return <span className={`chip ${TONE[severity]}`}>{SEVERITY_LABEL[severity]}</span>
}

export function AlertStatusChip({ status }: { status: AlertStatus }) {
  const tone =
    status === 'resolved' ? TONE.resolved
      : status === 'cancelled' ? TONE.cancelled
        : status === 'pending' ? TONE.warning
          : status === 'acknowledged' ? 'bg-info-surf text-info border border-info'
            : 'bg-red-surf text-red border border-red'
  return (
    <span className={`chip ${tone}`}>
      {status === 'resolved' && <Icon name="check" size={11} strokeWidth={3} />}
      {STATUS_LABEL[status]}
    </span>
  )
}

export function AlertTypeIcon({ type, severity, muted, size = 40 }: { type: AlertType; severity: Severity; muted?: boolean; size?: number }) {
  const tone = muted ? TONE.offline : TONE[severity]
  return (
    <span className={`inline-flex flex-none items-center justify-center rounded-md ${tone}`} style={{ width: size, height: size }} title={ALERT_TYPE_LABEL[type]}>
      <Icon name={ALERT_ICON[type]} size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </span>
  )
}

export function Avatar({ name, status = 'normal', size = 34 }: { name: string; status?: PatientStatus; size?: number }) {
  const tone =
    status === 'critical' ? 'bg-red-surf border-red text-red'
      : status === 'warning' ? 'bg-amber-surf border-amber text-amber'
        : status === 'offline' ? 'bg-elev border-slate text-slate'
          : 'bg-green-surf border-green text-green'
  return (
    <span
      className={`inline-flex flex-none items-center justify-center rounded-md border font-extrabold ${tone}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}

export function LivePill({ running = true, label = 'LIVE' }: { running?: boolean; label?: string }) {
  return running ? (
    <span className="chip bg-green text-on-green">
      <span className="relative inline-flex h-[7px] w-[7px]">
        <span className="animate-sc-ping absolute inset-0 rounded-full bg-on-green" />
        <span className="relative h-[7px] w-[7px] rounded-full bg-on-green" />
      </span>
      {label}
    </span>
  ) : (
    <span className="chip bg-slate text-on-slate">
      <Icon name="pause" size={10} strokeWidth={3} />
      PAUSED
    </span>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  side = false,
  width = 520,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  side?: boolean
  width?: number
  labelledBy?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-labelledby={labelledBy}
      className={`sc-dialog m-0 max-h-none max-w-none border-line bg-canvas p-0 text-t1 ${
        side
          ? 'ml-auto h-dvh w-full border-l sm:w-[var(--w)]'
          : 'mx-auto my-auto h-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] rounded-xl border sm:w-[var(--w)]'
      }`}
      style={{ ['--w' as string]: `${width}px` }}
    >
      {open && (
        <div className="flex h-full flex-col">
          {title !== undefined && (
            <div className="flex items-center gap-3 border-b border-line bg-card px-5 py-4">
              <div className="min-w-0 flex-1">{title}</div>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
                <Icon name="x" size={16} />
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      )}
    </dialog>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-surf text-green">
        <Icon name={icon} size={22} />
      </span>
      <b className="text-[15px]">{title}</b>
      {body && <p className="max-w-[46ch] text-[13px] text-t2">{body}</p>}
      {action}
    </div>
  )
}

export function SectionHeader({ title, action, count }: { title: string; action?: ReactNode; count?: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="m-0 flex items-center gap-2 text-[15px] font-bold">
        {title}
        {count !== undefined && <span className="rounded bg-elev px-1.5 text-[11px] font-bold text-t2 tabular-nums">{count}</span>}
      </h2>
      {action}
    </div>
  )
}
