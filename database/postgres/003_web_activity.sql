-- One row per real account. No URLs, IP addresses or browser identifiers are stored.
CREATE TABLE web_activity (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  active_ms bigint NOT NULL DEFAULT 0 CHECK (active_ms >= 0)
);

CREATE INDEX web_activity_last_seen_idx ON web_activity(last_seen_at);
