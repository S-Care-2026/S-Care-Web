import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { niceScale } from '../../lib/axis'
import { clock, dayLabel } from '../../lib/format'
import { Icon } from '../Icon'

export interface Point {
  t: number
  v: number
  lo?: number
  hi?: number
}

export interface Threshold {
  value: number
  tone: 'critical' | 'warning'
  label: string
}

interface Props {
  title: string
  unit: string
  /** CSS color for the line, e.g. var(--sc-hr) */
  color: string
  /** Solid area/band fill, e.g. var(--sc-hr-fill) */
  fill: string
  points: Point[]
  thresholds?: Threshold[]
  softMin?: number
  softMax?: number
  decimals?: number
  timeFormat: 'seconds' | 'minutes' | 'days'
  /** Highlight the newest sample (streaming panels). */
  live?: boolean
  alarm?: boolean
  height?: number
  headerRight?: ReactNode
  source?: string
  emptyText?: string
}

const M = { top: 10, right: 14, bottom: 24, left: 40 }

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

function nearestIndex(points: Point[], t: number): number {
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].t < t) lo = mid
    else hi = mid
  }
  return Math.abs(points[lo].t - t) <= Math.abs(points[hi].t - t) ? lo : hi
}

/** A Grafana-style time-series panel: nice axes, threshold lines, crosshair tooltip, reducer legend, table view. */
export function TimeSeriesPanel({
  title,
  unit,
  color,
  fill,
  points,
  thresholds = [],
  softMin,
  softMax,
  decimals = 0,
  timeFormat,
  live = false,
  alarm = false,
  height = 180,
  headerRight,
  source,
  emptyText = 'No readings in this window.',
}: Props) {
  const [wrapRef, width] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const titleId = useId()
  const hasBand = points.some((p) => p.lo !== undefined && p.hi !== undefined)

  const fmt = (v: number) => v.toFixed(decimals)
  const fmtTime = (t: number) => (timeFormat === 'seconds' ? clock(t, true) : timeFormat === 'minutes' ? clock(t) : `${dayLabel(t)} ${clock(t)}`)

  const geo = useMemo(() => {
    const plotW = width - M.left - M.right
    const values = points.flatMap((p) => [p.v, p.lo ?? p.v, p.hi ?? p.v])
    const tVals = thresholds.map((t) => t.value)
    const dataMin = Math.min(...values, ...(softMin !== undefined ? [softMin] : []), ...tVals)
    const dataMax = Math.max(...values, ...(softMax !== undefined ? [softMax] : []), ...tVals)
    const scale = niceScale(dataMin, dataMax, height < 140 ? 4 : 5)
    const t0 = points[0]?.t ?? 0
    const t1 = points.at(-1)?.t ?? 1
    const x = (t: number) => M.left + (t1 === t0 ? plotW : ((t - t0) / (t1 - t0)) * plotW)
    const y = (v: number) => M.top + height - ((v - scale.min) / (scale.max - scale.min)) * height
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
    const area = points.length
      ? hasBand
        ? `${points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.hi ?? p.v).toFixed(1)}`).join('')}${[...points]
            .reverse()
            .map((p) => `L${x(p.t).toFixed(1)},${y(p.lo ?? p.v).toFixed(1)}`)
            .join('')}Z`
        : `${line}L${x(t1).toFixed(1)},${y(scale.min).toFixed(1)}L${x(t0).toFixed(1)},${y(scale.min).toFixed(1)}Z`
      : ''
    const tickCount = Math.max(2, Math.min(6, Math.floor(plotW / 110)))
    const xTicks = points.length > 1 ? Array.from({ length: tickCount }, (_, i) => t0 + ((t1 - t0) * i) / (tickCount - 1)) : []
    return { plotW, scale, x, y, line, area, xTicks, t0, t1 }
  }, [points, thresholds, softMin, softMax, width, height, hasBand])

  const calcs = useMemo(() => {
    if (!points.length) return null
    const vs = points.map((p) => p.v)
    return {
      min: Math.min(...points.map((p) => p.lo ?? p.v)),
      max: Math.max(...points.map((p) => p.hi ?? p.v)),
      mean: vs.reduce((a, b) => a + b, 0) / vs.length,
      last: vs[vs.length - 1],
    }
  }, [points])

  const svgH = M.top + height + M.bottom
  const empty = points.length < 2
  const hovered = hover !== null && !empty ? points[Math.min(hover, points.length - 1)] : null

  function onMove(e: PointerEvent<SVGRectElement>) {
    if (empty) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    setHover(nearestIndex(points, geo.t0 + frac * (geo.t1 - geo.t0)))
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (empty) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const cur = hover ?? points.length - 1
      setHover(Math.min(points.length - 1, Math.max(0, cur + (e.key === 'ArrowLeft' ? -1 : 1))))
    } else if (e.key === 'Escape') setHover(null)
  }

  const levelOf = (v: number) => {
    const breached = thresholds
      .filter((t) => (t.label.toLowerCase().includes('low') ? v <= t.value : v >= t.value))
      .sort((a) => (a.tone === 'critical' ? -1 : 1))
    return breached[0]
  }

  return (
    <section className={`overflow-hidden rounded-[5px] border bg-card ${alarm ? 'border-red' : 'border-line'}`} aria-labelledby={titleId}>
      <header className="flex h-9 items-center gap-2 border-b border-line bg-elev px-3">
        <b id={titleId} className="min-w-0 flex-1 truncate text-[12px] font-bold">{title}</b>
        {headerRight}
        <div className="seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')} title="Chart view">
            <Icon name="chart" size={13} />
          </button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} title="Table view">
            <Icon name="table" size={13} />
          </button>
        </div>
      </header>

      {view === 'chart' ? (
        <div ref={wrapRef} className="relative px-1 pt-2">
          <div
            tabIndex={empty ? -1 : 0}
            onKeyDown={onKey}
            onFocus={() => !empty && setHover(points.length - 1)}
            onBlur={() => setHover(null)}
            className="rounded outline-offset-[-2px]"
            aria-label={
              empty || !calcs
                ? `${title}: ${emptyText}`
                : `${title}. Last ${fmt(calcs.last)} ${unit}, min ${fmt(calcs.min)}, max ${fmt(calcs.max)}. Use arrow keys to read values.`
            }
            role="img"
          >
            <svg width={width} height={svgH} className="block" style={{ touchAction: 'pan-y' }}>
              {geo.scale.ticks.map((v) => (
                <g key={v}>
                  <line
                    x1={M.left}
                    x2={width - M.right}
                    y1={geo.y(v)}
                    y2={geo.y(v)}
                    stroke={v === geo.scale.min ? 'var(--sc-border)' : 'var(--sc-hair)'}
                    strokeWidth={1}
                  />
                  <text x={M.left - 8} y={geo.y(v) + 3} textAnchor="end" fontSize={10} fontFamily="var(--font-mono)" fill="var(--sc-t3)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {v.toFixed(geo.scale.decimals)}
                  </text>
                </g>
              ))}

              {empty ? (
                <text x={M.left + geo.plotW / 2} y={M.top + height / 2} textAnchor="middle" fontSize={12} fill="var(--sc-t3)">
                  {emptyText}
                </text>
              ) : (
                <>
                  <path d={geo.area} fill={fill} />
                  {thresholds.map((t) => (
                    <g key={t.label}>
                      <line
                        x1={M.left}
                        x2={width - M.right}
                        y1={geo.y(t.value)}
                        y2={geo.y(t.value)}
                        stroke={t.tone === 'critical' ? 'var(--sc-red)' : 'var(--sc-amber)'}
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                      />
                      <text x={width - M.right - 2} y={geo.y(t.value) - 4} textAnchor="end" fontSize={9} fontWeight={700} fill="var(--sc-t3)">
                        {t.label} {t.value}
                      </text>
                    </g>
                  ))}
                  <path d={geo.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {live && calcs && (
                    <circle cx={geo.x(geo.t1)} cy={geo.y(calcs.last)} r={4.5} fill={levelOf(calcs.last) ? (levelOf(calcs.last)!.tone === 'critical' ? 'var(--sc-red)' : 'var(--sc-amber)') : color} stroke="var(--sc-card)" strokeWidth={2} />
                  )}
                  {geo.xTicks.map((t, i) => (
                    <text
                      key={t}
                      x={geo.x(t)}
                      y={M.top + height + 16}
                      textAnchor={i === 0 ? 'start' : i === geo.xTicks.length - 1 ? 'end' : 'middle'}
                      fontSize={10}
                      fontFamily="var(--font-mono)"
                      fill="var(--sc-t3)"
                    >
                      {timeFormat === 'days' ? dayLabel(t) : clock(t, timeFormat === 'seconds')}
                    </text>
                  ))}
                  {hovered && (
                    <g pointerEvents="none">
                      <line x1={geo.x(hovered.t)} x2={geo.x(hovered.t)} y1={M.top} y2={M.top + height} stroke="var(--sc-t3)" strokeWidth={1} />
                      <circle cx={geo.x(hovered.t)} cy={geo.y(hovered.v)} r={4.5} fill={color} stroke="var(--sc-card)" strokeWidth={2} />
                    </g>
                  )}
                </>
              )}
              <rect
                x={M.left}
                y={M.top}
                width={Math.max(0, geo.plotW)}
                height={height}
                fill="transparent"
                onPointerMove={onMove}
                onPointerDown={onMove}
                onPointerLeave={() => setHover(null)}
              />
            </svg>
          </div>

          {hovered && (
            <div
              className="pointer-events-none absolute top-3 z-10 min-w-[132px] rounded-md border border-line bg-card px-3 py-2"
              style={geo.x(hovered.t) > width / 2 ? { right: width - geo.x(hovered.t) + 14 } : { left: geo.x(hovered.t) + 14 }}
            >
              <p className="font-mono text-[10px] text-t3">{fmtTime(hovered.t)}</p>
              <p className="mt-1 flex items-center gap-2">
                <span className="h-[2px] w-3 flex-none rounded" style={{ background: color }} />
                <b className="text-[15px] text-t1 tabular-nums">{fmt(hovered.v)}</b>
                <span className="text-[11px] text-t2">{unit}</span>
              </p>
              {hovered.lo !== undefined && (
                <p className="mt-0.5 text-[11px] text-t2 tabular-nums">range {fmt(hovered.lo)}–{fmt(hovered.hi!)}</p>
              )}
              {levelOf(hovered.v) && <p className="mt-1 text-[10px] font-bold text-t2">Past {levelOf(hovered.v)!.label.toLowerCase()}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="max-h-[260px] overflow-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-elev">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-extrabold tracking-wide text-t3 uppercase">Time</th>
                <th className="px-3 py-2 text-right text-[10px] font-extrabold tracking-wide text-t3 uppercase">{hasBand ? `Mean (${unit})` : unit}</th>
                {hasBand && <th className="px-3 py-2 text-right text-[10px] font-extrabold tracking-wide text-t3 uppercase">Min–max</th>}
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().slice(0, 120).map((p) => (
                <tr key={p.t} className="border-t border-hair">
                  <td className="px-3 py-1.5 font-mono text-t2">{fmtTime(p.t)}</td>
                  <td className="px-3 py-1.5 text-right font-bold text-t1 tabular-nums">{fmt(p.v)}</td>
                  {hasBand && <td className="px-3 py-1.5 text-right text-t2 tabular-nums">{fmt(p.lo!)}–{fmt(p.hi!)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {empty && <p className="px-3 py-6 text-center text-[12px] text-t3">{emptyText}</p>}
        </div>
      )}

      {calcs && (
        <div className="overflow-x-auto border-t border-hair px-3 py-2">
          <table className="w-full min-w-[300px] text-[11px]">
            <thead>
              <tr className="text-[9px] font-extrabold tracking-[0.8px] text-t3 uppercase">
                <th className="text-left font-extrabold">Series</th>
                <th className="w-14 text-right font-extrabold">Min</th>
                <th className="w-14 text-right font-extrabold">Max</th>
                <th className="w-14 text-right font-extrabold">Mean</th>
                <th className="w-14 text-right font-extrabold">Last</th>
              </tr>
            </thead>
            <tbody>
              <tr className="tabular-nums">
                <td className="py-1 text-left font-semibold text-t2">
                  <span className="mr-2 inline-block h-[3px] w-3 translate-y-[-3px] rounded-sm align-middle" style={{ background: color }} />
                  {title.split(' — ')[0]} ({unit})
                </td>
                <td className="text-right font-bold text-t2">{fmt(calcs.min)}</td>
                <td className="text-right font-bold text-t2">{fmt(calcs.max)}</td>
                <td className="text-right font-bold text-t2">{calcs.mean.toFixed(Math.max(decimals, 1))}</td>
                <td className="text-right font-bold text-t1">{fmt(calcs.last)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {source && (
        <footer className="flex justify-between gap-2 border-t border-hair px-3 py-1.5 text-[10px] font-medium text-t3">
          <span>{source}</span>
          {hasBand && <span>Line = mean · fill = min–max</span>}
        </footer>
      )}
    </section>
  )
}
