// Creates a dashboard account, or resets the password and role of an existing one.
//
//   npm run db:create-user -- --email test@scare.dev --name "Test Admin" --role admin --facility "S-Care Test Lab"
//
// The password comes from NEW_USER_PASSWORD; when it isn't set, a random one is generated and
// printed once. Passwords are stored as bcrypt hashes, never in files or in git.

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { connect } from "./db-connection.js";

const ROLES = new Set(["admin", "caregiver", "family"]);

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1];
    i++;
  }
  return out;
}

async function main() {
  const { email, name, role = "caregiver", facility } = args();
  if (!email || !name || !facility) {
    throw new Error('Usage: npm run db:create-user -- --email <email> --name "<full name>" --role admin|caregiver|family --facility "<facility name>"');
  }
  if (!ROLES.has(role)) throw new Error(`--role must be one of: ${[...ROLES].join(", ")}`);

  const generated = !process.env.NEW_USER_PASSWORD;
  const password = process.env.NEW_USER_PASSWORD || randomBytes(12).toString("base64url");
  if (password.length < 10) throw new Error("NEW_USER_PASSWORD must be at least 10 characters");
  const hash = await bcrypt.hash(password, 10);

  const client = await connect();
  try {
    await client.query("BEGIN");
    const { rows: facilities } = await client.query("SELECT id FROM facilities WHERE name = $1", [facility]);
    if (facilities.length !== 1) throw new Error(`Found ${facilities.length} facilities named "${facility}" — expected exactly one. Run npm run db:seed first?`);

    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, full_name, locale)
       VALUES ($1, $2, $3, 'en')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, is_active = true
       RETURNING id, (xmax = 0) AS created`,
      [email, hash, name]
    );
    await client.query(
      `INSERT INTO facility_members (facility_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (facility_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [facilities[0].id, rows[0].id, role]
    );
    await client.query("COMMIT");

    console.log(`${rows[0].created ? "Created" : "Updated"} ${email} (${role}) in ${facility}`);
    if (generated) console.log(`Password: ${password}\nStore it somewhere safe — it isn't shown again.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`create-user: ${err.message}`);
  process.exitCode = 1;
});
