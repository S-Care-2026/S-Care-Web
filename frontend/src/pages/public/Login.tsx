import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../auth/context'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/toast-context'
import { Brand } from '../../components/ui'
import { API_URL } from '../../data/api'
import { getDataMode, switchDataMode } from '../../data/mode'
import { DEMO_USERS } from '../../data/seed'

export function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const mode = getDataMode()

  useEffect(() => {
    document.title = 'Sign in · S-Care'
  }, [])

  if (user) return <Navigate to={from} replace />

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="hidden w-[560px] flex-none flex-col justify-between border-r border-green bg-green-surf p-14 lg:flex">
        <Link to="/" className="no-underline" aria-label="S-Care home">
          <Brand size={40} />
        </Link>
        <div>
          <h1 className="m-0 max-w-[400px] text-[34px] leading-[1.2] font-extrabold tracking-[-1px]">The ward, watched live.</h1>
          <p className="mt-4 max-w-[380px] text-[14px] leading-relaxed text-t2">
            Sign in to see every band’s vitals, every fall alert, and every SOS press the moment it happens.
          </p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[13px] text-t2">
          {['Live heart-rate & SpO₂ charts', 'Acknowledge and resolve alerts as a team', 'Pair a new band by QR in seconds'].map((t) => (
            <li key={t} className="flex items-center gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-green text-on-green">
                <Icon name="check" size={12} strokeWidth={3} />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="mb-8 lg:hidden">
          <Link to="/" className="no-underline"><Brand size={40} /></Link>
        </div>
        <form
          className="flex w-full max-w-[400px] flex-col gap-6"
          onSubmit={async (e) => {
            e.preventDefault()
            if (submitting) return
            setSubmitting(true)
            const err = await login(email, password, remember)
            setSubmitting(false)
            if (err) setError(err)
            else navigate(from, { replace: true })
          }}
          noValidate
        >
          <div>
            <h2 className="m-0 text-[26px] font-extrabold tracking-[-0.6px]">Sign in</h2>
            <p className="mt-1 text-[13px] text-t3">Caregiver &amp; admin access to the S-Care dashboard.</p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="field-label" id="login-mode">Data</span>
            <div className="seg flex w-full" role="group" aria-labelledby="login-mode">
              <button type="button" className="flex-1" aria-pressed={mode === 'demo'} onClick={() => mode !== 'demo' && switchDataMode('demo')}>
                Demo data
              </button>
              <button type="button" className="flex-1" aria-pressed={mode === 'live'} onClick={() => mode !== 'live' && switchDataMode('live')}>
                Real bands
              </button>
            </div>
            <p className="text-[12px] text-t3">
              {mode === 'demo'
                ? 'Simulated patients in this browser — try everything without a band.'
                : 'Live readings from connected bands, stored by the S-Care server.'}
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="login-email">Email</label>
            <div className="relative">
              <Icon name="mail" size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-t3" />
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                className="input h-[46px] pl-10"
                placeholder="you@carehome.org"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(null)
                }}
                aria-invalid={Boolean(error)}
                required
              />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="login-password">Password</label>
            <div className="relative">
              <Icon name="lock" size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-t3" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="input h-[46px] pr-16 pl-10"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                aria-invalid={Boolean(error)}
                required
              />
              <button type="button" className="absolute top-1/2 right-3 -translate-y-1/2 text-[12px] font-bold text-t2 hover:text-t1" onClick={() => setShowPassword((s) => !s)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-red bg-red-surf px-3 py-2 text-[13px] text-t1" role="alert">{error}</p>
          )}

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-t2" htmlFor="login-remember">
              <input id="login-remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[var(--sc-green)]" />
              Keep me signed in
            </label>
            <button
              type="button"
              className="text-[13px] font-bold text-green hover:underline"
              onClick={() => toast({ tone: 'info', title: 'Ask your facility administrator', body: 'Passwords are reset by whoever provisioned your account.' })}
            >
              Forgot password?
            </button>
          </div>

          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={submitting} aria-busy={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
            {!submitting && <Icon name="chevron-right" size={16} strokeWidth={2.6} />}
          </button>
          {submitting && mode === 'live' && (
            <p className="-mt-3 text-center text-[12px] text-t3">The server may take up to a minute to wake up.</p>
          )}

          {mode === 'live' ? (
            <div className="rounded-lg border border-line bg-card p-4 text-[12px] text-t2">
              <p className="font-bold">Real data accounts</p>
              <p className="mt-1.5">Use the account your administrator created. Demo accounts don’t work here.</p>
              <p className="mt-1.5 text-t3">Server: <span className="font-mono">{API_URL}</span></p>
            </div>
          ) : (
          <div className="rounded-lg border border-line bg-card p-4">
            <p className="text-[12px] font-bold text-t2">Demo accounts</p>
            <div className="mt-2.5 flex flex-col gap-2">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="flex items-center justify-between gap-3 rounded-md border border-hair bg-elev px-3 py-2 text-left hover:border-line"
                  onClick={() => {
                    setEmail(u.email)
                    setPassword(u.password)
                    setError(null)
                  }}
                >
                  <span>
                    <b className="block text-[13px] text-t1">{u.name}</b>
                    <span className="font-mono text-[11px] text-t3">{u.email} · {u.password}</span>
                  </span>
                  <span className="chip border border-line text-t2 capitalize">{u.role}</span>
                </button>
              ))}
            </div>
          </div>
          )}
          <p className="text-center text-[12px] leading-relaxed text-t3">
            Accounts are provisioned by your facility administrator. No open sign-up.
            <br />
            <Link to="/" className="font-bold">Back to home</Link>
          </p>
        </form>
      </main>
    </div>
  )
}
