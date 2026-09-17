/** Client for the S-Care backend (backend/src/routes/api.js). */

// Vite inlines VITE_API_URL when the app is built, so changing it on the host needs a rebuild.
// Only the dev server falls back to a local backend; a production build without it says so.
const configuredUrl = import.meta.env.VITE_API_URL?.trim()
export const API_URL = (configuredUrl || (import.meta.env.DEV ? 'http://localhost:3001' : '')).replace(/\/+$/, '')
const MISSING_API_URL =
  'This dashboard was built without VITE_API_URL, so it doesn’t know where the S-Care server is. Set it on the frontend service and rebuild.'

const TOKEN_KEY = 'scare.token'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null, remember = true) {
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
  } catch {
    /* storage unavailable: the session lasts until reload */
  }
}

/** Swaps in a new token (after a password change) wherever the current one is kept. */
export function replaceToken(token: string) {
  let remembered = true
  try {
    remembered = localStorage.getItem(TOKEN_KEY) !== null
  } catch {
    /* storage unavailable */
  }
  setToken(token, remembered)
}

const unauthorizedListeners = new Set<() => void>()

/** Called when the server rejects the stored token (expired, or the account was disabled). */
export function onUnauthorized(listener: () => void) {
  unauthorizedListeners.add(listener)
  return () => {
    unauthorizedListeners.delete(listener)
  }
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  if (!API_URL) throw new ApiError(0, MISSING_API_URL)
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Can’t reach the S-Care server. It may be waking up — try again in a minute.')
  }

  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: string } | null
  if (res.status === 401 && token && path !== '/auth/login') {
    setToken(null)
    unauthorizedListeners.forEach((l) => l())
  }
  if (!res.ok || json?.success === false) {
    throw new ApiError(res.status, json?.error ?? `The server answered ${res.status}.`)
  }
  return json?.data as T
}
