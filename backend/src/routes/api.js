import { Router } from "express";
import {
  getAlerts,
  getAlertStats,
  createAlert,
} from "../controllers/alertController.js";
import {
  getDevices,
  getDeviceById,
  scanDevice,
  getDeviceHealth,
  getDashboard,
} from "../controllers/deviceController.js";
import {
  listLiveDevices,
  getLiveDeviceByUid,
  listLiveEvents,
} from "../controllers/liveController.js";
import { getMqttStatus } from "../mqtt/subscriber.js";

const router = Router();

// Stays 200 while the broker is unreachable, so Render doesn't restart the API over it.
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "S-Care Backend",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mqtt: getMqttStatus(),
  });
});

router.get("/dashboard", getDashboard);

router.get("/alerts", getAlerts);
router.get("/alerts/stats", getAlertStats);
router.post("/alerts", createAlert);

router.get("/devices", getDevices);
router.get("/devices/:id", getDeviceById);
router.get("/devices/:id/health", getDeviceHealth);
router.post("/devices/scan", scanDevice);

router.get("/live/devices", listLiveDevices);
router.get("/live/devices/:uid", getLiveDeviceByUid);
router.get("/live/events", listLiveEvents);

export default router;
