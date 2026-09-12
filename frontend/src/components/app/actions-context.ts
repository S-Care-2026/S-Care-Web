import { createContext, useContext } from 'react'

/** App-wide dialogs any screen can open. */
export interface AppActions {
  openAlert: (alertId: string) => void
  simulateAlert: (patientId?: string) => void
  pairDevice: () => void
}

export const AppActionsContext = createContext<AppActions | null>(null)

export function useAppActions(): AppActions {
  const ctx = useContext(AppActionsContext)
  if (!ctx) throw new Error('useAppActions must be used inside <AppLayout>')
  return ctx
}
