import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/context'
import { sim, useNow, useSim } from '../../data/store'
import { thresholdsFor } from '../../data/simulator'
import { ALERT_TYPE_LABEL, RESOLUTION_LABEL, clock, dateTime, isActive, timeAgo } from '../../lib/format'
import type { Resolution } from '../../lib/types'
import { TimeSeriesPanel } from '../charts/TimeSeriesPanel'
import { Icon, type IconName } from '../Icon'
import { AlertStatusChip, AlertTypeIcon, Avatar, Modal, SeverityChip } from '../ui'
import { useToast } from '../toast-context'

const CHANNEL: Record<string, { icon: IconName; label: string }> = {
  push: { icon: 'bell', label: 'Push' },
  sms: { icon: 'message', label: 'SMS' },
  sms_device: { icon: 'message', label: 'SMS from band' },
}

export function AlertDrawer({ alertId, onClose }: { alertId: string | null; onClose: () => void }) {
  return (
    <Modal open={alertId !== null} onClose={onClose} side width={500} title={<span className="text-[13px] font-bold text-t2">Alert detail</span>}>
      {alertId && <AlertDetail key={alertId} alertId={alertId} onClose={onClose} />}
    </Modal>
  )
}

function AlertDetail({ alertId, onClose }: { alertId: string; onClose: () => void }) {
  const state = useSim()
  const now = useNow(500)
  const { user } = useAuth()
  const toast = useToast()
  const [resolving, setResolving] = useState(false)
  const [resolution, setResolution] = useState<Resolution>('assisted')
  const [notes, setNotes] = useState('')

  const alert = state.alerts.find((a) => a.id === alertId)
  if (!alert) return <p className="p-5 text-t2">This alert no longer exists.</p>

  const patient = state.patients.find((p) => p.id === alert.patientId)
  const device = state.devices.find((d) => d.id === alert.deviceId)
  const buffer = patient ? state.buffers[patient.id] : undefined
  const t = patient ? thresholdsFor(state, patient.id) : null
  const active = isActive(alert.status)
  const remaining = alert.countdownEndsAt ? Math.max(0, alert.countdownEndsAt - now) : 0

  const doAck = () => {
    if (!user) return
    sim.acknowledge(alert.id, user.name)
    toast({ tone: 'info', title: `Acknowledged ${alert.id}`, body: 'The team can see you’re responding.' })
  }
  const doResolve = () => {
    if (!user) return
    if (resolution === 'false_alarm' && !notes.trim()) {
      toast({ tone: 'warning', title: 'Add a note for false alarms', body: 'Say what triggered it — it’s used to tune detection.' })
      return
    }
    sim.resolve(alert.id, user.name, resolution, notes.trim())
    toast({ tone: 'success', title: `Resolved ${alert.id}`, body: RESOLUTION_LABEL[resolution] })
    setResolving(false)
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-start gap-3">
          <AlertTypeIcon type={alert.type} severity={alert.severity} muted={!active} size={46} />
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[20px] font-extrabold tracking-[-0.4px]">{ALERT_TYPE_LABEL[alert.type]}</h2>
            <p className="mt-0.5 font-mono text-[12px] text-t3">
              {alert.id} · {alert.source === 'device' ? 'from the band' : alert.source === 'rules' ? 'vitals rule' : alert.source === 'system' ? 'system check' : 'raised manually'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <SeverityChip severity={alert.severity} />
              <AlertStatusChip status={alert.status} />
            </div>
          </div>
        </div>

        {alert.status === 'pending' && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber bg-amber-surf p-4">
            <div className="flex items-center justify-between gap-3">
              <b className="text-[14px] text-t1">Waiting for the wearer to cancel</b>
              <span className="font-mono text-[20px] font-bold text-amber tabular-nums">{Math.ceil(remaining / 1000)} s</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-card" role="progressbar" aria-valuemin={0} aria-valuemax={15} aria-valuenow={Math.ceil(remaining / 1000)} aria-label="Cancel window remaining">
              <div className="h-full bg-amber transition-[width] duration-500" style={{ width: `${(remaining / 15000) * 100}%` }} />
            </div>
            <p className="text-[12px] text-t2">The band beeps for 15 s. If nobody presses Cancel, the alert opens and caregivers are notified.</p>
            <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => sim.cancelPending(alert.id)}>
              Simulate: wearer presses Cancel
            </button>
          </div>
        )}

        <div className="card flex items-center gap-3 p-3">
          {patient ? <Avatar name={patient.name} size={40} /> : <span className="icon-btn"><Icon name="watch" size={18} /></span>}
          <div className="min-w-0 flex-1">
            {patient ? (
              <Link to={`/patients/${patient.id}`} onClick={onClose} className="text-[14px] font-bold text-t1 hover:text-green">
                {patient.name}
              </Link>
            ) : (
              <b className="text-[14px]">Unassigned band</b>
            )}
            <p className="text-[12px] text-t3">
              {alert.locationLabel} · <span className="font-mono">{alert.deviceId ?? 'no band'}</span>
            </p>
          </div>
          {device && (
            <span className="text-right text-[11px] text-t3">
              {device.online ? 'Online' : 'Offline'}
              <br />
              {Math.round(device.battery)}% battery
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Heart rate', value: alert.hrSnapshot, unit: 'bpm' },
            { label: 'SpO₂', value: alert.spo2Snapshot, unit: '%' },
            alert.impactG !== undefined ? { label: 'Impact', value: alert.impactG, unit: 'g' } : { label: 'Raised', value: clock(alert.occurredAt), unit: '' },
          ].map((s) => (
            <div key={s.label} className="rounded-[5px] border border-line bg-card px-3 py-2">
              <p className="text-[10px] font-bold tracking-[0.4px] text-t3 uppercase">{s.label}</p>
              <p className="mt-1 text-[18px] font-extrabold tracking-[-0.4px]">
                {s.value ?? '—'} <span className="text-[11px] font-bold text-t3">{s.value != null ? s.unit : ''}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-t3">Snapshot at {dateTime(alert.occurredAt)} ({timeAgo(alert.occurredAt, now)})</p>

        <p className="text-[14px] leading-relaxed text-t2">{alert.details}</p>

        {buffer && buffer.hr.length > 1 && t && active && (
          <TimeSeriesPanel
            title="Heart rate — now"
            unit="bpm"
            color="var(--sc-hr)"
            fill="var(--sc-hr-fill)"
            points={buffer.hr.slice(-60)}
            thresholds={[
              { value: t.hrWarnHigh, tone: 'warning', label: 'Warn high' },
              { value: t.hrCritHigh, tone: 'critical', label: 'Critical high' },
            ]}
            softMin={50}
            timeFormat="seconds"
            live
            height={110}
          />
        )}

        <section>
          <h3 className="mb-2 text-[11px] font-extrabold tracking-[0.9px] text-t3 uppercase">Timeline</h3>
          <ol className="m-0 flex list-none flex-col gap-0 p-0">
            {alert.events.map((e, i) => (
              <li key={i} className="grid grid-cols-[62px_14px_minmax(0,1fr)] gap-2 pb-3">
                <span className="font-mono text-[11px] text-t3 tabular-nums">{clock(e.at, true)}</span>
                <span className="relative flex justify-center">
                  <span className={`mt-1 h-2 w-2 rounded-full ${e.kind === 'resolved' ? 'bg-green' : e.kind === 'cancelled' ? 'bg-slate' : e.kind === 'escalated' ? 'bg-red' : e.kind === 'acknowledged' ? 'bg-info' : 'bg-t3'}`} />
                  {i < alert.events.length - 1 && <span className="absolute top-3.5 bottom-[-12px] w-px bg-hair" />}
                </span>
                <span className="text-[13px] text-t2">
                  {e.text}
                  {e.by && <span className="text-t3"> · {e.by}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {alert.notifications.length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] font-extrabold tracking-[0.9px] text-t3 uppercase">Notifications</h3>
            <ul className="card m-0 list-none divide-y divide-hair p-0">
              {alert.notifications.map((n, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                  <Icon name={CHANNEL[n.channel].icon} size={14} className="flex-none text-t3" />
                  <span className="w-[92px] flex-none font-semibold text-t2">{CHANNEL[n.channel].label}</span>
                  <span className="min-w-0 flex-1 truncate text-t1">{n.to}</span>
                  <span className={`chip ${n.status === 'delivered' ? 'bg-green-surf text-green' : n.status === 'failed' ? 'bg-red text-on-red' : 'border border-line bg-elev text-t2'}`}>{n.status}</span>
                </li>
              ))}
            </ul>
            {alert.smsSentByDevice && <p className="mt-2 text-[11px] text-t3">SMS from band: sent directly over the band’s SIM, so it works even when Wi-Fi is down.</p>}
          </section>
        )}

        {alert.status === 'resolved' && (
          <section className="rounded-lg border border-green bg-green-surf p-4">
            <p className="flex items-center gap-2 text-[14px] font-bold text-t1">
              <Icon name="check" size={16} className="text-green" strokeWidth={3} />
              {alert.resolution ? RESOLUTION_LABEL[alert.resolution] : 'Resolved'}
            </p>
            <p className="mt-1 text-[12px] text-t2">
              {alert.resolvedBy} · {alert.resolvedAt ? dateTime(alert.resolvedAt) : ''}
            </p>
            {alert.resolutionNotes && <p className="mt-2 text-[13px] text-t1">“{alert.resolutionNotes}”</p>}
          </section>
        )}
      </div>

      {(alert.status === 'open' || alert.status === 'acknowledged') && (
        <div className="sticky bottom-0 mt-auto border-t border-line bg-card p-4">
          {resolving ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                doResolve()
              }}
            >
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="field-label">Outcome</legend>
                {(Object.keys(RESOLUTION_LABEL) as Resolution[]).map((r) => (
                  <label key={r} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-[13px] font-semibold ${resolution === r ? 'border-green bg-green-surf text-t1' : 'border-line text-t2'}`}>
                    <input type="radio" name={`resolution-${alert.id}`} id={`resolution-${alert.id}-${r}`} value={r} checked={resolution === r} onChange={() => setResolution(r)} className="accent-[var(--sc-green)]" />
                    {RESOLUTION_LABEL[r]}
                  </label>
                ))}
              </fieldset>
              <div>
                <label className="field-label" htmlFor={`notes-${alert.id}`}>
                  Notes {resolution === 'false_alarm' ? '(required)' : '(optional)'}
                </label>
                <textarea id={`notes-${alert.id}`} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened, and what did you do?" />
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost flex-1" onClick={() => setResolving(false)}>
                  Back
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  <Icon name="check" size={16} strokeWidth={2.6} />
                  Resolve alert
                </button>
              </div>
            </form>
          ) : (
            <div className="flex gap-2">
              {alert.status === 'open' && (
                <button type="button" className="btn btn-outline flex-1" onClick={doAck}>
                  Acknowledge
                </button>
              )}
              <button type="button" className="btn btn-primary flex-1" onClick={() => setResolving(true)}>
                Resolve…
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
