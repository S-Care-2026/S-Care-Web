import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { AuthContext, useAuth, type AuthValue } from './context'
import { DEMO_USERS } from '../data/seed'
import type { User } from '../lib/types'

const KEY = 'scare.session'

function readSession(): User | null {
  try {
    const id = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY)
    const found = DEMO_USERS.find((u) => u.id === id)
    if (!found) return null
    const { password: _password, ...user } = found
    void _password
    return user
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readSession)

  const login = useCallback<AuthValue['login']>((email, password, remember) => {
    const found = DEMO_USERS.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    if (!found || found.password !== password) return 'That email and password don’t match a demo account.'
    const { password: _password, ...u } = found
    void _password
    try {
      ;(remember ? localStorage : sessionStorage).setItem(KEY, u.id)
    } catch {
      /* storage unavailable */
    }
    setUser(u)
    return null
  }, [])

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(KEY)
      sessionStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}
