import type { AlertType } from '../lib/types'
import type { IconName } from './Icon'

export const ALERT_ICON: Record<AlertType, IconName> = {
  fall: 'fall',
  sos: 'sos',
  tachycardia: 'heart',
  bradycardia: 'heart',
  hypoxemia: 'drop',
  low_battery: 'battery',
  offline: 'offline',
}
