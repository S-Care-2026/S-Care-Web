import { createContext, useContext } from 'react'
import type { User } from '../lib/types'

export interface AuthValue {
  user: User | null
  login: (email: string, password: string, remember: boolean) => string | null
  logout: () => void
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
