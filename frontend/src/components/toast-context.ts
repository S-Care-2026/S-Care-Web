import { createContext, useContext } from 'react'

export type ToastTone = 'critical' | 'warning' | 'success' | 'info'

export interface ToastInput {
  tone: ToastTone
  title: string
  body?: string
  action?: { label: string; onClick: () => void }
  /** ms; defaults by tone */
  duration?: number
}

export const ToastContext = createContext<((t: ToastInput) => void) | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <Toaster>')
  return ctx
}
