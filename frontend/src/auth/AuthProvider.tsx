import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { AuthContext, useAuth, type AuthValue } from './context'
import { api, ApiError, getToken, onUnauthorized, setToken } from '../data/api'
import { getDataMode } from '../data/mode'
import { startActivityTracking } from '../data/activity'
import { DEMO_USERS } from '../data/seed'
import type { User } from '../lib/types'

const DEMO_KEY = 'scare.session'
const LIVE_USER_KEY = 'scare.liveUser'
const live = getDataMode() === 'live'

function readSession(): User | null {
  try {
    if (live) {
      const raw = localStorage.getItem(LIVE_USER_KEY) ?? sessionStorage.getItem(LIVE_USER_KEY)
      return raw && getToken() ? (JSON.parse(raw) as User) : null
    }
    const id = localStorage.getItem(DEMO_KEY) ?? sessionStorage.getItem(DEMO_KEY)
    const found = DEMO_USERS.find((u) => u.id === id)
    if (!found) return null
    const { password: _password, ...user } = found
    void _password
    return user
  } catch {
    return null
  }
}

function clearStored() {
  try {
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem(DEMO_KEY)
      storage.removeItem(LIVE_USER_KEY)
    }
  } catch {
    /* ignore */
  }
  setToken(null)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readSession)
  const userId = user?.id

  useEffect(() => {
    if (live && userId) return startActivityTracking()
  }, [userId])

  // Real data: the server can end the session (token expired, account disabled).
  useEffect(
    () =>
      onUnauthorized(() => {
        clearStored()
        setUser(null)
      }),
    [],
  )

  // Refresh restored sessions and permissions granted in the database.
  useEffect(() => {
    if (!live || !userId) return
    let cancelled = false
    let inflight = false
    const refreshUser = async () => {
      if (inflight || document.visibilityState !== 'visible') return
      const token = getToken()
      if (!token) return
      inflight = true
      try {
        const current = await api<User>('GET', '/auth/me')
        if (cancelled || getToken() !== token) return
        setUser((previous) => previous?.id === current.id ? current : previous)
        try {
          const storage = localStorage.getItem('scare.token') ? localStorage : sessionStorage
          storage.setItem(LIVE_USER_KEY, JSON.stringify(current))
        } catch { /* the current session still has the refreshed user */ }
      } catch { /* unauthorized responses are handled by onUnauthorized */ }
      finally { inflight = false }
    }
    void refreshUser()
    const timer = window.setInterval(() => void refreshUser(), 60_000)
    document.addEventListener('visibilitychange', refreshUser)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshUser)
    }
  }, [userId])

  const login = useCallback<AuthValue['login']>(async (email, password, remember) => {
    const storage = remember ? localStorage : sessionStorage
    if (live) {
      try {
        const result = await api<{ token: string; user: User }>('POST', '/auth/login', { email: email.trim(), password })
        setToken(result.token, remember)
        try {
          storage.setItem(LIVE_USER_KEY, JSON.stringify(result.user))
        } catch {
          /* storage unavailable */
        }
        setUser(result.user)
        return null
      } catch (err) {
        return err instanceof ApiError ? err.message : 'Sign-in failed. Try again.'
      }
    }

    const found = DEMO_USERS.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    if (!found || found.password !== password) return 'That email and password don’t match a demo account.'
    const { password: _password, ...u } = found
    void _password
    try {
      storage.setItem(DEMO_KEY, u.id)
    } catch {
      /* storage unavailable */
    }
    setUser(u)
    return null
  }, [])

  const register = useCallback<AuthValue['register']>(async (input) => {
    if (!live) return 'Accounts are only created with real data. Switch to “Real bands” first.'
    try {
      const result = await api<{ token: string; user: User }>('POST', '/auth/register', input)
      setToken(result.token, true)
      try {
        localStorage.setItem(LIVE_USER_KEY, JSON.stringify(result.user))
      } catch {
        /* storage unavailable */
      }
      setUser(result.user)
      return null
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Couldn’t create the account. Try again.'
    }
  }, [])

  const logout = useCallback(() => {
    clearStored()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, login, register, logout }), [user, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}
