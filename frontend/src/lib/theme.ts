import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const listeners = new Set<() => void>()

function read(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem('scare.theme', theme)
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => 'dark')
}
