-- S-Care PostgreSQL schema, migration 001. Requires PostgreSQL 15+.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/postgres/001_initial_schema.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


CREATE TABLE facilities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'care_home'
                CHECK (kind IN ('care_home', 'private_home')),
  timezone    text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  address     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE zones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id  uuid NOT NULL REFERENCES facilities (id),
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, name),
  UNIQUE (facility_id, id)
);

CREATE TABLE rooms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id  uuid NOT NULL REFERENCES facilities (id),
  zone_id      uuid,
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (facility_id, zone_id, name),
  UNIQUE (facility_id, id),
  FOREIGN KEY (facility_id, zone_id) REFERENCES zones (facility_id, id)
    ON DELETE SET NULL (zone_id)
);


CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              citext NOT NULL UNIQUE,
  password_hash      text,
  full_name          text NOT NULL,
  phone              text CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  locale             text NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi', 'en')),
  is_platform_admin  boolean NOT NULL DEFAULT false,
  is_active          boolean NOT NULL DEFAULT true,
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE facility_members (
  facility_id  uuid NOT NULL REFERENCES facilities (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('admin', 'caregiver', 'family')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (facility_id, user_id)
);
CREATE INDEX facility_members_user_idx ON facility_members (user_id);

CREATE TABLE patients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    uuid NOT NULL REFERENCES facilities (id),
  room_id        uuid,
  full_name      text NOT NULL,
  date_of_birth  date,
  sex            text CHECK (sex IN ('female', 'male', 'other')),
  avatar_url     text,
  medical_notes  text,
  admitted_at    timestamptz NOT NULL DEFAULT now(),
  discharged_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, id),
  FOREIGN KEY (facility_id, room_id) REFERENCES rooms (facility_id, id)
    ON DELETE SET NULL (room_id),
  CHECK (discharged_at IS NULL OR discharged_at >= admitted_at)
);
CREATE INDEX patients_facility_current_idx ON patients (facility_id) WHERE discharged_at IS NULL;
CREATE INDEX patients_room_idx ON patients (room_id);

CREATE TABLE patient_access (
  patient_id    uuid NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  relationship  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, user_id)
);
CREATE INDEX patient_access_user_idx ON patient_access (user_id);

CREATE TABLE emergency_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      uuid NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users (id) ON DELETE SET NULL,
  name            text NOT NULL,
  relationship    text NOT NULL,
  phone           text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  priority        smallint NOT NULL CHECK (priority BETWEEN 1 AND 5),
  notify_on_sos   boolean NOT NULL DEFAULT true,
  notify_on_fall  boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emergency_contacts_priority_uniq
    UNIQUE (patient_id, priority) DEFERRABLE INITIALLY IMMEDIATE
);


CREATE TABLE alert_thresholds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id       uuid NOT NULL REFERENCES facilities (id) ON DELETE CASCADE,
  patient_id        uuid,
  hr_crit_low       smallint,
  hr_warn_low       smallint,
  hr_warn_high      smallint,
  hr_crit_high      smallint,
  spo2_warn_low     smallint,
  spo2_crit_low     smallint,
  battery_warn_pct  smallint,
  battery_crit_pct  smallint,
  -- How long a vital must stay past a warn bound before alerting.
  sustain_seconds   smallint CHECK (sustain_seconds BETWEEN 0 AND 3600),
  updated_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (facility_id, patient_id) REFERENCES patients (facility_id, id) ON DELETE CASCADE,
  -- Ordering within a row. An override mixed with inherited values is validated by the API.
  CHECK (hr_crit_low IS NULL OR hr_warn_low IS NULL OR hr_crit_low < hr_warn_low),
  CHECK (hr_warn_low IS NULL OR hr_warn_high IS NULL OR hr_warn_low < hr_warn_high),
  CHECK (hr_warn_high IS NULL OR hr_crit_high IS NULL OR hr_warn_high < hr_crit_high),
  CHECK (spo2_crit_low IS NULL OR spo2_warn_low IS NULL OR spo2_crit_low < spo2_warn_low),
  CHECK (battery_crit_pct IS NULL OR battery_warn_pct IS NULL OR battery_crit_pct < battery_warn_pct)
);
CREATE UNIQUE INDEX alert_thresholds_facility_default
  ON alert_thresholds (facility_id) WHERE patient_id IS NULL;
CREATE UNIQUE INDEX alert_thresholds_patient_override
  ON alert_thresholds (patient_id) WHERE patient_id IS NOT NULL;

-- Override → facility default → built-in default. The built-in values mirror
-- AppConstants in S-Care Mobile (lib/core/constants/app_constants.dart).
CREATE VIEW effective_alert_thresholds AS
SELECT
  p.id          AS patient_id,
  p.facility_id,
  COALESCE(o.hr_crit_low,      d.hr_crit_low,      45)  AS hr_crit_low,
  COALESCE(o.hr_warn_low,      d.hr_warn_low,      50)  AS hr_warn_low,
  COALESCE(o.hr_warn_high,     d.hr_warn_high,     100) AS hr_warn_high,
  COALESCE(o.hr_crit_high,     d.hr_crit_high,     125) AS hr_crit_high,
  COALESCE(o.spo2_warn_low,    d.spo2_warn_low,    95)  AS spo2_warn_low,
  COALESCE(o.spo2_crit_low,    d.spo2_crit_low,    90)  AS spo2_crit_low,
  COALESCE(o.battery_warn_pct, d.battery_warn_pct, 20)  AS battery_warn_pct,
  COALESCE(o.battery_crit_pct, d.battery_crit_pct, 10)  AS battery_crit_pct,
  COALESCE(o.sustain_seconds,  d.sustain_seconds,  300) AS sustain_seconds
FROM patients p
LEFT JOIN alert_thresholds d ON d.facility_id = p.facility_id AND d.patient_id IS NULL
LEFT JOIN alert_thresholds o ON o.patient_id = p.id;


CREATE TABLE devices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uid            text NOT NULL UNIQUE CHECK (device_uid ~ '^[A-Za-z0-9_-]{3,64}$'),
  label                 text,
  facility_id           uuid REFERENCES facilities (id),
  claimed_at            timestamptz,
  claim_code_hash       text,
  mqtt_password_hash    text,
  hardware_model        text NOT NULL DEFAULT 'LilyGO TTGO T-Call ESP32',
  firmware_version      text,
  sim_iccid             text UNIQUE,
  heartbeat_interval_s  integer NOT NULL DEFAULT 60 CHECK (heartbeat_interval_s BETWEEN 5 AND 86400),
  config_version        integer NOT NULL DEFAULT 1,
  config_acked_version  integer NOT NULL DEFAULT 0,
  lifecycle             text NOT NULL DEFAULT 'active'
                          CHECK (lifecycle IN ('active', 'maintenance', 'retired')),
  last_seen_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT devices_claim_consistent CHECK ((facility_id IS NULL) = (claimed_at IS NULL)),
  CHECK (config_acked_version <= config_version)
);
CREATE INDEX devices_facility_idx ON devices (facility_id);

-- Who wore which band, when. Ranges are [assigned_at, unassigned_at); open-ended
-- while current. The exclusion constraints give one band per patient and one
-- patient per band at every instant of history, so vitals uploaded late (after
-- deep sleep or an outage) are attributed by sample time without ambiguity.
CREATE TABLE device_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    uuid NOT NULL,
  device_id      uuid NOT NULL REFERENCES devices (id),
  patient_id     uuid NOT NULL,
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  unassigned_at  timestamptz,
  assigned_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  FOREIGN KEY (facility_id, patient_id) REFERENCES patients (facility_id, id),
  CHECK (unassigned_at IS NULL OR unassigned_at > assigned_at),
  CONSTRAINT device_assignments_no_overlap_per_device
    EXCLUDE USING gist (device_id WITH =, tstzrange(assigned_at, unassigned_at) WITH &&),
  CONSTRAINT device_assignments_no_overlap_per_patient
    EXCLUDE USING gist (patient_id WITH =, tstzrange(assigned_at, unassigned_at) WITH &&)
);

-- A band's facility can change (resale, transfer), so it can't be a composite
-- foreign key like patients. These two triggers enforce the same rule.
CREATE FUNCTION device_assignments_check_facility() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.unassigned_at IS NULL AND NOT EXISTS (
    SELECT 1 FROM devices WHERE id = NEW.device_id AND facility_id = NEW.facility_id
  ) THEN
    RAISE EXCEPTION 'device % is not claimed by facility %', NEW.device_id, NEW.facility_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER device_assignments_same_facility
  BEFORE INSERT OR UPDATE ON device_assignments
  FOR EACH ROW EXECUTE FUNCTION device_assignments_check_facility();

CREATE FUNCTION devices_block_move_while_assigned() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.facility_id IS DISTINCT FROM OLD.facility_id AND EXISTS (
    SELECT 1 FROM device_assignments WHERE device_id = OLD.id AND unassigned_at IS NULL
  ) THEN
    RAISE EXCEPTION 'device % is still assigned; unassign it before changing facility', OLD.device_uid
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER devices_no_move_while_assigned
  BEFORE UPDATE OF facility_id ON devices
  FOR EACH ROW EXECUTE FUNCTION devices_block_move_while_assigned();


CREATE TABLE alerts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id          uuid NOT NULL REFERENCES facilities (id),
  patient_id           uuid,
  device_id            uuid REFERENCES devices (id),
  type                 text NOT NULL CHECK (type IN (
                         'fall', 'sos', 'tachycardia', 'bradycardia', 'hypoxemia',
                         'low_battery', 'offline')),
  severity             text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  status               text NOT NULL DEFAULT 'open' CHECK (status IN (
                         'pending', 'open', 'acknowledged', 'resolved', 'cancelled')),
  source               text NOT NULL CHECK (source IN ('device', 'rules', 'system', 'manual')),
  device_event_id      text,
  occurred_at          timestamptz NOT NULL,
  received_at          timestamptz NOT NULL DEFAULT now(),
  location_label       text,
  latitude             double precision CHECK (latitude BETWEEN -90 AND 90),
  longitude            double precision CHECK (longitude BETWEEN -180 AND 180),
  heart_rate_snapshot  smallint CHECK (heart_rate_snapshot BETWEEN 0 AND 300),
  spo2_snapshot        smallint CHECK (spo2_snapshot BETWEEN 0 AND 100),
  impact_g             numeric(4, 2),
  details              jsonb NOT NULL DEFAULT '{}'::jsonb,
  sms_sent_by_device   boolean NOT NULL DEFAULT false,
  acknowledged_at      timestamptz,
  acknowledged_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  resolved_at          timestamptz,
  resolved_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  resolution           text CHECK (resolution IN ('assisted', 'false_alarm', 'no_action_needed')),
  resolution_notes     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (facility_id, patient_id) REFERENCES patients (facility_id, id),
  CONSTRAINT alerts_device_event_uniq UNIQUE (device_id, device_event_id),
  CONSTRAINT alerts_resolved_has_time CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
  CONSTRAINT alerts_resolved_has_resolution CHECK (status <> 'resolved' OR resolution IS NOT NULL),
  CONSTRAINT alerts_acknowledged_has_time CHECK (status <> 'acknowledged' OR acknowledged_at IS NOT NULL),
  CONSTRAINT alerts_pending_only_falls CHECK (status <> 'pending' OR type = 'fall'),
  CONSTRAINT alerts_device_source_has_device CHECK (source <> 'device' OR device_id IS NOT NULL)
);

CREATE INDEX alerts_active_idx ON alerts (facility_id, occurred_at DESC)
  WHERE status IN ('pending', 'open', 'acknowledged');
CREATE INDEX alerts_facility_time_idx ON alerts (facility_id, occurred_at DESC, id DESC);
CREATE INDEX alerts_patient_time_idx ON alerts (patient_id, occurred_at DESC);
CREATE INDEX alerts_device_time_idx ON alerts (device_id, occurred_at DESC);

-- No alert storms, even if Redis is flushed: while one is active, a repeat is an
-- INSERT ... ON CONFLICT DO NOTHING (escalate the existing row instead).
-- Falls and SOS are deliberately excluded — every incident counts.
CREATE UNIQUE INDEX alerts_one_active_vitals_alert ON alerts (patient_id, type)
  WHERE status IN ('pending', 'open', 'acknowledged')
    AND type IN ('tachycardia', 'bradycardia', 'hypoxemia');
CREATE UNIQUE INDEX alerts_one_active_device_alert ON alerts (device_id, type)
  WHERE status IN ('pending', 'open', 'acknowledged')
    AND type IN ('low_battery', 'offline');

-- Each delivery attempt, and the notifier's work queue (transactional outbox):
-- rows are inserted in the same transaction as their alert, then claimed with
-- FOR UPDATE SKIP LOCKED. At-least-once delivery.
CREATE TABLE alert_notifications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id              uuid NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
  channel               text NOT NULL CHECK (channel IN ('push', 'sms', 'sms_device', 'email')),
  recipient_user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  emergency_contact_id  uuid REFERENCES emergency_contacts (id) ON DELETE SET NULL,
  destination           text,
  status                text NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  attempts              smallint NOT NULL DEFAULT 0,
  provider_message_id   text,
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  sent_at               timestamptz,
  delivered_at          timestamptz
);
CREATE INDEX alert_notifications_alert_idx ON alert_notifications (alert_id);
CREATE INDEX alert_notifications_queue_idx ON alert_notifications (created_at) WHERE status = 'queued';


CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,
  family_id    uuid NOT NULL,
  client       text NOT NULL CHECK (client IN ('web', 'mobile')),
  user_agent   text,
  ip           inet,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid REFERENCES refresh_tokens (id) ON DELETE SET NULL
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

CREATE TABLE push_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  platform      text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  token         text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_user_idx ON push_tokens (user_id);


CREATE TABLE audit_log (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  facility_id    uuid REFERENCES facilities (id),
  actor_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  action         text NOT NULL,
  entity_type    text,
  entity_id      uuid,
  changes        jsonb,
  ip             inet,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_facility_time_idx ON audit_log (facility_id, created_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);

CREATE TABLE daily_vital_summaries (
  patient_id    uuid NOT NULL REFERENCES patients (id),
  day           date NOT NULL,
  hr_min        smallint,
  hr_avg        numeric(5, 1),
  hr_max        smallint,
  spo2_min      smallint,
  spo2_avg      numeric(4, 1),
  worn_minutes  smallint NOT NULL DEFAULT 0 CHECK (worn_minutes BETWEEN 0 AND 1440),
  steps         integer,
  sample_count  integer NOT NULL DEFAULT 0,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, day)
);


CREATE TRIGGER facilities_updated_at         BEFORE UPDATE ON facilities         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_updated_at              BEFORE UPDATE ON users              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER patients_updated_at           BEFORE UPDATE ON patients           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER emergency_contacts_updated_at BEFORE UPDATE ON emergency_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER alert_thresholds_updated_at   BEFORE UPDATE ON alert_thresholds   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER devices_updated_at            BEFORE UPDATE ON devices            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER alerts_updated_at             BEFORE UPDATE ON alerts             FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
