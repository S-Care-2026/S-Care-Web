-- A separate facility for testing with a real band: "S-Care Test Lab", one patient wearing SC-DEV-101.
-- Signing in with an account of this facility shows only the real band's data on the dashboard.
-- Create that account with `npm run db:create-user` (see backend/scripts/create-user.js); no password lives here.
--
-- SC-DEV-101 is moved here from Sunrise Care Home (001_dev_demo.sql): its assignment to
-- Eleanor Vance is closed, then it is claimed by the Test Lab and assigned to the test patient.
-- Safe to re-run.
--
-- Id scheme follows 001_dev_demo.sql, with facility suffix 0b.

INSERT INTO facilities (id, name, kind, timezone, address) VALUES
  ('00000000-0000-4000-8000-00000000000b', 'S-Care Test Lab', 'care_home', 'Asia/Ho_Chi_Minh', 'Development bench')
ON CONFLICT (id) DO NOTHING;

INSERT INTO zones (id, facility_id, name) VALUES
  ('10000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', 'North Wing')
ON CONFLICT (id) DO NOTHING;

INSERT INTO rooms (id, facility_id, zone_id, name) VALUES
  ('20000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-0000000000b1', 'LAB-1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO patients (id, facility_id, room_id, full_name, date_of_birth, sex, medical_notes) VALUES
  ('40000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-0000000000b1',
   'Test Wearer', '1950-01-01', 'other', 'Test patient for the SC-DEV-101 prototype band. Not a real person.')
ON CONFLICT (id) DO NOTHING;

-- Faster rules while testing: 60 s sustain instead of the 300 s default.
INSERT INTO alert_thresholds (id, facility_id, patient_id, sustain_seconds) VALUES
  ('70000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', NULL, 60)
ON CONFLICT (id) DO NOTHING;

-- Make sure the band exists (a database seeded without 001_dev_demo.sql).
INSERT INTO devices (id, device_uid, label, firmware_version, heartbeat_interval_s) VALUES
  ('50000000-0000-4000-8000-000000000101', 'SC-DEV-101', 'S-Care Band Alpha', '2.1.3', 60)
ON CONFLICT (device_uid) DO NOTHING;

-- Close any assignment the band still has outside the Test Lab.
UPDATE device_assignments a
SET unassigned_at = now()
FROM devices d
WHERE a.device_id = d.id
  AND d.device_uid = 'SC-DEV-101'
  AND a.unassigned_at IS NULL
  AND a.facility_id <> '00000000-0000-4000-8000-00000000000b';

UPDATE devices
SET facility_id = '00000000-0000-4000-8000-00000000000b',
    claimed_at = now()
WHERE device_uid = 'SC-DEV-101'
  AND facility_id IS DISTINCT FROM '00000000-0000-4000-8000-00000000000b';

INSERT INTO device_assignments (id, facility_id, device_id, patient_id, assigned_at)
SELECT '51000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', d.id,
       '40000000-0000-4000-8000-0000000000b1', now()
FROM devices d
WHERE d.device_uid = 'SC-DEV-101'
  AND NOT EXISTS (
    SELECT 1 FROM device_assignments a WHERE a.device_id = d.id AND a.unassigned_at IS NULL
  )
ON CONFLICT (id) DO NOTHING;
