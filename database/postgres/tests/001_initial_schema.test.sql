-- Behaviour tests for 001_initial_schema.sql. Run on a fresh database after applying the schema.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
SET client_min_messages = notice;

CREATE FUNCTION pg_temp.expect_error(stmt text, expected text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected THEN
      RAISE NOTICE 'ok   rejected (%) %', expected, left(regexp_replace(stmt, '\s+', ' ', 'g'), 80);
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL expected SQLSTATE %, got % (%) for: %', expected, SQLSTATE, SQLERRM, stmt;
  END;
  RAISE EXCEPTION 'FAIL expected SQLSTATE % but statement succeeded: %', expected, stmt;
END $$;

CREATE FUNCTION pg_temp.expect(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', label; END IF;
  RAISE NOTICE 'ok   %', label;
END $$;

CREATE FUNCTION pg_temp.plan_of(q text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r record; plan text := '';
BEGIN
  FOR r IN EXECUTE 'EXPLAIN ' || q LOOP plan := plan || r."QUERY PLAN" || E'\n'; END LOOP;
  RETURN plan;
END $$;

INSERT INTO facilities (id, name) VALUES
  ('00000000-0000-4000-8000-00000000000a', 'Sunrise Care Home'),
  ('00000000-0000-4000-8000-00000000000b', 'Another Home');

INSERT INTO zones (id, facility_id, name) VALUES
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'West Wing'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000a', 'North Wing'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000000b', 'Main');

INSERT INTO rooms (id, facility_id, zone_id, name) VALUES
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001', '112'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000002', '112'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000003', '1');
SELECT pg_temp.expect(true, 'same room name in two wings is allowed');

INSERT INTO users (id, email, full_name) VALUES
  ('30000000-0000-4000-8000-000000000001', 'Jordan.Cole@example.org', 'Jordan Cole');

INSERT INTO patients (id, facility_id, room_id, full_name) VALUES
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000001', 'Arthur Pendelton'),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000002', 'Eleanor Vance'),
  ('40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000000a', NULL, 'Clara Zhang'),
  ('40000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-000000000003', 'Other Facility Patient');

INSERT INTO devices (id, device_uid, facility_id, claimed_at) VALUES
  ('50000000-0000-4000-8000-000000000102', 'SC-DEV-102', '00000000-0000-4000-8000-00000000000a', now()),
  ('50000000-0000-4000-8000-000000000204', 'SC-DEV-204', '00000000-0000-4000-8000-00000000000a', now()),
  ('50000000-0000-4000-8000-000000000999', 'SC-DEV-999', '00000000-0000-4000-8000-00000000000b', now());
INSERT INTO devices (device_uid) VALUES ('SC-DEV-UNCLAIMED');

SELECT pg_temp.expect_error($$INSERT INTO rooms (facility_id, zone_id, name) VALUES ('00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001', '112')$$, '23505');
INSERT INTO rooms (facility_id, name) VALUES ('00000000-0000-4000-8000-00000000000a', 'Lobby');
SELECT pg_temp.expect_error($$INSERT INTO rooms (facility_id, name) VALUES ('00000000-0000-4000-8000-00000000000a', 'Lobby')$$, '23505');
SELECT pg_temp.expect_error($$INSERT INTO rooms (facility_id, zone_id, name) VALUES ('00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000003', 'X')$$, '23503');
SELECT pg_temp.expect_error($$INSERT INTO patients (facility_id, room_id, full_name) VALUES ('00000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000003', 'Wrong Room')$$, '23503');

SELECT pg_temp.expect((SELECT count(*) FROM users WHERE email = 'jordan.cole@EXAMPLE.org') = 1, 'emails match case-insensitively');
SELECT pg_temp.expect_error($$INSERT INTO users (email, full_name) VALUES ('JORDAN.COLE@example.org', 'Dup')$$, '23505');
SELECT pg_temp.expect_error($$INSERT INTO users (email, full_name, phone) VALUES ('x@example.org', 'X', '0901234567')$$, '23514');

INSERT INTO emergency_contacts (id, patient_id, name, relationship, phone, priority) VALUES
  ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Head Nurse', 'Primary Caregiver', '+84901234567', 1),
  ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'Daughter', 'Family', '+84907654321', 2);
SELECT pg_temp.expect_error($$INSERT INTO emergency_contacts (patient_id, name, relationship, phone, priority) VALUES ('40000000-0000-4000-8000-000000000001', 'Son', 'Family', '+84900000000', 1)$$, '23505');
UPDATE emergency_contacts SET priority = 3 - priority WHERE patient_id = '40000000-0000-4000-8000-000000000001';
SELECT pg_temp.expect((SELECT priority FROM emergency_contacts WHERE id = '60000000-0000-4000-8000-000000000002') = 1, 'contact priorities swap in one UPDATE');
SELECT pg_temp.expect_error($$INSERT INTO emergency_contacts (patient_id, name, relationship, phone, priority) VALUES ('40000000-0000-4000-8000-000000000002', 'Bad', 'Family', '+84 90 123 4567', 1)$$, '23514');

SELECT pg_temp.expect_error($$INSERT INTO devices (device_uid) VALUES ('SC/DEV/1')$$, '23514');
SELECT pg_temp.expect_error($$INSERT INTO devices (device_uid) VALUES ('SC-DEV-+')$$, '23514');
SELECT pg_temp.expect_error($$INSERT INTO devices (device_uid, facility_id) VALUES ('SC-DEV-HALF', '00000000-0000-4000-8000-00000000000a')$$, '23514');

-- SC-DEV-204: Eleanor from -20d to -5d, then Clara from -5d onwards.
INSERT INTO device_assignments (facility_id, device_id, patient_id, assigned_at, unassigned_at) VALUES
  ('00000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-000000000204', '40000000-0000-4000-8000-000000000002', now() - interval '20 days', now() - interval '5 days');
INSERT INTO device_assignments (facility_id, device_id, patient_id, assigned_at) VALUES
  ('00000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-000000000204', '40000000-0000-4000-8000-000000000003', now() - interval '5 days'),
  ('00000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-000000000102', '40000000-0000-4000-8000-000000000001', now() - interval '10 days');
SELECT pg_temp.expect(true, 'back-to-back assignments of one band are allowed');

SELECT pg_temp.expect_error($$INSERT INTO device_assignments (facility_id, device_id, patient_id) VALUES ('00000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-000000000102', '40000000-0000-4000-8000-000000000002')$$, '23P01');
SELECT pg_temp.expect_error($$INSERT INTO device_assignments (facility_id, device_id, patient_id) VALUES ('00000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-000000000204', '40000000-0000-4000-8000-000000000001')$$, '23P01');
SELECT pg_temp.expect_error($$INSERT INTO device_assignments (facility_id, device_id, patient_id, assigned_at, unassigned_at) VALUES ('00000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-000000000204', '40000000-0000-4000-8000-000000000002', now() - interval '30 days', now() - interval '15 days')$$, '23P01');
SELECT pg_temp.expect_error($$INSERT INTO device_assignments (facility_id, device_id, patient_id) VALUES ('00000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-000000000999', '40000000-0000-4000-8000-000000000002')$$, '23503');
SELECT pg_temp.expect_error($$INSERT INTO device_assignments (facility_id, device_id, patient_id) VALUES ('00000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-000000000999', '40000000-0000-4000-8000-000000000002')$$, '23503');
SELECT pg_temp.expect_error($$UPDATE devices SET facility_id = '00000000-0000-4000-8000-00000000000b' WHERE device_uid = 'SC-DEV-102'$$, '23001');

SELECT pg_temp.expect(
  (SELECT patient_id FROM device_assignments
   WHERE device_id = '50000000-0000-4000-8000-000000000204'
     AND tstzrange(assigned_at, unassigned_at) @> (now() - interval '10 days'))
  = '40000000-0000-4000-8000-000000000002',
  'late sample from 10 days ago resolves to the patient wearing the band then (Eleanor)');
SELECT pg_temp.expect(
  (SELECT patient_id FROM device_assignments
   WHERE device_id = '50000000-0000-4000-8000-000000000204'
     AND tstzrange(assigned_at, unassigned_at) @> now())
  = '40000000-0000-4000-8000-000000000003',
  'current sample resolves to the current wearer (Clara)');

INSERT INTO alert_thresholds (facility_id, hr_warn_high) VALUES ('00000000-0000-4000-8000-00000000000a', 105);
INSERT INTO alert_thresholds (facility_id, patient_id, hr_warn_high, sustain_seconds)
  VALUES ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001', 110, 120);
SELECT pg_temp.expect(
  (SELECT (hr_warn_high, hr_warn_low, sustain_seconds) = (110, 50, 120) FROM effective_alert_thresholds
   WHERE patient_id = '40000000-0000-4000-8000-000000000001'),
  'patient override wins, unset columns fall through to built-in defaults');
SELECT pg_temp.expect(
  (SELECT hr_warn_high = 105 FROM effective_alert_thresholds WHERE patient_id = '40000000-0000-4000-8000-000000000002'),
  'patient without override gets the facility default');
SELECT pg_temp.expect(
  (SELECT (hr_warn_high, spo2_crit_low, sustain_seconds) = (100, 90, 300) FROM effective_alert_thresholds
   WHERE patient_id = '40000000-0000-4000-8000-000000000009'),
  'facility with no threshold rows gets the built-in defaults');
SELECT pg_temp.expect_error($$INSERT INTO alert_thresholds (facility_id) VALUES ('00000000-0000-4000-8000-00000000000a')$$, '23505');
SELECT pg_temp.expect_error($$INSERT INTO alert_thresholds (facility_id, hr_warn_low, hr_warn_high) VALUES ('00000000-0000-4000-8000-00000000000b', 120, 100)$$, '23514');
SELECT pg_temp.expect_error($$INSERT INTO alert_thresholds (facility_id, patient_id) VALUES ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000009')$$, '23503');

-- Fall: detected (pending), then QoS 1 redelivers the same event.
INSERT INTO alerts (facility_id, patient_id, device_id, type, severity, status, source, device_event_id, occurred_at, impact_g)
VALUES ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000102',
        'fall', 'critical', 'pending', 'device', 'inc-1', now(), 3.4)
ON CONFLICT DO NOTHING;
INSERT INTO alerts (facility_id, patient_id, device_id, type, severity, status, source, device_event_id, occurred_at, impact_g)
VALUES ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000102',
        'fall', 'critical', 'pending', 'device', 'inc-1', now(), 3.4)
ON CONFLICT DO NOTHING;
SELECT pg_temp.expect((SELECT count(*) FROM alerts WHERE device_event_id = 'inc-1') = 1, 'redelivered fall event is a no-op');
UPDATE alerts SET status = 'open' WHERE device_event_id = 'inc-1';
SELECT pg_temp.expect(true, 'pending fall confirms to open');

-- A second, separate fall and an SOS can be active at the same time.
INSERT INTO alerts (facility_id, patient_id, device_id, type, severity, source, device_event_id, occurred_at) VALUES
  ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000102', 'fall', 'critical', 'device', 'inc-2', now()),
  ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000102', 'sos',  'critical', 'device', 'inc-3', now());
SELECT pg_temp.expect(true, 'concurrent falls and SOS each open their own incident');

-- Vitals rule: second active tachycardia is suppressed until the first is resolved.
INSERT INTO alerts (id, facility_id, patient_id, device_id, type, severity, source, occurred_at, heart_rate_snapshot)
VALUES ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000102', 'tachycardia', 'warning', 'rules', now(), 108);
WITH ins AS (
  INSERT INTO alerts (facility_id, patient_id, device_id, type, severity, source, occurred_at, heart_rate_snapshot)
  VALUES ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001',
          '50000000-0000-4000-8000-000000000102', 'tachycardia', 'warning', 'rules', now(), 109)
  ON CONFLICT DO NOTHING RETURNING id)
SELECT pg_temp.expect((SELECT count(*) FROM ins) = 0, 'repeat tachycardia while one is active returns no row');
SELECT pg_temp.expect_error($$UPDATE alerts SET status = 'resolved', resolved_at = now() WHERE id = '70000000-0000-4000-8000-000000000001'$$, '23514');
SELECT pg_temp.expect_error($$UPDATE alerts SET status = 'resolved', resolution = 'assisted' WHERE id = '70000000-0000-4000-8000-000000000001'$$, '23514');
SELECT pg_temp.expect_error($$UPDATE alerts SET status = 'acknowledged' WHERE id = '70000000-0000-4000-8000-000000000001'$$, '23514');
SELECT pg_sleep(0.01);
UPDATE alerts SET status = 'resolved', resolved_at = now(), resolution = 'assisted',
                  resolved_by = '30000000-0000-4000-8000-000000000001'
WHERE id = '70000000-0000-4000-8000-000000000001';
SELECT pg_temp.expect((SELECT updated_at > created_at FROM alerts WHERE id = '70000000-0000-4000-8000-000000000001'), 'updated_at is maintained by trigger');
INSERT INTO alerts (facility_id, patient_id, device_id, type, severity, source, occurred_at)
VALUES ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000102', 'tachycardia', 'critical', 'rules', now());
SELECT pg_temp.expect(true, 'new tachycardia allowed once the previous one is resolved');

-- Device-health alerts dedupe per band, even with no patient.
INSERT INTO alerts (facility_id, device_id, type, severity, source, occurred_at)
VALUES ('00000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-000000000999', 'offline', 'warning', 'system', now());
WITH ins AS (
  INSERT INTO alerts (facility_id, device_id, type, severity, source, occurred_at)
  VALUES ('00000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-000000000999', 'offline', 'warning', 'system', now())
  ON CONFLICT DO NOTHING RETURNING id)
SELECT pg_temp.expect((SELECT count(*) FROM ins) = 0, 'repeat offline alert for an unassigned band is suppressed');

SELECT pg_temp.expect_error($$INSERT INTO alerts (facility_id, patient_id, type, severity, status, source, occurred_at) VALUES ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001', 'sos', 'critical', 'pending', 'manual', now())$$, '23514');
SELECT pg_temp.expect_error($$INSERT INTO alerts (facility_id, type, severity, source, occurred_at) VALUES ('00000000-0000-4000-8000-00000000000a', 'sos', 'critical', 'device', now())$$, '23514');
SELECT pg_temp.expect_error($$INSERT INTO alerts (facility_id, patient_id, type, severity, source, occurred_at) VALUES ('00000000-0000-4000-8000-00000000000b', '40000000-0000-4000-8000-000000000001', 'sos', 'critical', 'manual', now())$$, '23503');

INSERT INTO alert_notifications (alert_id, channel, recipient_user_id)
SELECT id, 'push', '30000000-0000-4000-8000-000000000001' FROM alerts WHERE device_event_id IN ('inc-2', 'inc-3');
WITH next AS (
  SELECT id FROM alert_notifications WHERE status = 'queued'
  ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED
), claimed AS (
  UPDATE alert_notifications n SET attempts = n.attempts + 1
  FROM next WHERE n.id = next.id
  RETURNING n.id)
SELECT pg_temp.expect((SELECT count(*) FROM claimed) = 2, 'notifier claims queued rows with SKIP LOCKED');

DELETE FROM zones WHERE id = '10000000-0000-4000-8000-000000000002';
SELECT pg_temp.expect(
  (SELECT zone_id IS NULL FROM rooms WHERE id = '20000000-0000-4000-8000-000000000002')
  AND (SELECT room_id IS NOT NULL FROM patients WHERE id = '40000000-0000-4000-8000-000000000002'),
  'deleting a zone keeps its rooms (zone_id -> NULL) and their patients');

SET enable_seqscan = off;
SELECT pg_temp.expect(
  pg_temp.plan_of($$SELECT * FROM alerts WHERE facility_id = '00000000-0000-4000-8000-00000000000a' AND status IN ('pending', 'open', 'acknowledged') ORDER BY occurred_at DESC LIMIT 50$$)
    LIKE '%alerts_active_idx%',
  'active alert feed uses alerts_active_idx');
SELECT pg_temp.expect(
  pg_temp.plan_of($$SELECT patient_id FROM device_assignments WHERE device_id = '50000000-0000-4000-8000-000000000204' AND tstzrange(assigned_at, unassigned_at) @> now()$$)
    LIKE '%device_assignments_no_overlap_per_device%',
  'point-in-time assignment lookup uses the exclusion index');
RESET enable_seqscan;

SELECT pg_temp.expect(true, 'ALL TESTS PASSED on PostgreSQL ' || current_setting('server_version'));
