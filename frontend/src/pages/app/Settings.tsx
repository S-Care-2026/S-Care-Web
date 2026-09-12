import { startTransition, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/context'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/toast-context'
import { LivePill } from '../../components/ui'
import { sim, useSim } from '../../data/store'
import { BUILT_IN_THRESHOLDS, effectiveThresholds, validateThresholds } from '../../lib/thresholds'
import { setTheme, useTheme } from '../../lib/theme'
import type { Thresholds } from '../../lib/types'

const GROUPS: { title: string; hint: string; fields: { key: keyof Thresholds; label: string; unit: string }[] }[] = [
  {
    title: 'Heart rate',
    hint: 'Warning after the sustain time; critical after 2 consecutive readings.',
    fields: [
      { key: 'hrCritLow', label: 'Critical low', unit: 'bpm' },
      { key: 'hrWarnLow', label: 'Warning low', unit: 'bpm' },
      { key: 'hrWarnHigh', label: 'Warning high', unit: 'bpm' },
      { key: 'hrCritHigh', label: 'Critical high', unit: 'bpm' },
    ],
  },
  {
    title: 'Blood oxygen',
    hint: 'Hypoxemia alerts use the same sustain rule.',
    fields: [
      { key: 'spo2WarnLow', label: 'Warning below', unit: '%' },
      { key: 'spo2CritLow', label: 'Critical at or below', unit: '%' },
    ],
  },
  {
    title: 'Band battery',
    hint: 'Notice at the warning level, warning at the critical level.',
    fields: [
      { key: 'batteryWarn', label: 'Warning at', unit: '%' },
      { key: 'batteryCrit', label: 'Critical at', unit: '%' },
    ],
  },
  {
    title: 'Timing',
    hint: 'Production default is 300 s; the demo uses 20 s so rules fire quickly.',
    fields: [{ key: 'sustainSeconds', label: 'Must persist for', unit: 's' }],
  },
]

export function Settings() {
  const state = useSim()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const theme = useTheme()
  const isAdmin = user?.role === 'admin'
  const current = effectiveThresholds(state.facilityThresholds, undefined)
  const [draft, setDraft] = useState<Thresholds>(current)
  const [error, setError] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const dirty = (Object.keys(draft) as (keyof Thresholds)[]).some((k) => draft[k] !== current[k])

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6">
      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-elev px-5 py-3.5">
          <div>
            <h2 className="m-0 text-[15px] font-bold">Facility alert thresholds</h2>
            <p className="text-[12px] text-t3">Defaults for every patient. Individual patients can override them on their page.</p>
          </div>
          {!isAdmin && <span className="chip border border-line text-t2">View only</span>}
        </header>
        <form
          className="flex flex-col gap-5 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            const err = validateThresholds(draft)
            if (err) return setError(err)
            sim.setFacilityThresholds(draft)
            setError(null)
            toast({ tone: 'success', title: 'Thresholds saved', body: 'Applied to every patient without an override. Bands resync.' })
          }}
        >
          <fieldset disabled={!isAdmin} className="m-0 flex flex-col gap-5 border-0 p-0">
            {GROUPS.map((g) => (
              <div key={g.title} className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
                <div>
                  <b className="text-[13px]">{g.title}</b>
                  <p className="text-[12px] text-t3">{g.hint}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {g.fields.map((f) => (
                    <div key={f.key}>
                      <label className="field-label" htmlFor={`fac-${f.key}`}>{f.label}</label>
                      <div className="relative">
                        <input
                          id={`fac-${f.key}`}
                          type="number"
                          className="input h-10 pr-10 tabular-nums"
                          value={draft[f.key]}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Number(e.target.value) }))}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px] text-t3">{f.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
          {error && <p className="rounded-md border border-red bg-red-surf px-3 py-2 text-[13px] text-t1" role="alert">{error}</p>}
          {isAdmin ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-hair pt-4">
              <button type="button" className="btn btn-ghost" onClick={() => { setDraft({ ...BUILT_IN_THRESHOLDS, sustainSeconds: 20 }); setError(null) }}>
                Restore recommended
              </button>
              <button type="submit" className="btn btn-primary" disabled={!dirty}>Save thresholds</button>
            </div>
          ) : (
            <p className="text-[12px] text-t3">Only admins can change thresholds. Sign out and use the demo admin (admin@scare.demo) to try it.</p>
          )}
        </form>
      </section>

      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-line bg-elev px-5 py-3.5">
          <div>
            <h2 className="m-0 text-[15px] font-bold">Simulated data</h2>
            <p className="text-[12px] text-t3">No bands are connected yet. Readings, rules and alerts are generated in this browser, and your changes are kept here until you reset.</p>
          </div>
          <LivePill running={state.running} />
        </header>
        <div className="flex flex-col gap-4 p-5 text-[13px] text-t2">
          <p>
            Every 2 seconds each worn band publishes heart rate, SpO₂ and skin temperature. The rule engine applies the thresholds above, raises and deduplicates alerts, escalates them, and resolves offline alerts when a band reconnects — the same behaviour planned for the MQTT subscriber.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-outline" onClick={() => sim.setRunning(!state.running)}>
              <Icon name={state.running ? 'pause' : 'play'} size={15} strokeWidth={2.6} />
              {state.running ? 'Pause stream' : 'Resume stream'}
            </button>
            {confirmReset ? (
              <>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    sim.reset()
                    setDraft(effectiveThresholds(sim.getState().facilityThresholds, undefined))
                    setConfirmReset(false)
                    toast({ tone: 'info', title: 'Demo data reset', body: 'Patients, alerts and contacts are back to their starting state.' })
                  }}
                >
                  Confirm reset
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Keep my changes</button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
                <Icon name="refresh" size={15} />
                Reset demo data
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="m-0 text-[15px] font-bold">Appearance</h2>
          <div className="seg self-start" role="group" aria-label="Theme">
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
              <span className="flex items-center gap-1.5"><Icon name="moon" size={13} />Dark</span>
            </button>
            <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
              <span className="flex items-center gap-1.5"><Icon name="sun" size={13} />Light</span>
            </button>
          </div>
          <p className="text-[12px] text-t3">Vital Green — the same palette as the S-Care mobile app.</p>
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="m-0 text-[15px] font-bold">Account</h2>
          <dl className="m-0 grid grid-cols-[90px_1fr] gap-y-1.5 text-[13px]">
            <dt className="text-t3">Name</dt><dd className="m-0 font-semibold">{user?.name}</dd>
            <dt className="text-t3">Email</dt><dd className="m-0 font-mono text-[12px]">{user?.email}</dd>
            <dt className="text-t3">Role</dt><dd className="m-0 font-semibold capitalize">{user?.role}</dd>
          </dl>
          <button type="button" className="btn btn-ghost self-start" onClick={() => startTransition(() => { navigate('/'); logout() })}>
            <Icon name="logout" size={15} />
            Log out
          </button>
        </section>
      </div>
    </div>
  )
}
