import { useState } from 'react'
import { sim, useSim } from '../../data/store'
import type { Sex, Zone } from '../../lib/types'
import { Icon } from '../Icon'
import { Modal } from '../ui'
import { useToast } from '../toast-context'

const ZONES: Zone[] = ['North Wing', 'West Wing', 'East Wing', 'South Wing']

export function PairDeviceModal({ open, onClose, onPaired }: { open: boolean; onClose: () => void; onPaired: (patientId: string) => void }) {
  return (
    <Modal open={open} onClose={onClose} width={560} title={<span className="text-[16px] font-extrabold">Pair a band</span>}>
      {open && <PairFlow onClose={onClose} onPaired={onPaired} />}
    </Modal>
  )
}

function PairFlow({ onClose, onPaired }: { onClose: () => void; onPaired: (patientId: string) => void }) {
  const state = useSim()
  const toast = useToast()
  const [step, setStep] = useState<'scan' | 'assign'>('scan')
  const [code, setCode] = useState('')
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const unassigned = state.patients.filter((p) => !p.deviceId)
  const [existingId, setExistingId] = useState(unassigned[0]?.id ?? '')
  const [name, setName] = useState('')
  const [age, setAge] = useState(80)
  const [sex, setSex] = useState<Sex>('female')
  const [room, setRoom] = useState('')
  const [zone, setZone] = useState<Zone>('North Wing')
  const [error, setError] = useState<string | null>(null)

  const uid = code.trim().toUpperCase()
  const scanError = !uid
    ? null
    : !/^[A-Z0-9_-]{3,64}$/.test(uid)
      ? 'Band ids use letters, digits, - and _ only.'
      : state.devices.some((d) => d.id === uid)
        ? `${uid} is already registered.`
        : null

  const submit = () => {
    const result = sim.pair({
      deviceId: uid,
      existingPatientId: mode === 'existing' ? existingId : undefined,
      newPatient: mode === 'new' ? { name, age, sex, room, zone } : undefined,
    })
    if ('error' in result) {
      setError(result.error)
      return
    }
    const patient = sim.getState().patients.find((p) => p.id === result.patientId)
    toast({ tone: 'success', title: `${uid} paired`, body: `Now monitoring ${patient?.name}. Contacts sync to the band on its next check-in.` })
    onClose()
    onPaired(result.patientId)
  }

  if (step === 'scan') {
    return (
      <div className="flex flex-col gap-5 p-5">
        <div className="relative mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-xl border border-line bg-elev">
          {['top-3 left-3 border-t-[3px] border-l-[3px]', 'top-3 right-3 border-t-[3px] border-r-[3px]', 'bottom-3 left-3 border-b-[3px] border-l-[3px]', 'right-3 bottom-3 border-r-[3px] border-b-[3px]'].map((c) => (
            <span key={c} className={`absolute h-8 w-8 rounded-sm border-green ${c}`} />
          ))}
          <span className="animate-sc-laser absolute right-6 left-6 h-[2px] bg-green" />
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-t3">
            <Icon name="scan" size={36} />
            <span className="px-8 text-center text-[12px]">Camera preview appears here on a device with a camera</span>
          </span>
        </div>
        <p className="text-center text-[13px] text-t2">Scan the QR code on the back of the band, or enter the id printed under it.</p>
        <div>
          <label className="field-label" htmlFor="pair-code">Band id</label>
          <input
            id="pair-code"
            className="input font-mono uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="SC-DEV-201"
            autoComplete="off"
            aria-invalid={Boolean(scanError)}
            aria-describedby="pair-code-help"
          />
          <p id="pair-code-help" className={`mt-1.5 text-[12px] ${scanError ? 'text-red' : 'text-t3'}`} role={scanError ? 'alert' : undefined}>
            {scanError ?? 'Demo codes:'}
            {!scanError && (
              <>
                {' '}
                {['SC-DEV-201', 'SC-DEV-202', 'SC-DEV-203'].map((c) => (
                  <button key={c} type="button" onClick={() => setCode(c)} className="mr-2 font-mono font-bold text-green hover:underline">
                    {c}
                  </button>
                ))}
              </>
            )}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!uid || Boolean(scanError)} onClick={() => setStep('assign')}>
            Continue
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-5 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex items-center gap-3 rounded-lg border border-green bg-green-surf p-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-green text-on-green">
          <Icon name="check" size={18} strokeWidth={3} />
        </span>
        <div>
          <b className="font-mono text-[14px]">{uid}</b>
          <p className="text-[12px] text-t2">S-Care Band · firmware 2.1.3 · ready to assign</p>
        </div>
      </div>

      <div className="seg self-start" role="group" aria-label="Assign to">
        <button type="button" aria-pressed={mode === 'new'} onClick={() => setMode('new')}>New patient</button>
        <button type="button" aria-pressed={mode === 'existing'} onClick={() => setMode('existing')} disabled={!unassigned.length}>
          Existing patient{unassigned.length ? ` (${unassigned.length})` : ''}
        </button>
      </div>

      {mode === 'existing' ? (
        <div>
          <label className="field-label" htmlFor="pair-existing">Patient without a band</label>
          <select id="pair-existing" className="input" value={existingId} onChange={(e) => setExistingId(e.target.value)}>
            {unassigned.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — Room {p.room} • {p.zone}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="field-label" htmlFor="pair-name">Full name</label>
            <input id="pair-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nguyễn Văn An" required />
          </div>
          <div>
            <label className="field-label" htmlFor="pair-age">Age</label>
            <input id="pair-age" className="input" type="number" min={40} max={120} value={age} onChange={(e) => setAge(Number(e.target.value))} />
          </div>
          <div>
            <label className="field-label" htmlFor="pair-sex">Sex</label>
            <select id="pair-sex" className="input" value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="pair-room">Room</label>
            <input id="pair-room" className="input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="215" required />
          </div>
          <div>
            <label className="field-label" htmlFor="pair-zone">Wing</label>
            <select id="pair-zone" className="input" value={zone} onChange={(e) => setZone(e.target.value as Zone)}>
              {ZONES.map((z) => <option key={z}>{z}</option>)}
            </select>
          </div>
        </div>
      )}

      {error && <p className="rounded-md border border-red bg-red-surf px-3 py-2 text-[13px] text-t1" role="alert">{error}</p>}

      <div className="flex justify-between gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => setStep('scan')}>
          <Icon name="chevron-left" size={16} />
          Back
        </button>
        <button type="submit" className="btn btn-primary">Pair band</button>
      </div>
    </form>
  )
}
