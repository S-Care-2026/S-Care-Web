import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../../auth/context'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/toast-context'
import { Brand } from '../../components/ui'
import { getDataMode, switchDataMode } from '../../data/mode'

const PASSWORD_MIN = 10

export function Register() {
  const { user, register } = useAuth()
  const toast = useToast()
  const live = getDataMode() === 'live'

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [homeName, setHomeName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState(false)

  useEffect(() => {
    document.title = 'Create account · S-Care'
  }, [])

  // Straight after sign-up, open the pairing dialog; an already signed-in visitor just goes to the dashboard.
  if (user) return <Navigate to={created ? '/pair' : '/dashboard'} replace />

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN
  const mismatch = confirm.length > 0 && confirm !== password

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="hidden w-[560px] flex-none flex-col justify-between border-r border-green bg-green-surf p-14 lg:flex">
        <Link to="/" className="no-underline" aria-label="S-Care home">
          <Brand size={40} />
        </Link>
        <div>
          <h1 className="m-0 max-w-[400px] text-[34px] leading-[1.2] font-extrabold tracking-[-1px]">Watch over someone at home.</h1>
          <p className="mt-4 max-w-[380px] text-[14px] leading-relaxed text-t2">
            Create an account for your home, then pair the band with its QR label. You’ll see their heart rate and SpO₂, and every fall or SOS as it happens.
          </p>
        </div>
        <ol className="m-0 flex list-none flex-col gap-3 p-0 text-[13px] text-t2">
          {['Create your account', 'Scan the band’s QR label', 'Add emergency contacts for the band to text'].map((t, i) => (
            <li key={t} className="flex items-center gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-green text-[11px] font-extrabold text-on-green">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="mb-8 lg:hidden">
          <Link to="/" className="no-underline"><Brand size={40} /></Link>
        </div>

        {!live ? (
          <div className="flex w-full max-w-[400px] flex-col gap-4">
            <h2 className="m-0 text-[26px] font-extrabold tracking-[-0.6px]">Create an account</h2>
            <p className="text-[13px] text-t2">
              You’re using demo data, which has fixed demo accounts. Accounts are created on the S-Care server, for real bands.
            </p>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => switchDataMode('live', '/register')}>
              Switch to real bands
            </button>
            <Link to="/login" className="text-center text-[13px] font-bold">Back to sign in</Link>
          </div>
        ) : (
          <form
            className="flex w-full max-w-[400px] flex-col gap-5"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault()
              if (submitting) return
              if (!fullName.trim() || !email.trim()) return setError('Enter your name and email.')
              if (password.length < PASSWORD_MIN) return setError(`Use a password of at least ${PASSWORD_MIN} characters.`)
              if (password !== confirm) return setError('The two passwords don’t match.')
              setSubmitting(true)
              setCreated(true)
              const err = await register({ fullName: fullName.trim(), email: email.trim(), password, homeName: homeName.trim() })
              setSubmitting(false)
              if (err) {
                setCreated(false)
                return setError(err)
              }
              toast({ tone: 'success', title: 'Account created', body: 'Next, pair the band with its QR label.' })
            }}
          >
            <div>
              <h2 className="m-0 text-[26px] font-extrabold tracking-[-0.6px]">Create an account</h2>
              <p className="mt-1 text-[13px] text-t3">For families monitoring someone at home. You’ll be the admin of your home.</p>
            </div>

            <div>
              <label className="field-label" htmlFor="reg-name">Your name</label>
              <input id="reg-name" className="input h-[46px]" autoComplete="name" value={fullName} onChange={(e) => { setFullName(e.target.value); setError(null) }} required />
            </div>

            <div>
              <label className="field-label" htmlFor="reg-email">Email</label>
              <div className="relative">
                <Icon name="mail" size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-t3" />
                <input id="reg-email" type="email" className="input h-[46px] pl-10" autoComplete="email" placeholder="you@example.org" value={email} onChange={(e) => { setEmail(e.target.value); setError(null) }} required />
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="reg-home">Home name (optional)</label>
              <input id="reg-home" className="input h-[46px]" placeholder={fullName.trim() ? `${fullName.trim()}’s home` : 'e.g. Grandma’s house'} value={homeName} onChange={(e) => setHomeName(e.target.value)} />
            </div>

            <div>
              <label className="field-label" htmlFor="reg-password">Password</label>
              <div className="relative">
                <Icon name="lock" size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-t3" />
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input h-[46px] pr-16 pl-10"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null) }}
                  aria-invalid={tooShort}
                  aria-describedby="reg-password-help"
                  required
                />
                <button type="button" className="absolute top-1/2 right-3 -translate-y-1/2 text-[12px] font-bold text-t2 hover:text-t1" onClick={() => setShowPassword((s) => !s)}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <p id="reg-password-help" className={`mt-1.5 text-[12px] ${tooShort ? 'text-red' : 'text-t3'}`}>At least {PASSWORD_MIN} characters.</p>
            </div>

            <div>
              <label className="field-label" htmlFor="reg-confirm">Confirm password</label>
              <input
                id="reg-confirm"
                type={showPassword ? 'text' : 'password'}
                className="input h-[46px]"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(null) }}
                aria-invalid={mismatch}
                required
              />
              {mismatch && <p className="mt-1.5 text-[12px] text-red">The passwords don’t match.</p>}
            </div>

            {error && <p className="rounded-md border border-red bg-red-surf px-3 py-2 text-[13px] text-t1" role="alert">{error}</p>}

            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={submitting} aria-busy={submitting}>
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
            {submitting && <p className="-mt-3 text-center text-[12px] text-t3">The server may take up to a minute to wake up.</p>}

            <p className="text-center text-[13px] text-t2">
              Already have an account? <Link to="/login" className="font-bold">Sign in</Link>
            </p>
          </form>
        )}
      </main>
    </div>
  )
}
