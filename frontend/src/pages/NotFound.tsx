import { Link } from 'react-router'
import { useAuth } from '../auth/context'
import { Logo } from '../components/ui'

export function NotFound() {
  const { user } = useAuth()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo size={44} />
      <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.6px]">This page doesn’t exist</h1>
      <p className="max-w-[44ch] text-[14px] text-t2">The link may be old, or the patient or alert was removed.</p>
      <div className="flex gap-3">
        <Link to="/" className="btn btn-ghost">Home</Link>
        {user && <Link to="/dashboard" className="btn btn-primary">Dashboard</Link>}
      </div>
    </div>
  )
}
