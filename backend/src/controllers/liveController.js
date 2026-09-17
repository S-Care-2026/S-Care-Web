import { getLiveDevice, getLiveDevices, getRecentEvents } from "../mqtt/liveStore.js";

// GET /api/live/devices — Latest data each band reported over MQTT
export const listLiveDevices = (req, res) => {
  try {
    const devices = getLiveDevices();
    res.json({ success: true, count: devices.length, data: devices });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/live/devices/:uid — Latest data from one band
export const getLiveDeviceByUid = (req, res) => {
  try {
    const device = getLiveDevice(req.params.uid);
    if (!device) {
      return res.status(404).json({ success: false, error: "No data from this device yet" });
    }
    res.json({ success: true, data: device });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/live/events — Most recent fall/SOS events, newest first
export const listLiveEvents = (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const events = getRecentEvents(limit);
    res.json({ success: true, count: events.length, data: events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
