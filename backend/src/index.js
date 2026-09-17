import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRouter from "./routes/api.js";
import { startSubscriber, stopSubscriber } from "./mqtt/subscriber.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use("/api", apiRouter);

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
      "GET  /api/live/devices",
      "GET  /api/live/devices/:uid",
      "GET  /api/live/events",
    ],
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 S-Care Backend running on http://localhost:${PORT}`);
  console.log(`📋 API docs: http://localhost:${PORT}/api/health`);
  startSubscriber();
});

// Render sends SIGTERM on redeploy; close the MQTT session cleanly first.
async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  await stopSubscriber().catch((err) => console.error(err));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
