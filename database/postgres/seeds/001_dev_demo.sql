-- Development demo data — never load into a database with real patients.
-- Mirrors the frontend simulator (frontend/src/data/seed.ts) so both show the same people.
-- Load with `npm run db:seed` (in backend/). Safe to re-run: fixed ids + ON CONFLICT (primary key) DO NOTHING.
--
-- Id scheme (first block = table):
--   00… facilities  10… zones  20… rooms (suffix = room number)  30… users  40… patients
--   50… devices (suffix = band number)  51… device_assignments  60… emergency_contacts
--   70… alert_thresholds  80… alerts (suffix = ALT number)  81… alert_notifications
--
-- Logins (password_hash is bcrypt, cost 10):
--   admin@scare.demo      / admin1234   Sarah Jenkins, admin
--   caregiver@scare.demo  / demo1234    Jordan Cole, caregiver
--   family@scare.demo     / family1234  Daniel Vance, family (can see Eleanor Vance only)
--   doctor@scare.demo     (no password — an invited user who hasn't set one yet)
--
-- Unclaimed band for testing QR pairing: SC-DEV-107, claim code SCARE-CLAIM-107-DEMO
-- (devices.claim_code_hash = sha256 hex of the claim code).


-- ── Facility, zones, rooms ──

INSERT INTO facilities (id, name, kind, timezone, address) VALUES
  ('00000000-0000-4000-8000-00000000000a', 'Sunrise Care Home', 'care_home', 'Asia/Ho_Chi_Minh', 'District 7, Ho Chi Minh City')
ON CONFLICT (id) DO NOTHING;

INSERT INTO zones (id, facility_id, name) VALUES
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'North Wing'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000a', 'West Wing'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000000a', 'East Wing'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000000a', 'South Wing')
ON CONFLICT (id) DO NOTHING;

INSERT INTO rooms (id, facility_id, zone_id, name) VALUES
  ('20000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001', '204'),
  ('20000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001', '210'),
  ('20000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000002', '112'),
  ('20000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000002', '103'),
  ('20000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000003', '305'),
  ('20000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000004', '108')
ON CONFLICT (id) DO NOTHING;


-- ── Users and access ──

INSERT INTO users (id, email, password_hash, full_name, phone, locale) VALUES
  ('30000000-0000-4000-8000-000000000001', 'admin@scare.demo',
   '$2b$10$WAMZ11sL7KzF40perpoXLO0Zw8RVWn08fh/ZUqThWk56yCEti9iSO', 'Sarah Jenkins', '+15552345678', 'en'),
  ('30000000-0000-4000-8000-000000000002', 'caregiver@scare.demo',
   '$2b$10$W1QHGKnqcPSA.zgPufY.r.PKTkCJmQN8VA7AU3W9TTPTUftJEGKwe', 'Jordan Cole', NULL, 'en'),
  ('30000000-0000-4000-8000-000000000003', 'doctor@scare.demo',
   NULL, 'Dr. Marcus Vance', '+15558765432', 'en'),
  ('30000000-0000-4000-8000-000000000004', 'family@scare.demo',
   '$2b$10$0kc9uIblk4kw9tPAoMp/b.EqvPbt.UNTihzmOIe47QSm/MdEP0CZi', 'Daniel Vance', '+15553456777', 'en')
ON CONFLICT (id) DO NOTHING;

INSERT INTO facility_members (facility_id, user_id, role) VALUES
  ('00000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000001', 'admin'),
  ('00000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000002', 'caregiver'),
  ('00000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000003', 'caregiver'),
  ('00000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000004', 'family')
ON CONFLICT (facility_id, user_id) DO NOTHING;


-- ── Patients ──

INSERT INTO patients (id, facility_id, room_id, full_name, date_of_birth, sex, medical_notes, admitted_at) VALUES
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000204',
   'Eleanor Vance', '1947-05-14', 'female', 'Mild hypertension. Walks the garden courtyard most mornings.', now() - interval '400 days'),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000112',
   'Arthur Pendelton', '1942-02-03', 'male', 'History of falls. Uses a walker; stairs near the West Hallway.', now() - interval '210 days'),
  ('40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000305',
   'Clara Zhang', '1950-08-21', 'female', 'Atrial fibrillation, on anticoagulants.', now() - interval '150 days'),
  ('40000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000108',
   'Robert Kim', '1944-01-30', 'male', 'COPD. Oxygen concentrator at night.', now() - interval '90 days'),
  ('40000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000210',
   'Evelyn Miller', '1938-04-09', 'female', 'Early-stage dementia. Tends to remove the band at night.', now() - interval '60 days'),
  ('40000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000103',
   'Thomas Hayes', '1945-06-17', 'male', 'Recovering from hip surgery.', now() - interval '21 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO patient_access (patient_id, user_id, relationship) VALUES
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'Son')
ON CONFLICT (patient_id, user_id) DO NOTHING;

-- c1 and c2 are staff (linked to their user accounts), c3 is family.
INSERT INTO emergency_contacts (id, patient_id, user_id, name, relationship, phone, priority, notify_on_sos, notify_on_fall) VALUES
  ('60000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Sarah Jenkins',    'Head Nurse',          '+15552345678', 1, true, true),
  ('60000000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'Dr. Marcus Vance', 'Attending Physician', '+15558765432', 2, true, true),
  ('60000000-0000-4000-8000-000000000013', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'Daniel Vance',     'Son',                 '+15553456777', 3, true, false),
  ('60000000-0000-4000-8000-000000000021', '40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'Sarah Jenkins',    'Head Nurse',          '+15552345678', 1, true, true),
  ('60000000-0000-4000-8000-000000000022', '40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Dr. Marcus Vance', 'Attending Physician', '+15558765432', 2, true, true),
  ('60000000-0000-4000-8000-000000000023', '40000000-0000-4000-8000-000000000002', NULL,                                   'Grace Pendelton',  'Daughter',            '+15553456770', 3, true, false),
  ('60000000-0000-4000-8000-000000000031', '40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'Sarah Jenkins',    'Head Nurse',          '+15552345678', 1, true, true),
  ('60000000-0000-4000-8000-000000000032', '40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'Dr. Marcus Vance', 'Attending Physician', '+15558765432', 2, true, true),
  ('60000000-0000-4000-8000-000000000033', '40000000-0000-4000-8000-000000000003', NULL,                                   'Daniel Zhang',     'Son',                 '+15553456763', 3, true, false),
  ('60000000-0000-4000-8000-000000000041', '40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'Sarah Jenkins',    'Head Nurse',          '+15552345678', 1, true, true),
  ('60000000-0000-4000-8000-000000000042', '40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003', 'Dr. Marcus Vance', 'Attending Physician', '+15558765432', 2, true, true),
  ('60000000-0000-4000-8000-000000000043', '40000000-0000-4000-8000-000000000004', NULL,                                   'Grace Kim',        'Daughter',            '+15553456770', 3, true, false),
  ('60000000-0000-4000-8000-000000000051', '40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', 'Sarah Jenkins',    'Head Nurse',          '+15552345678', 1, true, true),
  ('60000000-0000-4000-8000-000000000052', '40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000003', 'Dr. Marcus Vance', 'Attending Physician', '+15558765432', 2, true, true),
  ('60000000-0000-4000-8000-000000000053', '40000000-0000-4000-8000-000000000005', NULL,                                   'Daniel Miller',    'Son',                 '+15553456770', 3, true, false),
  ('60000000-0000-4000-8000-000000000061', '40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000001', 'Sarah Jenkins',    'Head Nurse',          '+15552345678', 1, true, true),
  ('60000000-0000-4000-8000-000000000062', '40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000003', 'Dr. Marcus Vance', 'Attending Physician', '+15558765432', 2, true, true),
  ('60000000-0000-4000-8000-000000000063', '40000000-0000-4000-8000-000000000006', NULL,                                   'Grace Hayes',      'Daughter',            '+15553456770', 3, true, false)
ON CONFLICT (id) DO NOTHING;

-- Facility default: only sustain_seconds differs from the built-in defaults (as in the simulator).
INSERT INTO alert_thresholds (id, facility_id, patient_id, sustain_seconds, updated_by) VALUES
  ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', NULL, 20, '30000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;


-- ── Bands ──

INSERT INTO devices (id, device_uid, label, facility_id, claimed_at, firmware_version, heartbeat_interval_s,
                     config_version, config_acked_version, last_seen_at) VALUES
  ('50000000-0000-4000-8000-000000000101', 'SC-DEV-101', 'S-Care Band Alpha',   '00000000-0000-4000-8000-00000000000a', now() - interval '420 days', '2.1.3', 60, 3, 3, now() - interval '2 seconds'),
  ('50000000-0000-4000-8000-000000000102', 'SC-DEV-102', 'S-Care Band Beta',    '00000000-0000-4000-8000-00000000000a', now() - interval '420 days', '2.1.3', 60, 4, 4, now() - interval '2 seconds'),
  ('50000000-0000-4000-8000-000000000103', 'SC-DEV-103', 'S-Care Band Gamma',   '00000000-0000-4000-8000-00000000000a', now() - interval '420 days', '2.1.3', 60, 2, 2, now() - interval '2 seconds'),
  ('50000000-0000-4000-8000-000000000104', 'SC-DEV-104', 'S-Care Band Delta',   '00000000-0000-4000-8000-00000000000a', now() - interval '420 days', '2.1.2', 60, 5, 5, now() - interval '2 seconds'),
  ('50000000-0000-4000-8000-000000000105', 'SC-DEV-105', 'S-Care Band Epsilon', '00000000-0000-4000-8000-00000000000a', now() - interval '420 days', '2.1.3', 60, 2, 2, now() - interval '4 seconds'),
  ('50000000-0000-4000-8000-000000000106', 'SC-DEV-106', 'S-Care Band Zeta',    '00000000-0000-4000-8000-00000000000a', now() - interval '420 days', '2.0.9', 60, 1, 1, now() - interval '3 hours')
ON CONFLICT (id) DO NOTHING;

INSERT INTO devices (id, device_uid, label, claim_code_hash, firmware_version) VALUES
  ('50000000-0000-4000-8000-000000000107', 'SC-DEV-107', 'S-Care Band Eta',
   encode(sha256(convert_to('SCARE-CLAIM-107-DEMO', 'UTF8')), 'hex'), '2.1.3')
ON CONFLICT (id) DO NOTHING;

INSERT INTO device_assignments (id, facility_id, device_id, patient_id, assigned_at, assigned_by)
SELECT a.id::uuid, '00000000-0000-4000-8000-00000000000a', a.device_id::uuid, p.id, p.admitted_at, '30000000-0000-4000-8000-000000000001'
FROM (VALUES
  ('51000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000001'),
  ('51000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000102', '40000000-0000-4000-8000-000000000002'),
  ('51000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000103', '40000000-0000-4000-8000-000000000003'),
  ('51000000-0000-4000-8000-000000000104', '50000000-0000-4000-8000-000000000104', '40000000-0000-4000-8000-000000000004'),
  ('51000000-0000-4000-8000-000000000105', '50000000-0000-4000-8000-000000000105', '40000000-0000-4000-8000-000000000005'),
  ('51000000-0000-4000-8000-000000000106', '50000000-0000-4000-8000-000000000106', '40000000-0000-4000-8000-000000000006')
) AS a (id, device_id, patient_id)
JOIN patients p ON p.id = a.patient_id::uuid
ON CONFLICT (id) DO NOTHING;


-- ── Alerts ──

INSERT INTO alerts (id, facility_id, patient_id, device_id, type, severity, status, source, device_event_id,
                    occurred_at, received_at, location_label, heart_rate_snapshot, spo2_snapshot, impact_g, details,
                    sms_sent_by_device, acknowledged_at, acknowledged_by, resolved_at, resolved_by, resolution, resolution_notes) VALUES
  -- ALT-901: fall, countdown expired, still open
  ('80000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000002',
   '50000000-0000-4000-8000-000000000102', 'fall', 'critical', 'open', 'device', 'evt-demo-901',
   now() - interval '4 minutes', now() - interval '4 minutes', 'Room 112 • West Wing', 118, 93, 3.8,
   '{"description": "High impact acceleration near the West Hallway stairs. No movement for 40 s after impact.", "countdown_seconds": 15}',
   true, NULL, NULL, NULL, NULL, NULL, NULL),
  -- ALT-902: sustained tachycardia
  ('80000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000003',
   '50000000-0000-4000-8000-000000000103', 'tachycardia', 'warning', 'open', 'rules', NULL,
   now() - interval '22 minutes', now() - interval '22 minutes', 'Room 305 • East Wing', 108, 95, NULL,
   '{"description": "Heart rate held above 100 bpm for 6 minutes at rest (peak 108 bpm).", "peak_hr": 108}',
   false, NULL, NULL, NULL, NULL, NULL, NULL),
  -- ALT-903: low battery, acknowledged
  ('80000000-0000-4000-8000-000000000903', '00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000005',
   '50000000-0000-4000-8000-000000000105', 'low_battery', 'info', 'acknowledged', 'rules', NULL,
   now() - interval '45 minutes', now() - interval '45 minutes', 'Room 210 • North Wing', NULL, NULL, NULL,
   '{"description": "Band at 15%. The charging dock is in the room but the band is undocked.", "battery_pct": 15}',
   false, now() - interval '38 minutes', '30000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL),
  -- ALT-904: SOS, resolved
  ('80000000-0000-4000-8000-000000000904', '00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000101', 'sos', 'critical', 'resolved', 'device', 'evt-demo-904',
   now() - interval '135 minutes', now() - interval '135 minutes', 'Room 204 • North Wing', 86, 98, NULL,
   '{"description": "SOS button held for 3 s."}',
   true, now() - interval '133 minutes', '30000000-0000-4000-8000-000000000001',
   now() - interval '128 minutes', '30000000-0000-4000-8000-000000000001', 'assisted',
   'Pressed SOS for help getting out of bed. Assisted safely, no injury.'),
  -- ALT-905: hypoxemia, resolved
  ('80000000-0000-4000-8000-000000000905', '00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000004',
   '50000000-0000-4000-8000-000000000104', 'hypoxemia', 'warning', 'resolved', 'rules', NULL,
   now() - interval '5 hours', now() - interval '5 hours', 'Room 108 • South Wing', 78, 92, NULL,
   '{"description": "SpO₂ dipped to 92% during the night.", "min_spo2": 92}',
   false, NULL, NULL, now() - interval '280 minutes', '30000000-0000-4000-8000-000000000003', 'assisted',
   'Oxygen concentrator tubing had come loose. Refitted; recovered to 99%.'),
  -- ALT-900: fall cancelled by the wearer — kept as false-alarm data
  ('80000000-0000-4000-8000-000000000900', '00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000004',
   '50000000-0000-4000-8000-000000000104', 'fall', 'critical', 'cancelled', 'device', 'evt-demo-900',
   now() - interval '26 hours', now() - interval '26 hours', 'Room 108 • South Wing', 81, 98, 2.1,
   '{"description": "Possible fall (2.1 g) while sitting down in the dining hall.", "cancelled_after_seconds": 6}',
   false, NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO alert_notifications (id, alert_id, channel, recipient_user_id, emergency_contact_id, destination,
                                 status, attempts, created_at, sent_at, delivered_at)
SELECT n.id::uuid, n.alert_id::uuid, n.channel, n.user_id::uuid, n.contact_id::uuid, n.destination,
       n.status, 1, a.occurred_at, a.occurred_at,
       CASE WHEN n.status = 'delivered' THEN a.occurred_at + interval '2 seconds' END
FROM (VALUES
  ('81000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000901', 'push',       '30000000-0000-4000-8000-000000000002', NULL, NULL, 'delivered'),
  ('81000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000901', 'push',       '30000000-0000-4000-8000-000000000001', NULL, NULL, 'delivered'),
  ('81000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000901', 'sms_device', NULL, '60000000-0000-4000-8000-000000000021', '+15552345678', 'sent'),
  ('81000000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000901', 'sms_device', NULL, '60000000-0000-4000-8000-000000000022', '+15558765432', 'sent'),
  ('81000000-0000-4000-8000-000000000005', '80000000-0000-4000-8000-000000000902', 'push',       '30000000-0000-4000-8000-000000000002', NULL, NULL, 'delivered'),
  ('81000000-0000-4000-8000-000000000006', '80000000-0000-4000-8000-000000000902', 'push',       '30000000-0000-4000-8000-000000000001', NULL, NULL, 'delivered'),
  ('81000000-0000-4000-8000-000000000007', '80000000-0000-4000-8000-000000000903', 'push',       '30000000-0000-4000-8000-000000000001', NULL, NULL, 'delivered'),
  ('81000000-0000-4000-8000-000000000008', '80000000-0000-4000-8000-000000000904', 'push',       '30000000-0000-4000-8000-000000000001', NULL, NULL, 'delivered'),
  ('81000000-0000-4000-8000-000000000009', '80000000-0000-4000-8000-000000000904', 'sms_device', NULL, '60000000-0000-4000-8000-000000000011', '+15552345678', 'sent'),
  ('81000000-0000-4000-8000-000000000010', '80000000-0000-4000-8000-000000000905', 'push',       '30000000-0000-4000-8000-000000000003', NULL, NULL, 'delivered')
) AS n (id, alert_id, channel, user_id, contact_id, destination, status)
JOIN alerts a ON a.id = n.alert_id::uuid
ON CONFLICT (id) DO NOTHING;


-- ── Daily vital summaries ──
-- Up to 90 past days per patient (never before admission), around each patient's
-- simulator baseline, so charts older than InfluxDB's 30-day retention have data.

INSERT INTO daily_vital_summaries (patient_id, day, hr_min, hr_avg, hr_max, spo2_min, spo2_avg, worn_minutes, steps, sample_count)
SELECT p.id,
       d.day,
       b.hr - 12 - floor(random() * 6)::int,
       round((b.hr + random() * 6 - 3)::numeric, 1),
       b.hr + 14 + floor(random() * 10)::int,
       greatest(b.spo2 - 3 - floor(random() * 3)::int, 85),
       round(least(b.spo2 + random() * 1.5 - 0.5, 100)::numeric, 1),
       w.worn,
       b.steps + floor(random() * b.steps * 0.4)::int,
       w.worn * 6
FROM (VALUES
  ('40000000-0000-4000-8000-000000000001',  74, 98, 3500, 1320),
  ('40000000-0000-4000-8000-000000000002', 112, 93, 1200, 1300),
  ('40000000-0000-4000-8000-000000000003', 104, 96, 2500, 1340),
  ('40000000-0000-4000-8000-000000000004',  68, 97, 2000, 1280),
  ('40000000-0000-4000-8000-000000000005',  70, 97, 2800,  900),
  ('40000000-0000-4000-8000-000000000006',  72, 97,  400, 1250)
) AS b (patient_id, hr, spo2, steps, worn_base)
JOIN patients p ON p.id = b.patient_id::uuid
CROSS JOIN LATERAL (
  SELECT generate_series(1, 90) AS days_ago
) g
CROSS JOIN LATERAL (
  SELECT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - g.days_ago) AS day
) d
CROSS JOIN LATERAL (
  SELECT least(b.worn_base + floor(random() * 100)::int, 1440) AS worn
) w
WHERE d.day >= (p.admitted_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
ON CONFLICT (patient_id, day) DO NOTHING;
