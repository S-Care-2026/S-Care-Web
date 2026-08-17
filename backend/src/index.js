// ──────────────────────────────────────────────────────────────
// index.js — S-Care Backend Entry Point
// ──────────────────────────────────────────────────────────────
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRouter from "./routes/api.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Request logger (dev) ──
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── API Routes ──
app.use("/api", apiRouter);

// ── Root ──
app.get("/", (req, res) => {
  res.json({
    service: "S-Care Backend API",
    version: "1.0.0",
    docs: "/api/health",
    endpoints: [
      "GET  /api/health",
      "GET  /api/dashboard",
      "GET  /api/alerts",
      "GET  /api/alerts/stats",
      "POST /api/alerts",
      "GET  /api/devices",
      "GET  /api/devices/:id",
      "GET  /api/devices/:id/health",
      "POST /api/devices/scan",
    ],
  });
});

// ── 404 handler ──
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// ── Start server ──
app.listen(PORT, () => {
  console.log(`🚀 S-Care Backend running on http://localhost:${PORT}`);
  console.log(`📋 API docs: http://localhost:${PORT}/api/health`);
});
