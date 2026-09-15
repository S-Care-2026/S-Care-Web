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
npm run dev                   # Starts on http://localhost:3001
```

The backend runs in demo mode with random generated data — no database connection required for development.

#### Available API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/dashboard` | Aggregated dashboard data |
| `GET` | `/api/alerts` | List all alerts |
| `GET` | `/api/alerts/stats` | Alert statistics |
| `POST` | `/api/alerts` | Create new alert |
| `GET` | `/api/devices` | List all devices |
| `GET` | `/api/devices/:id` | Device detail + health history |
| `GET` | `/api/devices/:id/health` | 24h health readings |
| `POST` | `/api/devices/scan` | Register device via QR |

### 3. Run the Frontend

```bash
cd frontend
npm install
npm run dev                   # Starts on http://localhost:5173
```

Until real bands are connected, the dashboard runs on an in-browser simulator — live vitals, the alert rule engine, the fall countdown and QR pairing all work without the backend. Sign in with `caregiver@scare.demo` / `demo1234` or `admin@scare.demo` / `admin1234`; see [`frontend/README.md`](frontend/README.md) for things to try.

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
DATABASE_URL=postgresql://user:password@localhost:5432/scare_db
JWT_SECRET=your_jwt_secret_here

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