// ──────────────────────────────────────────────────────────────
// deviceController.js — Device & QR code scanning logic
// Generates random demo data for devices and health readings
// ──────────────────────────────────────────────────────────────

// Helper: generate demo devices
function generateDemoDevices() {
  const names = [
    "Nguyễn Văn An",
    "Trần Thị Bình",
    "Lê Văn Cường",
    "Phạm Thị Dung",
    "Hoàng Văn Em",
  ];
  const statuses = ["ONLINE", "ONLINE", "ONLINE", "OFFLINE", "WARNING"];

  return names.map((name, i) => ({
    id: i + 1,
    device_id: `SCARE-${String(i + 1).padStart(3, "0")}`,
    patient_name: name,
    status: statuses[i],
    battery: Math.floor(Math.random() * 60) + 40,
    firmware_version: "2.1.3",
    last_seen: new Date(
      Date.now() - Math.floor(Math.random() * 3600000)
    ).toISOString(),
    heart_rate: Math.floor(Math.random() * 30) + 65,
    spo2: Math.floor(Math.random() * 5) + 95,
    temperature: (36 + Math.random() * 1.5).toFixed(1),
    steps_today: Math.floor(Math.random() * 5000) + 1000,
    latitude: 10.762622 + (Math.random() - 0.5) * 0.05,
    longitude: 106.660172 + (Math.random() - 0.5) * 0.05,
    registered_at: new Date(
      Date.now() - Math.floor(Math.random() * 30 * 24 * 3600000)
    ).toISOString(),
  }));
}

// Helper: generate health history for a device
function generateHealthHistory(hours = 24) {
  const readings = [];
  const now = Date.now();

  for (let i = 0; i < hours * 6; i++) {
    // Every 10 minutes
    readings.push({
      timestamp: new Date(now - i * 10 * 60 * 1000).toISOString(),
      heart_rate: Math.floor(Math.random() * 30) + 65,
      spo2: Math.floor(Math.random() * 5) + 95,
      temperature: (36 + Math.random() * 1.5).toFixed(1),
      acceleration: (Math.random() * 2).toFixed(2),
    });
  }

  return readings.reverse();
}

// GET /api/devices — List all devices
export const getDevices = (req, res) => {
  try {
    const devices = generateDemoDevices();
    res.json({
      success: true,
      count: devices.length,
      data: devices,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/devices/:id — Get single device detail
export const getDeviceById = (req, res) => {
  try {
    const devices = generateDemoDevices();
    const device = devices.find(
      (d) => d.device_id === req.params.id || d.id === parseInt(req.params.id)
    );

    if (!device) {
      return res.status(404).json({ success: false, error: "Device not found" });
    }

    res.json({
      success: true,
      data: {
        ...device,
        health_history: generateHealthHistory(24),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/devices/scan — QR code scan registration
export const scanDevice = (req, res) => {
  try {
    const { qr_code } = req.body;
    const deviceId = qr_code || `SCARE-${String(Math.floor(Math.random() * 999) + 1).padStart(3, "0")}`;

    res.status(201).json({
      success: true,
      message: "Thiết bị đã được đăng ký thành công",
      data: {
        device_id: deviceId,
        status: "ONLINE",
        registered_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/devices/:id/health — Health data history
export const getDeviceHealth = (req, res) => {
  try {
    res.json({
      success: true,
      device_id: req.params.id,
      data: generateHealthHistory(24),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/dashboard — Aggregated dashboard data
export const getDashboard = (req, res) => {
  try {
    const devices = generateDemoDevices();
    const onlineCount = devices.filter((d) => d.status === "ONLINE").length;

    res.json({
      success: true,
      data: {
        total_devices: devices.length,
        online_devices: onlineCount,
        offline_devices: devices.length - onlineCount,
        alerts_today: Math.floor(Math.random() * 10) + 2,
        critical_alerts: Math.floor(Math.random() * 3),
        avg_heart_rate: Math.floor(Math.random() * 15) + 70,
        avg_spo2: Math.floor(Math.random() * 3) + 96,
        devices: devices,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
