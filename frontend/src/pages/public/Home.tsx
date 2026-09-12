import { Link } from 'react-router'
import { useAuth } from '../../auth/context'
import { Sparkline } from '../../components/charts/Sparkline'
import { Icon, type IconName } from '../../components/Icon'
import { LivePill } from '../../components/ui'
import { useSim } from '../../data/store'
import { isActive } from '../../lib/format'

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'heart', title: 'Heart rate & SpO₂', body: 'Continuous vital monitoring streamed from the band, charted against safe thresholds in real time.' },
  { icon: 'bell', title: 'Fall detection & SOS', body: 'Accelerometer-driven fall alerts with a 15-second cancel window, plus a one-press SOS button.' },
  { icon: 'scan', title: 'QR band pairing', body: 'Scan the code on the back of a band to assign it to a patient in seconds — no manual ids.' },
  { icon: 'pin', title: 'Location & trends', body: 'Where each patient is on the ward map, and how their vitals have moved over days and weeks.' },
]

const FLOW: { icon: IconName; title: string; body: string }[] = [
  { icon: 'watch', title: 'Wearable band', body: 'ESP32 reads MPU6050 & MAX30102 and publishes vitals.' },
  { icon: 'hub', title: 'MQTT broker', body: 'Publish/subscribe over one open connection — cheap on cellular data.' },
  { icon: 'database', title: 'Backend & storage', body: 'A subscriber writes readings to Postgres, InfluxDB and Redis.' },
  { icon: 'monitor', title: 'Web dashboard', body: 'Caregivers watch it live, the instant it lands.' },
]

function WardPreview() {
  const state = useSim()
  const active = state.alerts.filter((a) => isActive(a.status))
  const fall = active.find((a) => a.type === 'fall')
  const worn = state.patients.filter((p) => {
    const d = state.devices.find((x) => x.id === p.deviceId)
    return d?.online && d.worn && state.buffers[p.id]?.hr.length
  })
  const avg = (key: 'hr' | 'spo2') => {
    const vals = worn.map((p) => state.vitals[p.id]?.[key]).filter((v): v is number => typeof v === 'number')
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
  }
  const trend = (() => {
    const bufs = worn.map((p) => state.buffers[p.id].hr.slice(-40))
    const n = Math.min(...bufs.map((b) => b.length))
    return Number.isFinite(n) ? Array.from({ length: n }, (_, i) => bufs.reduce((s, b) => s + b[b.length - n + i].v, 0) / bufs.length) : []
  })()

  return (
    <div className="card flex w-full flex-col gap-3.5 rounded-xl p-5 lg:w-[520px] lg:flex-none" aria-label="Sample ward overview">
      <div className="flex items-center justify-between">
        <b className="text-[13px] font-bold text-t2">Sample ward · anonymised</b>
        <LivePill running={state.running} />
      </div>
      {fall && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red bg-red-surf px-3 py-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-red text-on-red">
            <Icon name="warning" size={15} strokeWidth={2.2} />
          </span>
          <span className="flex flex-col">
            <b className="text-[11px] font-extrabold tracking-[0.4px] text-red">FALL DETECTED</b>
            <span className="text-[11px] font-semibold text-t2">{fall.locationLabel}</span>
          </span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'PATIENTS', value: state.patients.length, cls: 'text-t1' },
          { label: 'ALERTS', value: active.length, cls: 'text-red' },
          { label: 'BANDS ONLINE', value: state.devices.filter((d) => d.online).length, cls: 'text-green' },
        ].map((k) => (
          <div key={k.label} className="flex flex-col gap-0.5 rounded-md border border-hair bg-elev p-2.5">
            <span className="text-[9px] font-bold tracking-[0.2px] text-t3">{k.label}</span>
            <b className={`text-[19px] font-extrabold tracking-[-0.5px] ${k.cls}`}>{k.value}</b>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1 rounded-md border-l-[3px] border-hr bg-elev p-3">
          <span className="text-[9px] font-bold text-t3">AVG HEART RATE</span>
          <b className="text-[16px] font-extrabold text-t1">{avg('hr') ?? '—'} bpm</b>
          <span className="h-6"><Sparkline values={trend} color="var(--sc-hr)" /></span>
        </div>
        <div className="flex flex-col gap-1 rounded-md border-l-[3px] border-spo2 bg-elev p-3">
          <span className="text-[9px] font-bold text-t3">AVG SpO₂</span>
          <b className="text-[16px] font-extrabold text-t1">{avg('spo2') ?? '—'} %</b>
          <span className="text-[11px] text-t3">{worn.length} bands reporting</span>
        </div>
      </div>
    </div>
  )
}

export function Home() {
  const { user } = useAuth()
  const cta = user ? '/dashboard' : '/login'

  return (
    <div className="mx-auto max-w-[1312px] px-4 sm:px-8 lg:px-16">
      <section className="flex flex-col items-center gap-12 py-14 lg:flex-row lg:gap-16 lg:py-[88px]">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <span className="w-fit rounded bg-green-surf px-3 py-1.5 text-[11px] font-extrabold tracking-[1px] text-green uppercase">IoT wearable for elderly care</span>
          <h1 className="m-0 max-w-[600px] text-[38px] leading-[1.08] font-extrabold tracking-[-1.2px] sm:text-[52px] sm:tracking-[-1.6px]">
            Real-time care for the people who <em className="text-green not-italic">raised you</em>.
          </h1>
          <p className="max-w-[480px] text-[16px] leading-relaxed text-t2">
            S-Care pairs a smart wearable band with a caregiver dashboard — continuous heart-rate and SpO₂ monitoring, automatic fall detection, and a one-press SOS button that reaches the people who can help.
          </p>
          <div className="mt-1 flex flex-wrap gap-3">
            <Link to={cta} className="btn btn-primary btn-lg">
              <Icon name="lock" size={17} strokeWidth={2.4} />
              {user ? 'Open Dashboard' : 'Login to Dashboard'}
            </Link>
            <a href="#how-it-works" className="btn btn-outline btn-lg">How it works</a>
          </div>
        </div>
        <WardPreview />
      </section>

      <section className="pb-4">
        <div className="flex flex-col gap-2.5 pb-9">
          <h2 className="m-0 text-[30px] font-extrabold tracking-[-0.8px]">Everything a caregiver needs</h2>
          <p className="max-w-[520px] text-[14px] leading-relaxed text-t2">One dashboard for every band on the ward — the same signal a family member would want to see.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card flex flex-col gap-3.5 p-[22px]">
              <span className="flex h-[42px] w-[42px] items-center justify-center rounded-lg bg-green-surf text-green">
                <Icon name={f.icon} size={20} strokeWidth={2.2} />
              </span>
              <b className="text-[15px]">{f.title}</b>
              <p className="text-[13px] leading-[1.55] text-t2">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 pt-[76px]">
        <div className="flex flex-col gap-2.5 pb-9">
          <h2 className="m-0 text-[30px] font-extrabold tracking-[-0.8px]">How it works</h2>
          <p className="max-w-[560px] text-[14px] leading-relaxed text-t2">The band talks over an MQTT broker, not a raw HTTP round-trip — lighter on the ESP32’s radio and cheaper to run at scale.</p>
        </div>
        <ol className="m-0 flex list-none flex-col items-stretch gap-2 p-0 lg:flex-row lg:gap-0">
          {FLOW.map((n, i) => (
            <li key={n.title} className="flex flex-1 flex-col items-stretch lg:flex-row">
              <div className="card flex flex-1 flex-col gap-3 p-[22px]">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-elev text-green">
                  <Icon name={n.icon} size={19} />
                </span>
                <b className="text-[14px]">{n.title}</b>
                <span className="text-[12px] leading-normal text-t3">{n.body}</span>
              </div>
              {i < FLOW.length - 1 && (
                <span className="flex h-8 items-center justify-center text-t3 lg:h-auto lg:w-12" aria-hidden="true">
                  <Icon name="chevron-right" size={20} strokeWidth={2.4} className="rotate-90 lg:rotate-0" />
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="my-[88px] flex flex-col items-start justify-between gap-6 rounded-xl border border-green bg-green-surf px-6 py-10 sm:flex-row sm:items-center sm:px-14 sm:py-12">
        <div>
          <h2 className="m-0 text-[26px] font-extrabold tracking-[-0.6px]">Ready to keep watch?</h2>
          <p className="mt-1.5 text-[14px] text-t2">Sign in to see every band on the ward, live.</p>
        </div>
        <Link to={cta} className="btn btn-primary btn-lg">{user ? 'Open Dashboard' : 'Login to Dashboard'}</Link>
      </section>
    </div>
  )
}
