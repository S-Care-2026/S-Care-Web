// Registers new bands with hard-to-guess ids and prints what each one needs:
// a pairing code (for its QR label) and a broker password (for its firmware and HiveMQ).
//
//   npm run db:provision-device                      one band
//   npm run db:provision-device -- --count 5         five bands
//   npm run db:provision-device -- --label "Band batch 2"
//
// APP_URL (e.g. https://s-care-web.onrender.com) makes the QR a link: scanning it with a phone
// camera opens the dashboard's pairing screen with the band filled in. Without it, the QR holds
// scare://pair?… and must be scanned from the dashboard.
//
// Output: backend/provisioned/<band id>.png (QR label) and .txt (secrets). The folder is
// git-ignored — hand the files to whoever labels and flashes the bands, then delete them.
// Only hashes are stored in the database; lost codes can't be recovered, only replaced.

import { mkdir, writeFile } from "node:fs/promises";
import { createHash, randomInt } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { connect } from "./db-connection.js";

// Crockford base32: no I, L, O, U — nothing to misread on a printed label.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../provisioned");

const random = (length) => Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const group = (text) => text.match(/.{1,4}/g).join("-");

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, "")] = argv[i + 1];
  return out;
}

async function main() {
  const { count = "1", label = "S-Care Band" } = args();
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error("--count must be between 1 and 100");

  const prefix = (process.env.MQTT_TOPIC_PREFIX || "scare/devices").replace(/\/+$/, "");
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
  await mkdir(OUT_DIR, { recursive: true });
  const client = await connect();

  try {
    for (let i = 0; i < n; i++) {
      const uid = `SCB-${random(10)}`; // ~50 bits: not guessable, still short enough to type
      const claimCode = random(16); // ~80 bits, printed as XXXX-XXXX-XXXX-XXXX
      const mqttPassword = random(24);

      const { rowCount } = await client.query(
        `INSERT INTO devices (device_uid, label, claim_code_hash, mqtt_password_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (device_uid) DO NOTHING`,
        [uid, label, createHash("sha256").update(claimCode).digest("hex"), await bcrypt.hash(mqttPassword, 10)]
      );
      if (!rowCount) {
        i--; // astronomically unlikely id collision: draw again
        continue;
      }

      const query = `d=${encodeURIComponent(uid)}&c=${group(claimCode)}`;
      const qrText = appUrl ? `${appUrl}/pair?${query}` : `scare://pair?${query}`;
      await QRCode.toFile(path.join(OUT_DIR, `${uid}.png`), qrText, { width: 480, margin: 2, errorCorrectionLevel: "M" });

      const sheet = `S-Care band ${uid}
${"=".repeat(20 + uid.length)}

Label (print on the band, with the QR code ${uid}.png)
  Band ID       ${uid}
  Pairing code  ${group(claimCode)}
  QR contains   ${qrText}

Firmware (keep secret — never on the label)
  MQTT client id  ${uid}
  MQTT username   ${uid}
  MQTT password   ${mqttPassword}

HiveMQ Cloud → Access Management → add credential
  Username  ${uid}
  Password  ${mqttPassword}
  Publish   ${["vitals", "status", "location", "events", "motion", "ack"].map((k) => `${prefix}/${uid}/${k}`).join("\n            ")}
  Subscribe ${prefix}/${uid}/config
            ${prefix}/${uid}/event_ack
  Then check it: BAND_UID=${uid} BAND_USERNAME=${uid} BAND_PASSWORD=… npm run test:mqtt-acl -- --strict
`;
      await writeFile(path.join(OUT_DIR, `${uid}.txt`), sheet, { mode: 0o600 });
      console.log(`${uid}  pairing code ${group(claimCode)}  → provisioned/${uid}.png, provisioned/${uid}.txt`);
    }
  } finally {
    await client.end();
  }

  if (!appUrl) console.log("\nTip: set APP_URL to the dashboard's address so a phone camera can open the QR directly.");
}

main().catch((err) => {
  console.error(`provision-device: ${err.message}`);
  process.exitCode = 1;
});
