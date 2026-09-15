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

const router = Router();

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "S-Care Backend",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
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

export default router;
