import type { Level } from '../../lib/thresholds'
import { Sparkline } from './Sparkline'

const VALUE_TONE: Record<Level, string> = {
  normal: 'text-green',
  warning: 'text-amber',
  critical: 'text-red',
}

const LEVEL_TEXT: Record<Level, string> = {
  normal: 'In range',
  warning: 'Warning',
  critical: 'Critical',
}

export function StatPanel({
  label,
  value,
  unit,
  level,
  spark,
  color,
  selected,
  onSelect,
}: {
  label: string
  value: string
  unit: string
  level: Level | null
  spark?: number[]
  color: string
  selected?: boolean
  onSelect?: () => void
}) {
  const body = (
    <>
      <span className="flex h-7 items-center justify-between border-b border-line bg-elev px-2.5 text-[10px] font-bold tracking-[0.4px] text-t3 uppercase">
        {label}
        {level && <span className="normal-case tracking-normal">{LEVEL_TEXT[level]}</span>}
      </span>
      <span className="relative flex flex-col gap-0.5 px-2.5 pt-2 pb-2">
        <span className="flex items-baseline gap-1">
          <span className={`text-[28px] leading-none font-extrabold tracking-[-1.2px] ${level ? VALUE_TONE[level] : 'text-t3'}`}>{value}</span>
          <span className="text-[11px] font-bold text-t3">{unit}</span>
        </span>
        {spark && spark.length > 1 && (
          <span className="mt-1 block h-6">
            <Sparkline values={spark} color={color} />
          </span>
        )}
      </span>
    </>
  )
  const cls = `flex flex-col overflow-hidden rounded-[5px] border bg-card text-left ${selected ? 'border-green outline outline-1 outline-green' : 'border-line'}`
  return onSelect ? (
    <button type="button" className={`${cls} cursor-pointer hover:border-t2`} onClick={onSelect} aria-pressed={selected}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}
