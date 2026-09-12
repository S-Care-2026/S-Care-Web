import type { SVGProps } from 'react'

const PATHS = {
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z" />,
  drop: <path d="M12 2.7 6.7 8a7.5 7.5 0 1 0 10.6 0z" />,
  thermometer: <path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0zM12 9v7" />,
  dashboard: (<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  patients: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.7 3.5 2.7 3.5 5.7" /></>),
  bell: (<><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>),
  map: (<><path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>),
  scan: <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M3 12h18" />,
  check: <path d="M20 6 9 17l-5-5" />,
  warning: (<><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>),
  alert: <path d="M12 8v5M12 17h.01" />,
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-up': <path d="m18 15-6-6-6 6" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  logout: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>),
  fall: (<><circle cx="13" cy="4" r="1.6" /><path d="m8 21 2-6-3-3 1.5-5 3.5 3 3 1" /><path d="m14 15 2 6" /></>),
  sos: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></>),
  battery: (<><rect x="2" y="7" width="16" height="10" rx="2" /><path d="M20 10v4M6 11v2" /></>),
  offline: (<><path d="M2 8.8a15 15 0 0 1 4.2-2.6M9.9 5.2A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 3.4-2M12.9 10.3A10 10 0 0 1 19 12.9M8.5 16.4a5 5 0 0 1 7 0M12 20h.01" /><path d="M3 3l18 18" /></>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="M7 4.5v15l12-7.5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (<><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></>),
  'arrow-up': <path d="M12 19V5M6 11l6-6 6 6" />,
  'arrow-down': <path d="M12 5v14M6 13l6 6 6-6" />,
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  lock: (<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 1 1 8 0v4" /></>),
  mail: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  refresh: (<><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>),
  hub: (<><circle cx="12" cy="12" r="2.6" /><circle cx="4" cy="4" r="1.8" /><circle cx="20" cy="4" r="1.8" /><circle cx="4" cy="20" r="1.8" /><circle cx="20" cy="20" r="1.8" /><path d="M9.9 9.9 5.5 5.5M14.1 9.9l4.4-4.4M9.9 14.1l-4.4 4.4M14.1 14.1l4.4 4.4" /></>),
  database: (<><path d="M4 6c0-1.66 3.58-3 8-3s8 1.34 8 3-3.58 3-8 3-8-1.34-8-3Z" /><path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" /><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" /></>),
  watch: (<><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M9 7V4h6v3M9 17v3h6v-3" /></>),
  monitor: (<><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>),
  pin: (<><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>),
  signal: <path d="M4 20v-3M9 20v-7M14 20V9M19 20V4" />,
  table: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10" /></>),
  chart: <path d="M3 3v18h18M7 15l4-5 3 3 5-7" />,
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>),
  sliders: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
} as const

export type IconName = keyof typeof PATHS

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
  strokeWidth?: number
}

export function Icon({ name, size = 18, strokeWidth = 2, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
