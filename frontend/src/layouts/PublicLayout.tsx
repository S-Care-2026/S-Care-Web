import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/context'
import { Icon } from '../components/Icon'
import { Logo } from '../components/ui'
import { setTheme, useTheme } from '../lib/theme'

export function PublicLayout() {
  const { user } = useAuth()
  const theme = useTheme()
  const link = ({ isActive }: { isActive: boolean }) =>
    `text-[14px] font-bold no-underline ${isActive ? 'text-t1' : 'text-t2 hover:text-t1'}`

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-card">
        <nav className="mx-auto flex h-[72px] max-w-[1312px] items-center gap-3 px-4 sm:gap-4 sm:px-8 lg:px-16" aria-label="Main">
          <Link to="/" className="flex items-center gap-2.5 no-underline" aria-label="S-Care home">
            <Logo size={36} />
            <b className="hidden text-[18px] font-extrabold tracking-[-0.4px] text-t1 sm:inline">S-Care</b>
          </Link>
          <div className="flex flex-1 gap-5 pl-1 sm:gap-8 sm:pl-8">
            <NavLink to="/" end className={link}>Home</NavLink>
            <NavLink to="/about" className={link}>About</NavLink>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
          {user ? (
            <Link to="/dashboard" className="btn btn-primary max-sm:h-9 max-sm:px-3">
              Dashboard
              <Icon name="chevron-right" size={16} className="max-sm:hidden" />
            </Link>
          ) : (
            <Link to="/login" className="btn btn-outline max-sm:h-9 max-sm:px-3">Login</Link>
          )}
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1312px] flex-col gap-8 px-4 py-10 sm:flex-row sm:justify-between sm:px-8 lg:px-16">
          <div className="flex max-w-[300px] flex-col gap-3">
            <span className="flex items-center gap-2.5">
              <Logo size={32} />
              <b className="text-[17px] font-extrabold">S-Care</b>
            </span>
            <p className="text-[12px] leading-relaxed text-t3">Built for elderly care — a wearable, an MQTT broker, and a dashboard that never blinks.</p>
          </div>
          <div className="flex gap-16">
            <div className="flex flex-col gap-2.5">
              <b className="text-[11px] font-extrabold tracking-[0.6px] text-t3 uppercase">Product</b>
              <Link to="/" className="text-[13px] font-semibold text-t2 no-underline hover:text-t1">Home</Link>
              <Link to="/about" className="text-[13px] font-semibold text-t2 no-underline hover:text-t1">About</Link>
              <Link to={user ? '/dashboard' : '/login'} className="text-[13px] font-semibold text-t2 no-underline hover:text-t1">{user ? 'Dashboard' : 'Login'}</Link>
            </div>
            <div className="flex flex-col gap-2.5">
              <b className="text-[11px] font-extrabold tracking-[0.6px] text-t3 uppercase">Project</b>
              <a href="https://github.com/S-Care-2026" className="text-[13px] font-semibold text-t2 no-underline hover:text-t1" target="_blank" rel="noreferrer">GitHub</a>
              <span className="text-[13px] font-semibold text-t2">License (MIT)</span>
            </div>
          </div>
        </div>
        <p className="mx-auto max-w-[1312px] px-4 pb-10 text-[12px] text-t3 sm:px-8 lg:px-16">© S-Care — built with care for elderly care.</p>
      </footer>
    </div>
  )
}
