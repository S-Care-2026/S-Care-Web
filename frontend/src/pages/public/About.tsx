import { Link } from 'react-router'
import { useAuth } from '../../auth/context'
import { Icon, type IconName } from '../../components/Icon'

const ARCH: { icon: IconName; title: string; body: string }[] = [
  { icon: 'watch', title: 'Wearable band', body: 'MPU6050 accel/gyro + MAX30102 heart-rate/SpO₂ + SOS button, on an ESP32 with Wi-Fi and an M2M SIM.' },
  { icon: 'hub', title: 'MQTT broker', body: 'The band publishes vitals and events to topics over one lightweight persistent connection instead of an HTTP request per reading.' },
  { icon: 'database', title: 'Backend subscriber', body: 'Express service subscribed to the broker’s topics, fanning each reading out to Postgres, InfluxDB and Redis.' },
  { icon: 'monitor', title: 'Web dashboard', body: 'Caregivers watch readings and alerts land, seconds after the band sends them.' },
]

const MONITOR: { icon: IconName; title: string; body: string }[] = [
  { icon: 'heart', title: 'Vitals', body: 'Heart rate and blood oxygen, charted continuously against thresholds tuned for elderly patients.' },
  { icon: 'fall', title: 'Falls', body: 'Impact patterns cross-checked on the band, then a 15-second window for the wearer to cancel before anyone is alerted.' },
  { icon: 'bell', title: 'SOS presses', body: 'A held button reaches the dashboard and the emergency contact’s phone, over two independent paths.' },
]

export function About() {
  const { user } = useAuth()
  return (
    <div className="mx-auto max-w-[1312px] px-4 sm:px-8 lg:px-16">
      <header className="flex max-w-[820px] flex-col gap-5 pt-14 pb-12 lg:pt-[76px]">
        <span className="w-fit rounded bg-green-surf px-3 py-1.5 text-[11px] font-extrabold tracking-[1px] text-green uppercase">About the project</span>
        <h1 className="m-0 text-[34px] leading-[1.1] font-extrabold tracking-[-1px] sm:text-[46px] sm:tracking-[-1.3px]">
          A second pair of eyes, for the people who watch over everyone else.
        </h1>
        <p className="max-w-[68ch] text-[16px] leading-[1.65] text-t2">
          S-Care is an end-to-end system built around a smart wearable for elderly people: it continuously monitors heart rate and SpO₂, detects falls from accelerometer data, and puts an SOS button one press away. This site is the caregiver side of it — the web dashboard and the API behind it.
        </p>
      </header>

      <section className="grid gap-10 pb-[72px] md:grid-cols-2 md:gap-14">
        <div className="flex flex-col gap-3.5">
          <h2 className="m-0 text-[22px] font-extrabold tracking-[-0.5px]">Why we built it</h2>
          <p className="max-w-[62ch] text-[14px] leading-[1.7] text-t2">
            Falls and silent medical events are the two things caregivers fear most and notice least in time. A wearable that watches vitals continuously — and calls for help the moment something looks wrong — closes that gap without asking an elderly person to do anything differently.
          </p>
        </div>
        <div className="flex flex-col gap-3.5">
          <h2 className="m-0 text-[22px] font-extrabold tracking-[-0.5px]">What the dashboard does</h2>
          <p className="max-w-[62ch] text-[14px] leading-[1.7] text-t2">
            Every band on the ward reports in, live. Caregivers see a real-time overview of every connected device, a feed of fall and SOS alerts with the context to act on them, and historical vital trends for the checkups that happen after the emergency is over.
          </p>
        </div>
      </section>

      <section className="pb-[72px]">
        <div className="flex flex-col gap-2.5 pb-9">
          <h2 className="m-0 text-[28px] font-extrabold tracking-[-0.7px]">How the system is wired together</h2>
          <p className="max-w-[560px] text-[14px] leading-relaxed text-t2">The band never talks to the database directly. It publishes over MQTT; a subscriber on the backend does the writing.</p>
        </div>
        <div className="card flex flex-col gap-5 rounded-xl p-5 sm:p-7">
          <ol className="m-0 flex list-none flex-col gap-2 p-0 lg:flex-row lg:gap-0">
            {ARCH.map((n, i) => (
              <li key={n.title} className="flex flex-1 flex-col lg:flex-row">
                <div className="flex flex-1 flex-col items-start gap-2.5 rounded-lg border border-hair bg-elev p-[18px]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-card text-green">
                    <Icon name={n.icon} size={17} />
                  </span>
                  <b className="text-[13px]">{n.title}</b>
                  <span className="text-[12px] leading-normal text-t3">{n.body}</span>
                </div>
                {i < ARCH.length - 1 && (
                  <span className="flex h-7 items-center justify-center text-t3 lg:h-auto lg:w-10" aria-hidden="true">
                    <Icon name="chevron-right" size={18} strokeWidth={2.4} className="rotate-90 lg:rotate-0" />
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="border-t border-hair pt-4 text-[13px] leading-relaxed text-t3">
            <b className="text-t2">The SOS button is the one exception:</b> it also fires an SMS straight over the cellular SIM to emergency contacts, independent of Wi-Fi or the broker — a fallback for when connectivity itself is the problem.
          </p>
        </div>
      </section>

      <section className="pb-[72px]">
        <div className="flex flex-col gap-2.5 pb-9">
          <h2 className="m-0 text-[28px] font-extrabold tracking-[-0.7px]">What we monitor</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {MONITOR.map((m) => (
            <div key={m.title} className="card flex flex-col gap-3 p-[22px]">
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-lg bg-green-surf text-green">
                <Icon name={m.icon} size={18} strokeWidth={2.2} />
              </span>
              <b className="text-[14px]">{m.title}</b>
              <p className="text-[13px] leading-[1.55] text-t2">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-[88px] flex flex-col items-start justify-between gap-6 rounded-xl border border-green bg-green-surf px-6 py-10 sm:flex-row sm:items-center sm:px-[52px] sm:py-11">
        <div>
          <h2 className="m-0 text-[24px] font-extrabold tracking-[-0.5px]">See it running</h2>
          <p className="mt-1.5 text-[13px] text-t2">Sign in to the caregiver dashboard.</p>
        </div>
        <Link to={user ? '/dashboard' : '/login'} className="btn btn-primary btn-lg">{user ? 'Open Dashboard' : 'Login to Dashboard'}</Link>
      </section>
    </div>
  )
}
