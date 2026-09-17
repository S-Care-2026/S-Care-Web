import { lazy, Suspense, useState } from 'react'
import { parsePairingText, type PairingCode } from '../../data/pairing'
import { sim, useSim } from '../../data/store'
import type { Sex, Zone } from '../../lib/types'
import { Icon } from '../Icon'
import { Modal } from '../ui'
import { useToast } from '../toast-context'

// The QR decoder is only downloaded when someone opens the camera.
const QrScanner = lazy(() => import('./QrScanner').then((m) => ({ default: m.QrScanner })))

const WINGS: Zone[] = ['North Wing', 'West Wing', 'East Wing', 'South Wing']
const UID_PATTERN = /^[A-Z0-9_-]{3,64}$/

export function PairDeviceModal({
  open,
  initial,
  onClose,
  onPaired,
}: {
  open: boolean
  /** Filled in from a scanned label link (/pair?d=…&c=…). */
  initial?: PairingCode
  onClose: () => void
  onPaired: (patientId: string) => void
}) {
  return (
    <Modal open={open} onClose={onClose} width={560} title={<span className="text-[16px] font-extrabold">Pair a band</span>}>
      {open && <PairFlow key={initial?.deviceId ?? 'blank'} initial={initial} onClose={onClose} onPaired={onPaired} />}
    </Modal>
  )
}

function PairFlow({ initial, onClose, onPaired }: { initial?: PairingCode; onClose: () => void; onPaired: (patientId: string) => void }) {
  const state = useSim()
  const toast = useToast()
  const live = sim.kind === 'live'

  const [step, setStep] = useState<'scan' | 'assign'>('scan')
  const [scanning, setScanning] = useState(false)
  const [uidInput, setUidInput] = useState(initial?.deviceId ?? '')
  const [claimCode, setClaimCode] = useState(initial?.claimCode ?? '')
  const [scanNote, setScanNote] = useState<string | null>(initial ? 'Filled in from the band’s QR label.' : null)

  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const unassigned = state.patients.filter((p) => !p.deviceId)
  const [existingId, setExistingId] = useState(unassigned[0]?.id ?? '')
  const [name, setName] = useState('')
  const [age, setAge] = useState(80)
  const [sex, setSex] = useState<Sex>('female')
  const [room, setRoom] = useState('')
  const [zone, setZone] = useState<string>(live ? '' : 'North Wing')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const uid = uidInput.trim().toUpperCase()
  const known = state.devices.find((d) => d.id === uid)
  // A band this facility already owns (unpaired earlier) doesn't need its code again.
  const needsCode = live && !known
  const scanError = !uid
    ? null
    : !UID_PATTERN.test(uid)
      ? 'Band IDs use letters, digits, - and _ only.'
      : known?.patientId
        ? `${uid} is already paired${state.patients.find((p) => p.id === known.patientId) ? ` with ${state.patients.find((p) => p.id === known.patientId)!.name}` : ''}. Unpair it first.`
        : !live && known
          ? `${uid} is already registered.`
          : null
  const zoneOptions = [...new Set(state.patients.map((p): string => p.zone).filter((z) => z && z !== '—'))]

  const applyScanned = (text: string) => {
    setScanning(false)
    const parsed = parsePairingText(text)
    if (!parsed) {
      setScanNote('That QR code isn’t an S-Care band label. Type the band ID and pairing code instead.')
      return
    }
    setUidInput(parsed.deviceId)
    setClaimCode(parsed.claimCode)
    setScanNote('Read from the QR label.')
  }

  const submit = async () => {
    if (submitting) return
    setSubmitting(true)
    const result = await sim.pair({
      deviceId: uid,
      claimCode: needsCode ? claimCode : undefined,
      existingPatientId: mode === 'existing' ? existingId : undefined,
      newPatient: mode === 'new' ? { name, age, sex, room, zone } : undefined,
    })
    setSubmitting(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    const patient = sim.getState().patients.find((p) => p.id === result.patientId)
    toast({ tone: 'success', title: `${uid} paired`, body: `Now monitoring ${patient?.name ?? 'the patient'}. Contacts sync to the band on its next check-in.` })
    onClose()
    onPaired(result.patientId)
  }

  if (step === 'scan') {
    return (
      <div className="flex flex-col gap-5 p-5">
        {live ? (
          scanning ? (
            <Suspense fallback={<p className="text-center text-[12px] text-t3">Opening the camera…</p>}>
              <QrScanner onResult={applyScanned} />
            </Suspense>
          ) : (
            <button type="button" className="btn btn-outline self-center" onClick={() => { setScanNote(null); setScanning(true) }}>
              <Icon name="scan" size={16} />
              Scan the QR label with the camera
            </button>
          )
        ) : (
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
        )}

        <p className="text-center text-[13px] text-t2">
          {live
            ? 'Or type the band ID and pairing code printed on the label. Keep the label private: the code is what proves you have the band.'
            : 'Scan the QR code on the back of the band, or enter the id printed under it.'}
        </p>
        {scanNote && <p className="text-center text-[12px] font-semibold text-t2" role="status">{scanNote}</p>}

        <div className="flex flex-col gap-3">
          <div>
            <label className="field-label" htmlFor="pair-code">Band ID</label>
            <input
              id="pair-code"
              className="input font-mono uppercase"
              value={uidInput}
              onChange={(e) => {
                const parsed = parsePairingText(e.target.value)
                if (parsed) {
                  setUidInput(parsed.deviceId)
                  setClaimCode(parsed.claimCode)
                  setScanNote('Filled in from the pasted label link.')
                } else {
                  setUidInput(e.target.value)
                }
              }}
              placeholder={live ? 'SCB-7K2Q9XHMR4' : 'SC-DEV-201'}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(scanError)}
              aria-describedby="pair-code-help"
            />
            <p id="pair-code-help" className={`mt-1.5 text-[12px] ${scanError ? 'text-red' : 'text-t3'}`} role={scanError ? 'alert' : undefined}>
              {scanError ?? (live ? (known ? 'This band already belongs to your facility — no pairing code needed.' : '') : 'Demo codes:')}
              {!scanError && !live && (
                <>
                  {' '}
                  {['SC-DEV-201', 'SC-DEV-202', 'SC-DEV-203'].map((c) => (
                    <button key={c} type="button" onClick={() => setUidInput(c)} className="mr-2 font-mono font-bold text-green hover:underline">
                      {c}
                    </button>
                  ))}
                </>
              )}
            </p>
          </div>

          {needsCode && (
            <div>
              <label className="field-label" htmlFor="pair-claim">Pairing code</label>
              <input
                id="pair-claim"
                className="input font-mono uppercase"
                value={claimCode}
                onChange={(e) => setClaimCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!uid || Boolean(scanError) || (needsCode && !claimCode.trim())}
            onClick={() => {
              setScanning(false)
              setError(null)
              setStep('assign')
            }}
          >
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
        void submit()
      }}
    >
      <div className="flex items-center gap-3 rounded-lg border border-green bg-green-surf p-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-green text-on-green">
          <Icon name="watch" size={18} />
        </span>
        <div>
          <b className="font-mono text-[14px]">{uid}</b>
          <p className="text-[12px] text-t2">{live ? (needsCode ? 'Checked when you pair — choose who wears it' : 'Owned by your facility — choose who wears it') : 'S-Care Band · firmware 2.1.3 · ready to assign'}</p>
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
            <input id="pair-room" className="input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder={live ? 'e.g. Bedroom or 215' : '215'} required />
          </div>
          <div>
            <label className="field-label" htmlFor="pair-zone">{live ? 'Area (optional)' : 'Wing'}</label>
            {live ? (
              <>
                <input id="pair-zone" className="input" list="pair-zone-options" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="e.g. Upstairs" />
                <datalist id="pair-zone-options">
                  {zoneOptions.map((z) => <option key={z} value={z} />)}
                </datalist>
              </>
            ) : (
              <select id="pair-zone" className="input" value={zone} onChange={(e) => setZone(e.target.value)}>
                {WINGS.map((z) => <option key={z}>{z}</option>)}
              </select>
            )}
          </div>
        </div>
      )}

      {error && <p className="rounded-md border border-red bg-red-surf px-3 py-2 text-[13px] text-t1" role="alert">{error}</p>}

      <div className="flex justify-between gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => setStep('scan')}>
          <Icon name="chevron-left" size={16} />
          Back
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Pairing…' : 'Pair band'}</button>
      </div>
    </form>
  )
}
