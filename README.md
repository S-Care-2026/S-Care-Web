# S-Care Web

> **IoT Smart Wearable Platform for Elderly Care** — Real-time health monitoring, fall detection & emergency alerting.

S-Care is an end-to-end system built around a smart wearable device designed for elderly people. It continuously monitors vital signs (Heart Rate, SpO2), detects falls using accelerometer data, and provides an SOS button for emergencies. This repository contains the **Web Dashboard** and **Backend API** that power the monitoring and management experience.

---

## Features

- **Real-time Dashboard** — Live overview of all connected devices, patient vitals, and system status
- **Health Monitoring** — Continuous Heart Rate & SpO2 tracking with historical charts
- **Fall Detection & SOS Alerts** — Multi-layer verification with instant caregiver notifications
- **QR Device Registration** — Scan to pair and register new wearable devices
- **Location Tracking** — GPS-based patient location on map
- **Time-Series Analytics** — Long-term health trend analysis via InfluxDB

---

## System Architecture

The wearable never talks to the database directly, and it never calls the backend over plain HTTP either. It **publishes to an MQTT broker**, and a subscriber on the backend does the writing. On a device that pays for cellular data by the byte, one persistent, lightweight MQTT connection is dramatically cheaper than polling or POSTing over HTTP — no repeated TCP/TLS handshakes, tiny fixed-size packets, and a QoS layer built for flaky connections. It also decouples the two sides: the ESP32 keeps publishing even while the backend restarts or redeploys, and the broker holds the messages until a subscriber is listening again.

```text
┌─────────────────────────────────────────────┐
│     Wearable Hardware (LilyGO TTGO T-Call)  │
│  ┌─────────────┐  ┌────────────────────┐    │
│  │  MPU6050     │  │  MAX30102          │    │
│  │  Accel/Gyro  │  │  Heart Rate / SpO2 │    │
│  └─────────────┘  └────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  SOS Button (GPIO Interrupt)        │    │
│  └─────────────────────────────────────┘    │
│  Connectivity: Wi-Fi + M2M SIM (Cellular)   │
└──────────────┬──────────────┬───────────────┘
               │              │
      publish  │              │  SOS only — independent
   (Wi-Fi, MQTT)              │  of Wi-Fi/broker
               │              │
               ▼              ▼
     ┌───────────────────┐  ┌──────────────────┐
     │   MQTT Broker      │  │ Emergency        │
     │ (e.g. Mosquitto /  │  │ Contacts (SMS)   │
     │  HiveMQ / EMQX)    │  └──────────────────┘
     └─────────┬──────────┘
               │ subscribe
               ▼
   ┌─────────────────────────────┐
   │  S-Care Backend             │
   │  (Express.js REST API  +    │
   │   MQTT subscriber worker)   │
   │  Hosted on Render           │
   └────┬────────┬────────┬──────┘
        │        │        │
        ▼        ▼        ▼
   ┌────────┐ ┌──────────┐ ┌───────────────┐
   │ Postgre│ │ InfluxDB │ │    Redis      │
   │ SQL    │ │ Cloud    │ │    Cache      │
   │(RDBMS) │ │(Timeseri)│ │  & Pub/Sub    │
   └────────┘ └──────────┘ └───────────────┘
        │          │              │
        └──────────┴──────────────┘
                   │
                   ▼
┌───────────────────────────────────────────┐
│   Web Dashboard                            │
│   Public: Home, About                      │
│   Behind login: Dashboard, Alerts, Devices │
│   React + Vite + Tailwind CSS v4 + TS      │
└───────────────────────────────────────────┘
```

**Why a broker instead of raw HTTP/SMS for telemetry:**

- **Cost** — one open MQTT connection replaces a new HTTP request (and TLS handshake) per reading, which matters directly on a metered M2M SIM plan and saves battery/radio time on the ESP32.
- **Decoupling** — the subscriber can restart, redeploy, or briefly fall behind without the wearable losing data; the broker (with a persistent session/QoS 1) holds messages until the backend is ready again.
- **Fan-out** — the same `device/{id}/vitals` and `device/{id}/alerts` topics can be subscribed to by more than one consumer later (e.g. the storage writer and a real-time WebSocket bridge to the dashboard) without the device knowing or caring.
- **SMS stays separate on purpose** — the SOS button also fires a direct SMS over the cellular SIM to emergency contacts, independent of Wi-Fi and the broker, as a fallback for when connectivity itself is the problem.

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **React 19** | UI component framework |
| **Vite 8** | Build tool & dev server |
| **TypeScript** | Type-safe development |
| **Tailwind CSS v4** | Utility-first styling |

### Backend
| Technology | Purpose |
|---|---|
| **Node.js + Express 5** | REST API server |
| **MQTT (mqtt.js)** | Subscriber worker — receives telemetry/alerts from the wearable's broker topics |
| **PostgreSQL** | Primary relational database (users, devices, alerts) |
| **InfluxDB Cloud** | Time-series database (heart rate, SpO2 readings) |
| **Redis** | Caching, session store & real-time Pub/Sub |
| **Docker** | Containerized deployment |

### Infrastructure
| Technology | Purpose |
|---|---|
| **MQTT Broker** | Cloud broker (e.g. HiveMQ Cloud / EMQX Cloud) the ESP32 publishes to — cheaper on cellular data than per-reading HTTP calls |
| **Render** | Cloud hosting (Backend + PostgreSQL) |
| **Docker** | Container packaging |
| **GitHub** | Source control & CI/CD |

---

## Project Structure

```
S-Care-Web/
├── frontend/                  # React Web Dashboard
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # Page-level views
│   │   ├── services/          # API client & data fetching
│   │   └── App.tsx            # Root component
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                   # Express API Server
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js          # PostgreSQL connection pool
│   │   ├── controllers/
│   │   │   ├── alertController.js   # Fall/SOS alert logic
│   │   │   └── deviceController.js  # Device & QR scan logic
│   │   ├── routes/
│   │   │   └── api.js         # Consolidated API routes
│   │   └── index.js           # Server entry point
│   ├── .env                   # Environment variables
│   ├── .env.example           # Env template for contributors
│   ├── Dockerfile             # Docker image for Render
│   └── package.json
│
└── database/                  # DB design, schemas & migrations
    ├── README.md              # PostgreSQL + InfluxDB + Redis design plan
    └── postgres/              # Numbered SQL migrations (+ tests/)
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 22
- **npm** ≥ 10
- **Docker** (optional, for containerized backend)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/S-Care-Web.git
cd S-Care-Web
```

### 2. Run the Backend

```bash
cd backend
cp .env.example .env          # Configure your environment variables
npm install
npm run migrate               # Create/update the Postgres schema (uses DATABASE_URL_UNPOOLED)
npm run db:seed               # Optional: demo data + the "S-Care Test Lab" facility with band SC-DEV-101 — development databases only
npm run db:create-user -- --email you@example.org --name "Your Name" --role admin --facility "S-Care Test Lab"
npm run dev                   # Starts on http://localhost:3001
```

New bands are registered with `npm run db:provision-device -- --count 5` (set `APP_URL` to the dashboard's address first). Each gets a random id, a pairing code and a broker password; the QR label and a sheet with the HiveMQ credential settings are written to `backend/provisioned/`, which is git-ignored — hand them over and delete them.

The backend subscribes to the MQTT broker and stores every reading: alerts in PostgreSQL, samples in InfluxDB, the latest reading per band in Redis. `db:create-user` takes the password from `NEW_USER_PASSWORD`, or generates one and prints it once.

Check the whole path with a simulated band: `BAND_PASSWORD=… BACKEND_URL=http://localhost:3001 API_EMAIL=… API_PASSWORD=… npm run test:band`.

#### Available API Endpoints

Everything except `/api/health` and `/api/auth/login` needs `Authorization: Bearer <token>` from the login response. Data is limited to the signed-in user's facility (and, for family accounts, their patients).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check: MQTT connection and which stores are configured |
| `POST` | `/api/auth/login` | `{ email, password }` → `{ token, user }` (token valid 12 h) |
| `POST` | `/api/auth/register` | `{ fullName, email, password, homeName? }` → creates the account and its home, returns `{ token, user }` |
| `GET` | `/api/auth/me` | The signed-in user |
| `POST` | `/api/auth/password` | `{ currentPassword, newPassword }` → `{ token }`; other sessions are signed out |
| `POST` | `/api/devices/pair` | `{ deviceUid, claimCode, patientId \| newPatient }` — claim and assign a band |
| `POST` | `/api/devices/:uid/unpair` | End the band's assignment (it stays with the facility) |
| `GET` | `/api/facility/snapshot` | Patients, bands, latest vitals, 30-min sample buffers, alerts, contacts, thresholds — what the dashboard polls |
| `PUT` | `/api/facility/thresholds` | Facility default thresholds *(admin)* |
| `GET` | `/api/patients/:id/history?vital=hr\|spo2&range=1h\|6h\|24h\|7d` | Chart buckets from InfluxDB |
| `PUT` | `/api/patients/:id/thresholds` | Per-patient override; `{}` clears it *(admin)* |
| `POST` | `/api/patients/:id/contacts` | Add an emergency contact (republishes the band's config) |
| `PATCH` / `DELETE` | `/api/contacts/:id` | Change SOS/fall notifications, or remove |
| `POST` | `/api/contacts/:id/move` | `{ dir: -1 \| 1 }` — reorder |
| `POST` | `/api/alerts` | Raise an alert by hand (`{ patientId, type, notes }`) |
| `POST` | `/api/alerts/:id/acknowledge` · `/resolve` · `/cancel` | Handle an alert |
| `GET` | `/api/live/devices`, `/api/live/devices/:uid`, `/api/live/events` | Raw latest MQTT data, for debugging |

### 3. Run the Frontend

```bash
cd frontend
npm install
npm run dev                   # Starts on http://localhost:5173
```

The dashboard has two data sources, chosen on the sign-in page or in **Settings → Data source** (switching signs you out):

- **Demo data** — an in-browser simulator: live vitals, the alert rule engine, the fall countdown and QR pairing all work without the backend. Sign in with `caregiver@scare.demo` / `demo1234` or `admin@scare.demo` / `admin1234`; see [`frontend/README.md`](frontend/README.md) for things to try.
- **Real bands** — data from the backend at `VITE_API_URL` (see `frontend/.env.example`; required for deployed builds). Create an account on the sign-in page, then pair a band by scanning its QR label; care-home staff use accounts made by `npm run db:create-user`.

### 4. Run with Docker (Backend)

```bash
cd backend
docker build -t scare-backend .
docker run -p 3001:3001 --env-file .env scare-backend
```

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
PORT=3001
NODE_ENV=development
# Neon: pooled URL for the API, direct URL for migrations
DATABASE_URL=postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/scare_db?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://user:password@ep-xxx.region.aws.neon.tech/scare_db?sslmode=require
JWT_SECRET=your_jwt_secret_here

# Redis (Upstash, TCP URL) and InfluxDB Cloud Serverless — see backend/.env.example
REDIS_URL=rediss://default:your_password@your-db-name.upstash.io:6379
INFLUX_HOST=https://your-region.aws.cloud2.influxdata.com
INFLUX_TOKEN=your_influx_api_token
INFLUX_DATABASE=scare_raw

# MQTT broker the wearables publish to — the backend subscribes as a client
MQTT_BROKER_URL=mqtts://broker.example.com:8883
MQTT_USERNAME=your_broker_username
MQTT_PASSWORD=your_broker_password
MQTT_TOPIC_PREFIX=scare/devices
```

---

## Team

S-Care — built for elderly care.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.