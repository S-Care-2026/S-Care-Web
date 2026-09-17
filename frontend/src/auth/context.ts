import { createContext, useContext } from 'react'
import type { User } from '../lib/types'

export interface AuthValue {
  user: User | null
  /** Resolves to an error message, or null when signed in. */
  login: (email: string, password: string, remember: boolean) => Promise<string | null>
  /** Real data only: creates the account and its home, then signs in. Resolves to an error message, or null. */
  register: (input: { fullName: string; email: string; password: string; homeName: string }) => Promise<string | null>
  logout: () => void
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
