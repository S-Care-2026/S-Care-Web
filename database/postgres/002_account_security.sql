-- S-Care PostgreSQL schema, migration 002: account security.
-- Applied with `npm run migrate` (in backend/).

-- Access tokens issued before this moment are rejected, so changing a password
-- signs out every other session.
ALTER TABLE users ADD COLUMN password_changed_at timestamptz;

COMMENT ON COLUMN devices.claim_code_hash IS
  'sha256 hex of the band''s pairing code (printed in its QR label), uppercased without dashes or spaces. Required to claim an unclaimed band.';
COMMENT ON COLUMN devices.mqtt_password_hash IS
  'bcrypt hash of the band''s broker password, kept for reference; the broker holds the credential itself.';
