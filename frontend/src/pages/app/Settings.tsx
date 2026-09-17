import { startTransition, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/context'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/toast-context'
import { LivePill } from '../../components/ui'
import { api, API_URL, ApiError, replaceToken } from '../../data/api'
import { switchDataMode } from '../../data/mode'
import { perform, sim, useSim } from '../../data/store'
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
  const theme = useTheme()
  const live = sim.kind === 'live'

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6">
      <DataSourceCard />

      {/* Remount when the saved values change (real data loaded, demo reset), so the form starts from them. */}
      <FacilityThresholds key={`${state.ready ?? true}:${JSON.stringify(state.facilityThresholds)}`} />

      {!live && <SimulatorCard />}

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
            {live && (
              <>
                <dt className="text-t3">Facility</dt><dd className="m-0 font-semibold">{user?.zone}</dd>
              </>
            )}
          </dl>
          <button type="button" className="btn btn-ghost self-start" onClick={() => startTransition(() => { navigate('/'); logout() })}>
            <Icon name="logout" size={15} />
            Log out
          </button>
        </section>
      </div>

      {live && <ChangePasswordCard />}
    </div>
  )
}

const PASSWORD_MIN = 10

function ChangePasswordCard() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line bg-elev px-5 py-3.5">
        <h2 className="m-0 text-[15px] font-bold">Change password</h2>
        <p className="text-[12px] text-t3">You stay signed in here. Other browsers and devices are signed out.</p>
      </header>
      <form
        className="grid gap-4 p-5 md:grid-cols-3"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          if (saving) return
          if (!current) return setError('Enter your current password.')
          if (next.length < PASSWORD_MIN) return setError(`Use a new password of at least ${PASSWORD_MIN} characters.`)
          if (next !== confirm) return setError('The new passwords don’t match.')
          setSaving(true)
          try {
            const { token } = await api<{ token: string }>('POST', '/auth/password', { currentPassword: current, newPassword: next })
            replaceToken(token)
            setCurrent('')
            setNext('')
            setConfirm('')
            setError(null)
            toast({ tone: 'success', title: 'Password changed', body: 'Other sessions have been signed out.' })
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Couldn’t change the password. Try again.')
          } finally {
            setSaving(false)
          }
        }}
      >
        <div>
          <label className="field-label" htmlFor="pw-current">Current password</label>
          <input id="pw-current" type="password" className="input h-10" autoComplete="current-password" value={current} onChange={(e) => { setCurrent(e.target.value); setError(null) }} />
        </div>
        <div>
          <label className="field-label" htmlFor="pw-new">New password</label>
          <input id="pw-new" type="password" className="input h-10" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setError(null) }} aria-describedby="pw-new-help" />
          <p id="pw-new-help" className="mt-1 text-[11px] text-t3">At least {PASSWORD_MIN} characters.</p>
        </div>
        <div>
          <label className="field-label" htmlFor="pw-confirm">Confirm new password</label>
          <input id="pw-confirm" type="password" className="input h-10" autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(null) }} />
        </div>
        {error && <p className="rounded-md border border-red bg-red-surf px-3 py-2 text-[13px] text-t1 md:col-span-3" role="alert">{error}</p>}
        <div className="flex justify-end md:col-span-3">
          <button type="submit" className="btn btn-primary" disabled={saving || !current || !next || !confirm}>
            {saving ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </section>
  )
}

function DataSourceCard() {
  const state = useSim()
  const live = sim.kind === 'live'

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-elev px-5 py-3.5">
        <div>
          <h2 className="m-0 text-[15px] font-bold">Data source</h2>
          <p className="text-[12px] text-t3">Switching signs you out: demo and real data use different accounts.</p>
        </div>
        {live ? (
          state.running ? <LivePill running label="CONNECTED" /> : <span className="chip bg-slate text-on-slate">{state.ready ? 'RECONNECTING' : 'CONNECTING'}</span>
        ) : (
          <span className="chip border border-line text-t2">DEMO</span>
        )}
      </header>
      <div className="flex flex-col gap-4 p-5">
        <label htmlFor="data-source-live" className="flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block text-[14px] font-semibold text-t1">Use real data from the bands</span>
            <span className="block text-[12px] text-t3">
              {live
                ? 'On — readings, alerts and contacts come from the S-Care server and are saved in the database.'
                : 'Off — the dashboard runs on simulated patients in this browser.'}
            </span>
          </span>
          <span className="relative inline-flex flex-none">
            <input
              id="data-source-live"
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={live}
              onChange={(e) => switchDataMode(e.target.checked ? 'live' : 'demo')}
            />
            <span className="h-6 w-11 rounded-full border border-line bg-elev transition-colors peer-checked:border-green peer-checked:bg-green peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-green" />
            <span className="absolute top-1 left-1 h-4 w-4 rounded-full bg-t3 transition-transform peer-checked:translate-x-5 peer-checked:bg-on-green" />
          </span>
        </label>
        {live && (
          <dl className="m-0 grid grid-cols-[110px_1fr] gap-y-1.5 border-t border-hair pt-4 text-[13px]">
            <dt className="text-t3">Facility</dt><dd className="m-0 font-semibold">{state.facilityName ?? '—'}</dd>
            <dt className="text-t3">Bands</dt><dd className="m-0 font-semibold tabular-nums">{state.devices.filter((d) => d.online).length} online of {state.devices.length}</dd>
            <dt className="text-t3">Server</dt><dd className="m-0 font-mono text-[12px] break-all">{API_URL}</dd>
          </dl>
        )}
      </div>
    </section>
  )
}

function FacilityThresholds() {
  const state = useSim()
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'
  const current = effectiveThresholds(state.facilityThresholds, undefined)
  const [draft, setDraft] = useState<Thresholds>(current)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dirty = (Object.keys(draft) as (keyof Thresholds)[]).some((k) => draft[k] !== current[k])

  return (
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
        onSubmit={async (e) => {
          e.preventDefault()
          const err = validateThresholds(draft)
          if (err) return setError(err)
          setSaving(true)
          const ok = await perform(() => sim.setFacilityThresholds(draft))
          setSaving(false)
          if (!ok) return
          setError(null)
          toast({ tone: 'success', title: 'Thresholds saved', body: 'Applied to every patient without an override.' })
        }}
      >
        <fieldset disabled={!isAdmin || saving} className="m-0 flex flex-col gap-5 border-0 p-0">
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
            <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save thresholds'}</button>
          </div>
        ) : (
          <p className="text-[12px] text-t3">
            {sim.kind === 'live'
              ? 'Only admins can change thresholds.'
              : 'Only admins can change thresholds. Sign out and use the demo admin (admin@scare.demo) to try it.'}
          </p>
        )}
      </form>
    </section>
  )
}

function SimulatorCard() {
  const state = useSim()
  const toast = useToast()
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-elev px-5 py-3.5">
        <div>
          <h2 className="m-0 text-[15px] font-bold">Simulated data</h2>
          <p className="text-[12px] text-t3">Readings, rules and alerts are generated in this browser, and your changes are kept here until you reset.</p>
        </div>
        <LivePill running={state.running} />
      </header>
      <div className="flex flex-col gap-4 p-5 text-[13px] text-t2">
        <p>
          Every 2 seconds each worn band publishes heart rate, SpO₂ and skin temperature. The rule engine applies the thresholds above, raises and deduplicates alerts, escalates them, and resolves offline alerts when a band reconnects — the same behaviour as the MQTT subscriber on the server.
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
  )
}
