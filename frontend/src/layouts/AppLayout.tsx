import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/context'
import { AppActionsContext, type AppActions } from '../components/app/actions-context'
import { AlertDrawer } from '../components/app/AlertDrawer'
import { PairDeviceModal } from '../components/app/PairDeviceModal'
import { SimulateAlertModal } from '../components/app/SimulateAlertModal'
import { Icon, type IconName } from '../components/Icon'
import { useToast } from '../components/toast-context'
import { AlertTypeIcon, Avatar, Brand, LivePill } from '../components/ui'
import { sim, sortAlerts, useNow, useSim } from '../data/store'
import { ALERT_TYPE_LABEL, isActive, timeAgo } from '../lib/format'
import { setTheme, useTheme } from '../lib/theme'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/patients', label: 'Patients', icon: 'patients' },
  { to: '/alerts', label: 'Alerts', icon: 'bell' },
  { to: '/map', label: 'Map', icon: 'map' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

function titleFor(path: string): string {
  if (path.startsWith('/patients/')) return 'Patient'
  return NAV.find((n) => path.startsWith(n.to))?.label ?? 'S-Care'
}

export function AppLayout() {
  const state = useSim()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const theme = useTheme()

  const [alertId, setAlertId] = useState<string | null>(null)
  const [simulate, setSimulate] = useState<{ open: boolean; patientId?: string }>({ open: false })
  const [pairOpen, setPairOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  const actions = useMemo<AppActions>(
    () => ({
      openAlert: (id) => setAlertId(id),
      simulateAlert: (patientId) => setSimulate({ open: true, patientId }),
      pairDevice: () => setPairOpen(true),
    }),
    [],
  )

  const title = titleFor(location.pathname)
  useEffect(() => {
    document.title = `${title} · S-Care`
  }, [title])

  // Every alert that opens anywhere on the ward surfaces as a toast.
  useEffect(
    () =>
      sim.onEvent((e) => {
        const a = e.alert
        if (a.severity === 'info') return
        const patient = sim.getState().patients.find((p) => p.id === a.patientId)
        toast({
          tone: a.severity === 'critical' ? 'critical' : 'warning',
          title: `${e.kind === 'alert-escalated' ? 'Escalated: ' : ''}${ALERT_TYPE_LABEL[a.type]} — ${patient?.name ?? a.deviceId}`,
          body: a.locationLabel,
          action: { label: 'View alert', onClick: () => setAlertId(a.id) },
        })
      }),
    [toast],
  )

  const active = state.alerts.filter((a) => isActive(a.status))

  const sidebar = (
    <>
      <div className="flex h-16 items-center border-b border-line px-[18px]">
        <Link to="/dashboard" className="no-underline" onClick={() => setNavOpen(false)}>
          <Brand size={32} />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="App">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            onClick={() => setNavOpen(false)}
            className={({ isActive: on }) =>
              `flex h-[42px] items-center gap-3 rounded-lg px-3 text-[13px] font-bold no-underline ${on ? 'bg-green text-on-green hover:text-on-green' : 'text-t2 hover:bg-elev hover:text-t1'}`
            }
          >
            {({ isActive: on }) => (
              <>
                <Icon name={n.icon} size={18} />
                {n.label}
                {n.to === '/alerts' && active.length > 0 && (
                  <span className={`ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded px-1 text-[10px] font-extrabold tabular-nums ${on ? 'bg-on-green text-green' : 'bg-red text-on-red'}`}>
                    {active.length}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <button type="button" className="btn btn-outline btn-sm mb-3 w-full" onClick={() => actions.simulateAlert()}>
          <Icon name="bell" size={14} />
          Simulate alert
        </button>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-green bg-green-surf text-[12px] font-extrabold text-green">
            {user?.name.split(' ').map((p) => p[0]).join('')}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <b className="block truncate text-[12px]">{user?.name}</b>
            <span className="text-[10px] font-semibold text-t3 capitalize">{user?.role} • {user?.zone}</span>
          </div>
          <button
            type="button"
            className="icon-btn h-[30px] w-[30px]"
            aria-label="Log out"
            title="Log out"
            onClick={() => {
              // One transition, so the auth gate never renders "signed out" on an app route and bounces to /login.
              startTransition(() => {
                navigate('/')
                logout()
              })
            }}
          >
            <Icon name="logout" size={14} />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <AppActionsContext.Provider value={actions}>
      <div className="flex min-h-dvh bg-canvas">
        <aside className="sticky top-0 hidden h-dvh w-[236px] flex-none flex-col border-r border-line bg-card lg:flex">{sidebar}</aside>

        {navOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button type="button" className="absolute inset-0 bg-[rgb(3_8_5/0.62)]" aria-label="Close menu" onClick={() => setNavOpen(false)} />
            <aside className="relative flex h-full w-[260px] flex-col border-r border-line bg-card">{sidebar}</aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 flex-none items-center gap-3 border-b border-line bg-canvas px-4 sm:px-7">
            <button type="button" className="icon-btn lg:hidden" aria-label="Open menu" onClick={() => setNavOpen(true)}>
              <Icon name="menu" size={18} />
            </button>
            <h1 className="m-0 flex-1 text-[19px] font-extrabold tracking-[-0.4px]">{title}</h1>
            <button
              type="button"
              onClick={() => sim.setRunning(!state.running)}
              className="rounded"
              title={state.running ? 'Pause the simulated data stream' : 'Resume the simulated data stream'}
              aria-label={state.running ? 'Pause live data' : 'Resume live data'}
            >
              <LivePill running={state.running} />
            </button>
            <AlertBell onOpen={setAlertId} />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-7">
            <Outlet />
          </main>
        </div>
      </div>

      <AlertDrawer alertId={alertId} onClose={() => setAlertId(null)} />
      <SimulateAlertModal
        open={simulate.open}
        initialPatientId={simulate.patientId}
        onClose={() => setSimulate({ open: false })}
        onCreated={(id) => setAlertId(id)}
      />
      <PairDeviceModal open={pairOpen} onClose={() => setPairOpen(false)} onPaired={(pid) => navigate(`/patients/${pid}`)} />
    </AppActionsContext.Provider>
  )
}

function AlertBell({ onOpen }: { onOpen: (id: string) => void }) {
  const state = useSim()
  const now = useNow(5000)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = sortAlerts(state.alerts.filter((a) => isActive(a.status)))

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="icon-btn" aria-expanded={open} aria-haspopup="true" aria-label={`${active.length} active alerts`} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" size={16} />
        {active.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded bg-red px-1 text-[10px] font-extrabold text-on-red tabular-nums">{active.length}</span>
        )}
      </button>
      {open && (
        <div className="card absolute right-0 z-30 mt-2 w-[min(360px,calc(100vw-32px))] overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <b className="text-[13px]">Active alerts</b>
            <span className="text-[12px] text-t3">{active.length}</span>
          </div>
          {active.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-t2">All clear. Nothing needs attention.</p>
          ) : (
            <ul className="m-0 max-h-[360px] list-none divide-y divide-hair overflow-y-auto p-0">
              {active.slice(0, 8).map((a) => {
                const p = state.patients.find((x) => x.id === a.patientId)
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-elev"
                      onClick={() => {
                        setOpen(false)
                        onOpen(a.id)
                      }}
                    >
                      <AlertTypeIcon type={a.type} severity={a.severity} size={30} />
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[13px] text-t1">{ALERT_TYPE_LABEL[a.type]}</b>
                        <span className="block truncate text-[11px] text-t3">{p?.name ?? a.deviceId} · {timeAgo(a.occurredAt, now)}</span>
                      </span>
                      {p && <Avatar name={p.name} size={24} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <Link to="/alerts" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-[12px] font-bold no-underline">
            View all alerts
          </Link>
        </div>
      )}
    </div>
  )
}
