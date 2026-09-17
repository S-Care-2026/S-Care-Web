import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { AuthContext, useAuth, type AuthValue } from './context'
import { api, ApiError, getToken, onUnauthorized, setToken } from '../data/api'
import { getDataMode } from '../data/mode'
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

  // Real data: the server can end the session (token expired, account disabled).
  useEffect(
    () =>
      onUnauthorized(() => {
        clearStored()
        setUser(null)
      }),
    [],
  )

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
