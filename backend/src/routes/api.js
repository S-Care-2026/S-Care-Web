import { Router } from "express";
import { loginRateLimit, requireAuth, requireRole } from "../auth/auth.js";
import { hasPostgres } from "../db/postgres.js";
import { influxStatus } from "../db/influx.js";
import { redisStatus } from "../db/redis.js";
import { getMqttStatus } from "../mqtt/subscriber.js";
import { acknowledgeAlert, cancelAlert, createManualAlert, resolveAlert } from "../controllers/alertController.js";
import { getMe, postLogin } from "../controllers/authController.js";
import { getSnapshot, putFacilityThresholds, putPatientThresholds } from "../controllers/facilityController.js";
import { getLiveDeviceByUid, listLiveDevices, listLiveEvents } from "../controllers/liveController.js";
import { addContact, getHistory, moveContact, removeContact, updateContact } from "../controllers/patientController.js";

const router = Router();
const staff = requireRole("admin", "caregiver");

// Public. Stays 200 while a dependency is down, so Render doesn't restart the API over it,
// and doesn't query Postgres, so frequent health checks don't keep Neon's compute awake.
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "S-Care Backend",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mqtt: getMqttStatus(),
    stores: {
      postgres: hasPostgres() ? "configured" : "disabled",
      influx: influxStatus(),
      redis: redisStatus(),
    },
  });
});

router.post("/auth/login", loginRateLimit, postLogin);

// Everything below needs a signed-in user.
router.use(requireAuth);

router.get("/auth/me", getMe);
router.get("/facility/snapshot", getSnapshot);
router.put("/facility/thresholds", requireRole("admin"), putFacilityThresholds);

router.get("/patients/:patientId/history", getHistory);
router.put("/patients/:patientId/thresholds", requireRole("admin"), putPatientThresholds);
router.post("/patients/:patientId/contacts", staff, addContact);
router.patch("/contacts/:contactId", staff, updateContact);
router.delete("/contacts/:contactId", staff, removeContact);
router.post("/contacts/:contactId/move", staff, moveContact);

router.post("/alerts", staff, createManualAlert);
router.post("/alerts/:alertId/acknowledge", staff, acknowledgeAlert);
router.post("/alerts/:alertId/resolve", staff, resolveAlert);
router.post("/alerts/:alertId/cancel", staff, cancelAlert);

router.get("/live/devices", listLiveDevices);
router.get("/live/devices/:uid", getLiveDeviceByUid);
router.get("/live/events", listLiveEvents);

export default router;
