/** Which data the dashboard shows: the in-browser simulator, or real bands through the S-Care server. */
export type DataMode = 'demo' | 'live'

const KEY = 'scare.dataMode'

export function getDataMode(): DataMode {
  try {
    return localStorage.getItem(KEY) === 'live' ? 'live' : 'demo'
  } catch {
    return 'demo'
  }
}

/** Signs out and reloads on the sign-in page: demo and real accounts are different, and the data source is picked at startup. */
export function switchDataMode(mode: DataMode, to = '/login') {
  try {
    localStorage.setItem(KEY, mode)
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem('scare.session')
      storage.removeItem('scare.token')
      storage.removeItem('scare.liveUser')
    }
  } catch {
    /* storage unavailable: the reload keeps the current mode */
  }
  window.location.assign(to)
}
