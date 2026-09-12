# S-Care Web — frontend

React 19 + Vite + TypeScript + Tailwind CSS v4, styled with the **Vital Green** tokens shared with S-Care Mobile (see [`../.design`](../.design)).

No bands are connected yet, so the app runs on an **in-browser simulator** (`src/data/simulator.ts`) that plays the backend: bands publish vitals every 2 s, a rule engine raises and deduplicates alerts, and alert actions behave like the planned API. Nothing needs the backend to be running.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run lint
```

## Demo accounts

| Role | Email | Password | Can |
|---|---|---|---|
| Caregiver | `caregiver@scare.demo` | `demo1234` | Monitor patients, acknowledge and resolve alerts, pair bands, edit contacts |
| Admin | `admin@scare.demo` | `admin1234` | Everything above, plus facility and per-patient alert thresholds |

The login page has one-click buttons for both.

## Routes

| Path | Access | What's there |
|---|---|---|
| `/` · `/about` | public | Landing and About pages |
| `/login` | public | Sign in (no public sign-up) |
| `/dashboard` | signed in | Ward overview, most urgent alert, patient cards with live sparklines |
| `/patients` · `/patients/:id` | signed in | Patient list; live monitor with streaming charts, 1 h–7 d history, band status, test controls, emergency contacts, thresholds |
| `/alerts` | signed in | Filterable alert feed; the detail drawer acknowledges and resolves |
| `/map` | signed in | Campus map with a marker per patient |
| `/settings` | signed in | Facility thresholds, simulator controls, theme, account |

## Things to try

- **Fall countdown** — *Simulate alert* → Fall. The alert waits 15 s for the wearer to cancel (you can simulate the Cancel press), then opens and "texts" emergency contacts.
- **Rule engine** — on a patient page, *Test controls* → *High HR*. After the sustain time (20 s in the demo) a tachycardia warning opens, and it escalates to critical once readings pass the critical bound. Only one active alert per patient per type is ever raised.
- **Offline detection** — switch *Band connected* off. After two missed check-ins an offline alert opens; switch it back on and it resolves itself.
- **Pairing** — *Pair band* on the Patients page, then use a demo code such as `SC-DEV-201`.
- **Charts** — hover or focus a chart for the crosshair tooltip (arrow keys move it), switch to table view, or pause the live stream.

Changes are saved in `localStorage`, so a reload keeps them. *Settings → Reset demo data* starts over.

## Swapping in the real backend

Screens read state through `useSim()` and call actions on `sim` (`src/data/store.ts`). Replacing the simulator with REST calls plus a WebSocket feed keeps the components unchanged. The domain types in `src/lib/types.ts` mirror `database/postgres/001_initial_schema.sql`.
