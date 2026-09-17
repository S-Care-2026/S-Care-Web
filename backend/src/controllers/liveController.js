import { getLiveDevice, getLiveDevices, getRecentEvents } from "../services/latest.js";

// GET /api/live/devices — Latest data each band reported over MQTT (debugging aid)
export const listLiveDevices = (req, res) => {
  const devices = getLiveDevices();
  res.json({ success: true, count: devices.length, data: devices });
};

// GET /api/live/devices/:uid — Latest data from one band
export const getLiveDeviceByUid = (req, res) => {
  const device = getLiveDevice(req.params.uid);
  if (!device) {
    return res.status(404).json({ success: false, error: "No data from this device yet" });
  }
  res.json({ success: true, data: device });
};

// GET /api/live/events — Most recent fall/SOS events received since the server started, newest first
export const listLiveEvents = (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const events = getRecentEvents(limit);
  res.json({ success: true, count: events.length, data: events });
};
