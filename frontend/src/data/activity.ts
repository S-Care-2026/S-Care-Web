import { API_URL, getToken } from './api'

const HEARTBEAT_MS = 30_000
const MAX_ELAPSED_MS = 60_000

/** Visible-tab time for real, authenticated accounts; independent of dashboard polling. */
export function startActivityTracking() {
  if (!API_URL) return () => {}
  // Capture this account's token so cleanup during logout cannot record another user.
  let token = getToken()
  let previous = performance.now()
  let visible = document.visibilityState === 'visible'

  function send(activeMs: number) {
    if (!token) return
    // Best effort only: analytics failures must not interrupt sign-in or the dashboard.
    void fetch(`${API_URL}/api/activity/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ activeMs }),
      keepalive: true,
    }).catch(() => {})
  }

  function flush() {
    const now = performance.now()
    const elapsed = Math.floor(now - previous)
    previous = now
    // A stalled/suspended tab provides no reliable evidence of foreground time.
    if (visible) send(elapsed <= MAX_ELAPSED_MS ? Math.max(0, elapsed) : 0)
  }

  function onVisibility() {
    flush()
    visible = document.visibilityState === 'visible'
    if (visible) send(0) // resume without counting time spent in the background
  }

  function onPageHide() {
    flush()
    visible = false
  }

  function onPageShow() {
    previous = performance.now()
    visible = document.visibilityState === 'visible'
    if (visible) send(0)
  }

  if (visible) send(0)
  const timer = window.setInterval(() => {
    // Password changes can replace the token while the same account stays signed in.
    token = getToken()
    flush()
  }, HEARTBEAT_MS)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)
  return () => {
    flush()
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
  }
}
