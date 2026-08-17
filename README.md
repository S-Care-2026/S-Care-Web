# S-Care Web

> **IoT Smart Wearable Platform for Elderly Care** — Real-time health monitoring, fall detection & emergency alerting.

S-Care is an end-to-end system built around a smart wearable device designed for elderly people. It continuously monitors vital signs (Heart Rate, SpO2), detects falls using accelerometer data, and provides an SOS button for emergencies. This repository contains the **Web Dashboard** and **Backend API** that power the monitoring and management experience.

---

## ✨ Features

- 📊 **Real-time Dashboard** — Live overview of all connected devices, patient vitals, and system status
- 🫀 **Health Monitoring** — Continuous Heart Rate & SpO2 tracking with historical charts
- 🚨 **Fall Detection & SOS Alerts** — Multi-layer verification with instant caregiver notifications
- 📱 **QR Device Registration** — Scan to pair and register new wearable devices
- 🗺️ **Location Tracking** — GPS-based patient location on map
- 📈 **Time-Series Analytics** — Long-term health trend analysis via InfluxDB

---

## 🏗️ System Architecture

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
    ┌──────────▼──┐    ┌──────▼──────────┐
    │  HTTP/MQTT  │    │  SMS Direct     │
    │  (Wi-Fi)    │    │  (Cellular)     │
    └──────┬──────┘    └──────┬──────────┘
           │                  │
           ▼                  ▼
┌─────────────────────┐  ┌──────────────────┐
│  S-Care Backend     │  │ Emergency        │
│  (Express.js)       │  │ Contacts (SMS)   │
│  Hosted on Render   │  └──────────────────┘
└────┬────┬────┬──────┘
     │    │    │
     ▼    ▼    ▼
┌────────┐ ┌──────────┐ ┌───────────────┐
│ Postgre│ │ InfluxDB │ │    Redis      │
│ SQL    │ │ Cloud    │ │    Cache      │
│(RDBMS) │ │(Timeseri)│ │  & Pub/Sub   │
└────────┘ └──────────┘ └───────────────┘
     │          │              │
     └──────────┴──────────────┘
                │
                ▼
┌──────────────────────────────────┐
│   Web Dashboard                  │
│   React + Vite + Tailwind CSS v4 │
│   TypeScript                     │
└──────────────────────────────────┘
```

---

## 🛠️ Tech Stack

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
| **PostgreSQL** | Primary relational database (users, devices, alerts) |
| **InfluxDB Cloud** | Time-series database (heart rate, SpO2 readings) |
| **Redis** | Caching, session store & real-time Pub/Sub |
| **Docker** | Containerized deployment |

### Infrastructure
| Technology | Purpose |
|---|---|
| **Render** | Cloud hosting (Backend + PostgreSQL) |
| **Docker** | Container packaging |
| **GitHub** | Source control & CI/CD |

---

## 📁 Project Structure

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
└── database/                  # DB schemas & migrations
```

---

## 🚀 Getting Started

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

### 4. Run with Docker (Backend)

```bash
cd backend
docker build -t scare-backend .
docker run -p 3001:3001 --env-file .env scare-backend
```

---

## ⚙️ Environment Variables

Create a `.env` file in the `backend/` directory:

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/scare_db
JWT_SECRET=your_jwt_secret_here
```

---

## 👥 Team

S-Care — Built with ❤️ for elderly care.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.