import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { ToastContext, type ToastInput, type ToastTone } from './toast-context'

interface Toast extends ToastInput {
  id: number
}

const TONE: Record<ToastTone, { bar: string; icon: IconName }> = {
  critical: { bar: 'bg-red text-on-red', icon: 'alert' },
  warning: { bar: 'bg-amber text-on-amber', icon: 'warning' },
  success: { bar: 'bg-green text-on-green', icon: 'check' },
  info: { bar: 'bg-info text-on-info', icon: 'info' },
}

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])

  const notify = useCallback(
    (input: ToastInput) => {
      const id = ++seq.current
      setToasts((ts) => [...ts.slice(-3), { ...input, id }])
      const ms = input.duration ?? (input.tone === 'critical' ? 9000 : 4500)
      setTimeout(() => dismiss(id), ms)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 left-4 z-[60] flex flex-col items-end gap-2 sm:left-auto"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div key={t.id} className="animate-sc-toast card pointer-events-auto flex w-full items-start gap-3 overflow-hidden p-3 sm:w-[380px]">
            <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-md ${TONE[t.tone].bar}`}>
              <Icon name={TONE[t.tone].icon} size={16} strokeWidth={2.6} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-t1">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[12px] text-t2">{t.body}</p>}
              {t.action && (
                <button
                  type="button"
                  className="mt-2 text-[12px] font-extrabold text-green hover:underline"
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button type="button" className="text-t3 hover:text-t1" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
