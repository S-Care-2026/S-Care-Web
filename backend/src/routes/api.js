import { Router } from "express";
import { loginRateLimit, rateLimit, registerRateLimit, requireAuth, requireRole } from "../auth/auth.js";
import { hasPostgres } from "../db/postgres.js";
import { influxStatus } from "../db/influx.js";
import { redisStatus } from "../db/redis.js";
import { getMqttStatus } from "../mqtt/subscriber.js";
import { acknowledgeAlert, cancelAlert, createManualAlert, resolveAlert } from "../controllers/alertController.js";
import { getMe, postChangePassword, postLogin, postRegister } from "../controllers/authController.js";
import { pairDevice, unpairDevice } from "../controllers/deviceController.js";
import { getSnapshot, putFacilityThresholds, putPatientThresholds } from "../controllers/facilityController.js";
import { getLiveDeviceByUid, listLiveDevices, listLiveEvents } from "../controllers/liveController.js";
import { addContact, getHistory, moveContact, removeContact, updateContact } from "../controllers/patientController.js";

const router = Router();
const staff = requireRole("admin", "caregiver");
// Guessing pairing codes: 10 tries per account per 10 minutes.
const pairRateLimit = rateLimit({
  limit: 10,
  windowMs: 10 * 60_000,
  message: "Too many pairing attempts. Wait a few minutes, then check the band’s label.",
  keyOf: (req) => req.user.id,
});

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
router.post("/auth/register", registerRateLimit, postRegister);

// Everything below needs a signed-in user.
router.use(requireAuth);

router.get("/auth/me", getMe);
router.post("/auth/password", loginRateLimit, postChangePassword);
router.get("/facility/snapshot", getSnapshot);
router.put("/facility/thresholds", requireRole("admin"), putFacilityThresholds);

router.get("/patients/:patientId/history", getHistory);
router.put("/patients/:patientId/thresholds", requireRole("admin"), putPatientThresholds);
router.post("/patients/:patientId/contacts", staff, addContact);
router.patch("/contacts/:contactId", staff, updateContact);
router.delete("/contacts/:contactId", staff, removeContact);
router.post("/contacts/:contactId/move", staff, moveContact);

router.post("/devices/pair", staff, pairRateLimit, pairDevice);
router.post("/devices/:uid/unpair", staff, unpairDevice);

router.post("/alerts", staff, createManualAlert);
router.post("/alerts/:alertId/acknowledge", staff, acknowledgeAlert);
router.post("/alerts/:alertId/resolve", staff, resolveAlert);
router.post("/alerts/:alertId/cancel", staff, cancelAlert);

router.get("/live/devices", listLiveDevices);
router.get("/live/devices/:uid", getLiveDeviceByUid);
router.get("/live/events", listLiveEvents);

export default router;
