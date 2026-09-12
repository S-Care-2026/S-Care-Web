/** "Nice" 1/2/5 axis bounds and ticks, the way Grafana picks them. */
export interface Scale {
  min: number
  max: number
  ticks: number[]
  decimals: number
}

function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range))
  const f = range / 10 ** exp
  let nf: number
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nf * 10 ** exp
}

export function niceScale(dataMin: number, dataMax: number, maxTicks = 5): Scale {
  let lo = dataMin
  let hi = dataMax
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0
    hi = 1
  }
  if (hi - lo < 1e-9) {
    lo -= 1
    hi += 1
  }
  const range = niceNum(hi - lo, false)
  const step = niceNum(range / (maxTicks - 1), true)
  const min = Math.floor(lo / step) * step
  const max = Math.ceil(hi / step) * step
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const ticks: number[] = []
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(decimals)))
  return { min, max, ticks, decimals }
}
