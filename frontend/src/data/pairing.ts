export interface PairingCode {
  deviceId: string
  claimCode: string
}

/**
 * Reads what a band's QR label holds: a link like https://…/pair?d=SCB-…&c=ABCD-EFGH-…
 * or scare://pair?d=…&c=… (from `npm run db:provision-device`). Returns null for anything else.
 */
export function parsePairingText(text: string): PairingCode | null {
  const trimmed = text.trim()
  const query = trimmed.includes('?') ? trimmed.slice(trimmed.indexOf('?') + 1) : ''
  if (!query) return null
  const params = new URLSearchParams(query)
  const deviceId = params.get('d')?.trim()
  const claimCode = params.get('c')?.trim()
  return deviceId && claimCode ? { deviceId, claimCode } : null
}
