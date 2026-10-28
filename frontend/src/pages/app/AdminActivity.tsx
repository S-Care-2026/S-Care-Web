import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/context'
import { Icon, type IconName } from '../../components/Icon'
import { api, ApiError } from '../../data/api'
import { getDataMode } from '../../data/mode'

interface ActivitySummary {
  totalUsers: number
  enabledUsers: number
  onlineUsers: number
  activeUsers24h: number
  trackedUsers: number
  totalActiveSeconds: number
  averageActiveSecondsPerTrackedUser: number
  trackingStartedAt: string | null
  generatedAt: string
  onlineWindowSeconds: number
}

const number = new Intl.NumberFormat()
function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours) return `${number.format(hours)}h ${minutes}m`
  if (minutes) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

export function AdminActivity() {
  const { user } = useAuth()
  if (getDataMode() !== 'live' || user?.isPlatformAdmin !== true) return <AccessRequired />
  return <ActivityOverview key={user.id} />
}

function AccessRequired() {
  return (
    <section className="card mx-auto flex max-w-xl flex-col items-center gap-3 p-8 text-center" aria-labelledby="activity-access-title">
      <span className="rounded-xl bg-elev p-3 text-t2"><Icon name="lock" size={26} /></span>
      <h2 id="activity-access-title" className="m-0 text-xl font-extrabold">Platform admin access required</h2>
      <p className="text-sm text-t2">Sign in with a platform administrator account using Real bands to view website activity.</p>
      <Link className="btn btn-outline mt-2" to="/dashboard">Back to dashboard</Link>
    </section>
  )
}

function ActivityOverview() {
  const [summary, setSummary] = useState<ActivitySummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [refreshing, setRefreshing] = useState(true)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    let inflight = false
    let denied = false
    const load = async () => {
      if (inflight || denied || document.visibilityState !== 'visible') return
      inflight = true
      try {
        const data = await api<ActivitySummary>('GET', '/admin/activity/summary')
        if (!cancelled) {
          setSummary(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 403) {
            denied = true
            setSummary(null)
            setForbidden(true)
          } else {
            setError(err instanceof Error ? err.message : 'Could not load website activity.')
          }
        }
      } finally {
        inflight = false
        if (!cancelled) setRefreshing(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 30_000)
    document.addEventListener('visibilitychange', load)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', load)
    }
  }, [reload])

  if (forbidden) return <AccessRequired />

  const cards: { label: string; value: string; hint: string; icon: IconName; tone: string }[] = summary ? [
    { label: 'Registered users', value: number.format(summary.totalUsers), hint: `${number.format(summary.enabledUsers)} enabled accounts`, icon: 'patients', tone: 'bg-info-surf text-info' },
    { label: 'Online now', value: number.format(summary.onlineUsers), hint: `Seen in the last ${summary.onlineWindowSeconds} seconds`, icon: 'pulse', tone: 'bg-green-surf text-green' },
    { label: 'Active in 24 hours', value: number.format(summary.activeUsers24h), hint: 'Unique accounts with recent activity', icon: 'chart', tone: 'bg-info-surf text-info' },
    { label: 'Total time on site', value: duration(summary.totalActiveSeconds), hint: 'Combined foreground time across accounts', icon: 'clock', tone: 'bg-green-surf text-green' },
    { label: 'Average time per user', value: duration(summary.averageActiveSecondsPerTrackedUser), hint: 'Cumulative time per tracked account', icon: 'user', tone: 'bg-amber-surf text-amber' },
    { label: 'Users tracked', value: number.format(summary.trackedUsers), hint: 'Accounts observed since tracking began', icon: 'monitor', tone: 'bg-info-surf text-info' },
  ] : []

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-green uppercase"><Icon name="lock" size={13} /> Platform overview</span>
          <h2 className="m-0 text-2xl font-extrabold tracking-tight">Website activity</h2>
          <p className="mt-1 text-sm text-t2">Accounts and usage across all S-Care facilities.</p>
        </div>
        <button type="button" className="btn btn-outline" disabled={refreshing} onClick={() => { setRefreshing(true); setReload((n) => n + 1) }}>
          <Icon name="refresh" size={16} className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber bg-amber-surf p-4 text-sm">
          <Icon name="warning" size={18} className="mt-0.5 flex-none text-amber" />
          <div><b>Activity could not be updated.</b><p className="mt-1 text-t2">{error}</p>{summary && <p className="mt-1 text-t2">Showing the last successful update below.</p>}</div>
        </div>
      )}

      {!summary && !error && (
        <div className="card p-8 text-center text-sm text-t2" role="status">Loading website activity…</div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Website activity statistics">
            {cards.map((card) => (
              <section key={card.label} className="card flex flex-col gap-4 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="m-0 text-sm font-semibold text-t2">{card.label}</h3>
                  <span className={`rounded-lg p-2 ${card.tone}`}><Icon name={card.icon} size={18} /></span>
                </div>
                <strong className="break-words text-[32px] leading-tight font-extrabold tracking-tight tabular-nums">{card.value}</strong>
                <p className="text-xs text-t3">{card.hint}</p>
              </section>
            ))}
          </div>

          {summary.trackedUsers === 0 && (
            <section className="rounded-lg border border-green bg-green-surf p-5">
              <h3 className="m-0 text-sm font-bold">Waiting for the first activity</h3>
              <p className="mt-1 text-sm text-t2">Usage will appear when someone signs in with Real bands and keeps the website visible. Existing accounts are already included in the registered total.</p>
            </section>
          )}

          <section className="card grid gap-5 p-5 md:grid-cols-2" aria-label="About these statistics">
            <div>
              <h3 className="m-0 text-sm font-bold">What is counted?</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-t2">Signed-in accounts using Real bands. Time counts while the website is visible, including idle time. Multiple tabs share one account total. Anonymous visits and Demo data sessions are excluded.</p>
            </div>
            <div>
              <h3 className="m-0 text-sm font-bold">Tracking period</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-t2">{summary.trackingStartedAt ? `Since ${new Date(summary.trackingStartedAt).toLocaleString()}. Time totals cover all recorded activity for retained accounts.` : 'Tracking starts with the first signed-in visit.'}</p>
              <p className="mt-2 text-xs text-t3">Closed or hidden tabs may remain online for up to {summary.onlineWindowSeconds} seconds.</p>
            </div>
          </section>
          <p className="text-xs text-t3" role="status">
            {error ? 'Last successful update' : 'Updated'}: <time dateTime={summary.generatedAt}>{new Date(summary.generatedAt).toLocaleString()}</time> · Refreshes every 30 seconds while visible
          </p>
        </>
      )}
    </div>
  )
}
