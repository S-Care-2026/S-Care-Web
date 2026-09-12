import { useState } from 'react'
import { sim, useSim } from '../../data/store'
import { ALERT_TYPE_LABEL } from '../../lib/format'
import type { AlertType } from '../../lib/types'
import { ALERT_ICON } from '../alert-icons'
import { Icon } from '../Icon'
import { Modal } from '../ui'
import { useToast } from '../toast-context'

const TYPES: { type: AlertType; hint: string }[] = [
  { type: 'fall', hint: 'Starts the band’s 15 s cancel countdown, then opens and texts contacts.' },
  { type: 'sos', hint: 'Opens immediately; the band also texts emergency contacts over its SIM.' },
  { type: 'tachycardia', hint: 'A heart-rate warning, raised manually.' },
  { type: 'bradycardia', hint: 'A low heart-rate warning, raised manually.' },
  { type: 'hypoxemia', hint: 'A low SpO₂ warning, raised manually.' },
  { type: 'low_battery', hint: 'A battery notice for this patient’s band.' },
  { type: 'offline', hint: 'Marks the band as missing its check-ins.' },
]

export function SimulateAlertModal({
  open,
  initialPatientId,
  onClose,
  onCreated,
}: {
  open: boolean
  initialPatientId?: string
  onClose: () => void
  onCreated: (alertId: string) => void
}) {
  return (
    <Modal open={open} onClose={onClose} width={560} title={<span className="text-[16px] font-extrabold">Simulate an alert</span>}>
      {open && <SimulateForm key={initialPatientId ?? 'any'} initialPatientId={initialPatientId} onClose={onClose} onCreated={onCreated} />}
    </Modal>
  )
}

function SimulateForm({ initialPatientId, onClose, onCreated }: { initialPatientId?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const state = useSim()
  const toast = useToast()
  const candidates = state.patients.filter((p) => p.deviceId)
  const [patientId, setPatientId] = useState(initialPatientId ?? candidates[0]?.id ?? '')
  const [type, setType] = useState<AlertType>('fall')
  const [notes, setNotes] = useState('')

  const submit = () => {
    if (!patientId) return
    const { alert, duplicate } = sim.trigger(patientId, type, notes.trim())
    const name = state.patients.find((p) => p.id === patientId)?.name ?? 'Patient'
    if (duplicate) {
      toast({ tone: 'info', title: `${ALERT_TYPE_LABEL[type]} is already active for ${name}`, body: `No duplicate raised — see ${alert.id}.` })
    } else {
      toast({
        tone: type === 'fall' ? 'warning' : alert.severity === 'critical' ? 'critical' : 'info',
        title: type === 'fall' ? `Fall detected — ${name}` : `${ALERT_TYPE_LABEL[type]} raised — ${name}`,
        body: type === 'fall' ? 'Countdown started. It opens in 15 s unless cancelled.' : alert.id,
      })
    }
    onClose()
    onCreated(alert.id)
  }

  return (
    <form
      className="flex flex-col gap-5 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <p className="text-[13px] text-t2">No bands are connected yet, so this raises the alert the way the backend would — including deduplication, notifications and the fall countdown.</p>
      <div>
        <label className="field-label" htmlFor="sim-patient">Patient</label>
        <select id="sim-patient" className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — Room {p.room} • {p.zone} ({p.deviceId})
            </option>
          ))}
        </select>
      </div>
      <fieldset className="m-0 border-0 p-0">
        <legend className="field-label">Alert type</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TYPES.map(({ type: ty }) => (
            <label
              key={ty}
              className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center text-[12px] font-bold ${
                type === ty ? 'border-green bg-green-surf text-t1' : 'border-line bg-card text-t2 hover:bg-elev'
              }`}
            >
              <input type="radio" name="sim-type" id={`sim-type-${ty}`} value={ty} checked={type === ty} onChange={() => setType(ty)} className="sr-only" />
              <Icon name={ALERT_ICON[ty]} size={20} />
              {ALERT_TYPE_LABEL[ty]}
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-t3">{TYPES.find((x) => x.type === type)?.hint}</p>
      </fieldset>
      <div>
        <label className="field-label" htmlFor="sim-notes">Details (optional)</label>
        <textarea id="sim-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Found sitting on the bathroom floor" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-danger" disabled={!patientId}>
          <Icon name="bell" size={16} />
          Raise alert
        </button>
      </div>
    </form>
  )
}
