// ──────────────────────────────────────────────────────────────
// alertController.js — Fall detection & SOS alert logic
// Generates random demo data when no real DB is connected
// ──────────────────────────────────────────────────────────────

// Helper: generate random demo alerts
function generateDemoAlerts(count = 20) {
  const types = ["FALL", "SOS", "HEART_RATE", "SPO2"];
  const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const statuses = ["PENDING", "ACKNOWLEDGED", "RESOLVED"];
  const names = [
    "Nguyễn Văn An",
    "Trần Thị Bình",
    "Lê Văn Cường",
    "Phạm Thị Dung",
    "Hoàng Văn Em",
  ];

  const alerts = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const createdAt = new Date(
      now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)
    );

    alerts.push({
      id: i + 1,
      device_id: `SCARE-${String(Math.floor(Math.random() * 5) + 1).padStart(3, "0")}`,
      patient_name: names[Math.floor(Math.random() * names.length)],
      alert_type: type,
      severity: severities[Math.floor(Math.random() * severities.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      message: `${type === "FALL" ? "Phát hiện ngã" : type === "SOS" ? "Nút SOS được nhấn" : type === "HEART_RATE" ? "Nhịp tim bất thường" : "SpO2 thấp"} — ${names[Math.floor(Math.random() * names.length)]}`,
      heart_rate: type === "HEART_RATE" ? Math.floor(Math.random() * 60) + 40 : Math.floor(Math.random() * 40) + 60,
      spo2: type === "SPO2" ? Math.floor(Math.random() * 10) + 85 : Math.floor(Math.random() * 5) + 95,
      latitude: 10.762622 + (Math.random() - 0.5) * 0.05,
      longitude: 106.660172 + (Math.random() - 0.5) * 0.05,
      created_at: createdAt.toISOString(),
      resolved_at:
        statuses[Math.floor(Math.random() * statuses.length)] === "RESOLVED"
          ? new Date(createdAt.getTime() + Math.random() * 3600000).toISOString()
          : null,
    });
  }

  return alerts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// GET /api/alerts — List all alerts
export const getAlerts = (req, res) => {
  try {
    const alerts = generateDemoAlerts(30);
    res.json({
      success: true,
      count: alerts.length,
      data: alerts,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/alerts/stats — Alert statistics
export const getAlertStats = (req, res) => {
  try {
    const alerts = generateDemoAlerts(100);
    const stats = {
      total: alerts.length,
      by_type: {},
      by_severity: {},
      by_status: {},
      recent_24h: 0,
    };

    const now = Date.now();
    alerts.forEach((a) => {
      stats.by_type[a.alert_type] = (stats.by_type[a.alert_type] || 0) + 1;
      stats.by_severity[a.severity] = (stats.by_severity[a.severity] || 0) + 1;
      stats.by_status[a.status] = (stats.by_status[a.status] || 0) + 1;
      if (now - new Date(a.created_at).getTime() < 86400000) stats.recent_24h++;
    });

    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/alerts — Create new alert (simulated)
export const createAlert = (req, res) => {
  try {
    const { device_id, alert_type, message } = req.body;
    const newAlert = {
      id: Date.now(),
      device_id: device_id || "SCARE-001",
      alert_type: alert_type || "FALL",
      severity: "HIGH",
      status: "PENDING",
      message: message || "Phát hiện ngã",
      created_at: new Date().toISOString(),
    };
    res.status(201).json({ success: true, data: newAlert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
