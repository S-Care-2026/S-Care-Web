// Checks a band's HiveMQ permissions.
//
//   BAND_USERNAME=... BAND_PASSWORD=... npm run test:mqtt-acl
//   BAND_USERNAME=... BAND_PASSWORD=... npm run test:mqtt-acl -- --strict
//
// "Required" checks (what the firmware needs) always fail the run when they fail.
// "Isolation" checks (the band must not reach other bands) only warn by default; with
// --strict they fail too. Band credentials limited to scare/devices/<band id>/# pass all six.
//
// Environment (shell or backend/.env — never put passwords in this file):
//   BAND_USERNAME, BAND_PASSWORD   the band's own credential (required)
//   BAND_UID                       band to test as (default: BAND_USERNAME, since band credentials are named after the band)
//   OTHER_UID                      another band it must not reach (default SC-DEV-102)
//
//   BAND_USERNAME=SCB-XXXXXXXXXX BAND_PASSWORD=... npm run test:mqtt-acl -- --strict
//   MQTT_BROKER_URL                mqtts://<cluster>.s1.eu.hivemq.cloud:8883
//   MQTT_TOPIC_PREFIX              default scare/devices
//   MQTT_USERNAME, MQTT_PASSWORD   optional backend credential: if set, the script also
//                                  confirms the band's publish really reached the broker
//
// Connects as MQTT 3.1.1, like PubSubClient on the ESP32. Each check uses its own
// connection, because HiveMQ disconnects a 3.1.1 client that publishes where it may not.
// Client ids are random, so a real band or the deployed backend is never kicked off.

import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mqtt from "mqtt";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"), quiet: true });

const WAIT_MS = 3_000;

const brokerUrl = process.env.MQTT_BROKER_URL;
const prefix = (process.env.MQTT_TOPIC_PREFIX || "scare/devices").replace(/\/+$/, "");
const bandUid = process.env.BAND_UID || process.env.BAND_USERNAME || "SC-DEV-101";
const otherUid = process.env.OTHER_UID || (bandUid === "SC-DEV-102" ? "SC-DEV-103" : "SC-DEV-102");
const band = { username: process.env.BAND_USERNAME, password: process.env.BAND_PASSWORD };
const backend = { username: process.env.MQTT_USERNAME, password: process.env.MQTT_PASSWORD };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function connect(credential, label) {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(brokerUrl, {
      ...credential,
      clientId: `${label}-acltest-${randomBytes(4).toString("hex")}`,
      protocolVersion: 4,
      reconnectPeriod: 0,
      connectTimeout: 15_000,
    });
    client.once("connect", () => resolve(client));
    client.once("error", (err) => {
      client.end(true);
      reject(err);
    });
  });
}

// Resolves "denied" as soon as the broker drops the connection, otherwise the result of `action`.
async function runOnFreshConnection(action) {
  const client = await connect(band, bandUid);
  const closed = new Promise((resolve) => client.once("close", () => resolve("denied (disconnected)")));
  try {
    return await Promise.race([action(client), closed]);
  } finally {
    client.end(true);
  }
}

function trySubscribe(topic) {
  return runOnFreshConnection(async (client) => {
    let granted;
    try {
      [granted] = await client.subscribeAsync(topic, { qos: 1 });
    } catch (err) {
      // mqtt.js rejects instead of returning a failure SUBACK (reason code 0x80 and up). It wraps
      // the error in ErrorWithSubackPacket, which drops `code` but keeps the SUBACK as `packet`.
      const reason = err.code ?? err.packet?.granted?.find((rc) => rc >= 0x80);
      if (reason >= 0x80) return `denied (SUBACK 0x${reason.toString(16)})`;
      throw err;
    }
    if (granted.qos >= 0x80) return "denied (SUBACK 0x80)";
    await sleep(WAIT_MS); // some brokers disconnect shortly after granting
    return client.connected ? "allowed" : "denied (disconnected)";
  });
}

function tryPublish(topic, body) {
  return runOnFreshConnection(async (client) => {
    await client.publishAsync(topic, JSON.stringify(body), { qos: 1 });
    await sleep(WAIT_MS);
    return client.connected ? "allowed" : "denied (disconnected)";
  });
}

// Watches the band's own vitals topic with the backend credential while the band publishes.
async function watchDelivery(topic, marker) {
  if (!backend.username || !backend.password) return null;
  const client = await connect(backend, "backend");
  await client.subscribeAsync(topic, { qos: 1 });
  const received = new Promise((resolve) => {
    client.on("message", (t, payload) => {
      if (t === topic && payload.toString().includes(marker)) resolve(true);
    });
  });
  return {
    wait: () => Promise.race([received, sleep(WAIT_MS * 2).then(() => false)]),
    close: () => client.end(true),
  };
}

async function main() {
  if (!brokerUrl) throw new Error("Set MQTT_BROKER_URL");
  if (!band.username || !band.password) throw new Error("Set BAND_USERNAME and BAND_PASSWORD");

  console.log(`Broker ${new URL(brokerUrl).host}, testing as ${bandUid} (user "${band.username}")\n`);

  // Proves the credential works at all, so "denied" results below mean permissions, not a typo.
  const probe = await connect(band, bandUid);
  probe.end(true);

  const ownVitals = `${prefix}/${bandUid}/vitals`;
  const marker = `acltest-${randomBytes(4).toString("hex")}`;
  // Both readings null: passes validation, but the backend stores nothing.
  const vitals = { v: 1, t0: Date.now(), dt: 10_000, hr: [null], spo2: [null], acl_test: marker };

  const checks = [
    { kind: "required", name: `subscribe ${prefix}/${bandUid}/event_ack`, expect: "allowed", run: () => trySubscribe(`${prefix}/${bandUid}/event_ack`) },
    { kind: "required", name: `subscribe ${prefix}/${bandUid}/config`, expect: "allowed", run: () => trySubscribe(`${prefix}/${bandUid}/config`) },
    {
      kind: "required",
      name: `publish   ${ownVitals}`,
      expect: "allowed",
      run: async () => {
        const watcher = await watchDelivery(ownVitals, marker);
        try {
          const result = await tryPublish(ownVitals, vitals);
          if (!watcher || !result.startsWith("allowed")) return result;
          return (await watcher.wait()) ? "allowed (delivered)" : "denied (not delivered)";
        } finally {
          watcher?.close();
        }
      },
    },
    { kind: "isolation", name: `subscribe ${prefix}/#`, expect: "denied", run: () => trySubscribe(`${prefix}/#`) },
    { kind: "isolation", name: `subscribe ${prefix}/${otherUid}/vitals`, expect: "denied", run: () => trySubscribe(`${prefix}/${otherUid}/vitals`) },
    { kind: "isolation", name: `publish   ${prefix}/${otherUid}/vitals`, expect: "denied", run: () => tryPublish(`${prefix}/${otherUid}/vitals`, vitals) },
  ];

  const strict = process.argv.includes("--strict");
  let failures = 0;
  let warnings = 0;
  for (const check of checks) {
    let result;
    try {
      result = await check.run();
    } catch (err) {
      result = `error: ${err.message}`;
    }
    const pass = result.startsWith(check.expect);
    const fatal = check.kind === "required" || strict;
    const label = pass ? "PASS" : fatal ? "FAIL" : "WARN";
    if (!pass && fatal) failures++;
    if (!pass && !fatal) warnings++;
    console.log(`${label}  [${check.kind.padEnd(9)}] ${check.name.padEnd(56)} expected ${check.expect.padEnd(7)} got ${result}`);
  }

  if (!backend.username) {
    console.log("\n(MQTT_USERNAME/MQTT_PASSWORD not set: own publish was checked by connection only, not delivery.)");
  }
  if (warnings > 0) {
    console.log(
      `\n${warnings} isolation check(s) not enforced: this credential can read or write other bands' topics.` +
        "\nExpected on a plan without per-topic permissions — not acceptable with real patient data."
    );
  }
  console.log(failures === 0 ? "\nRequired checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`test-mqtt-acl: ${err.message || err.code || err}`);
  process.exitCode = 1;
});
