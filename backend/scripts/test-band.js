// End-to-end test as a band: publishes like the firmware will, waits for event_ack,
// and (with BACKEND_URL) checks the data reached the backend.
//
//   BAND_PASSWORD=... npm run test:band
//   BAND_PASSWORD=... BACKEND_URL=https://s-care-backend.onrender.com npm run test:band
//
// Environment (shell or backend/.env — never put passwords in this file):
//   BAND_UID          band to act as (default SC-DEV-101)
//   BAND_USERNAME     default = BAND_UID
//   BAND_PASSWORD     required
//   MQTT_BROKER_URL   mqtts://<cluster>.s1.eu.hivemq.cloud:8883
//   MQTT_TOPIC_PREFIX default scare/devices
//   BACKEND_URL       optional; wakes the backend first
//   API_EMAIL, API_PASSWORD  optional dashboard account of the band's facility; with BACKEND_URL,
//                     also checks the data reached the API (/api/live and the facility snapshot)
//
// Publishes at QoS 0 over MQTT 3.1.1, like PubSubClient. The client id gets a random
// suffix so a real band that is online keeps its connection. The test event is a
// "fall_cancelled" — once events create alerts, it won't page anyone as an SOS would.

import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mqtt from "mqtt";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"), quiet: true });

const uid = process.env.BAND_UID || "SC-DEV-101";
const username = process.env.BAND_USERNAME || uid;
const password = process.env.BAND_PASSWORD;
const brokerUrl = process.env.MQTT_BROKER_URL;
const prefix = (process.env.MQTT_TOPIC_PREFIX || "scare/devices").replace(/\/+$/, "");
const backendUrl = process.env.BACKEND_URL?.replace(/\/+$/, "");
const apiEmail = process.env.API_EMAIL;
const apiPassword = process.env.API_PASSWORD;

const ACK_TIMEOUT_MS = 20_000;
const RESEND_AFTER_MS = 15_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function getJson(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function signIn() {
  const { status, body } = await getJson(`${backendUrl}/api/auth/login`, null, {
    method: "POST",
    body: JSON.stringify({ email: apiEmail, password: apiPassword }),
  });
  record("sign in to the API", status === 200, status === 200 ? `${body.data.user.name} · ${body.data.user.zone}` : body?.error ?? `HTTP ${status}`);
  return status === 200 ? body.data.token : null;
}

// Render's free plan sleeps; the first request can take about a minute.
async function wakeBackend() {
  console.log(`Waking ${backendUrl} …`);
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    try {
      const { status, body } = await getJson(`${backendUrl}/api/health`);
      if (status === 200 && body?.mqtt?.status === "connected") {
        record("backend is up and connected to the broker", true, `client ${body.mqtt.client_id}`);
        return true;
      }
      if (status === 200 && body?.mqtt?.status === "disabled") {
        record("backend is up and connected to the broker", false, "MQTT_BROKER_URL is not set on the backend");
        return false;
      }
      console.log(`  backend answered, mqtt status: ${body?.mqtt?.status ?? `HTTP ${status}`} — waiting`);
    } catch (err) {
      console.log(`  not up yet (${err.cause?.code || err.name})`);
    }
    await sleep(5_000);
  }
  record("backend is up and connected to the broker", false, "no connected backend within 150 s");
  return false;
}

function connectBand() {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(brokerUrl, {
      username,
      password,
      clientId: `${uid}-test-${randomBytes(3).toString("hex")}`,
      protocolVersion: 4,
      clean: true, // test runs shouldn't leave persistent sessions on the broker
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

async function main() {
  if (!brokerUrl) throw new Error("Set MQTT_BROKER_URL");
  if (!password) throw new Error("Set BAND_PASSWORD");

  console.log(`Broker ${new URL(brokerUrl).host} · band ${uid} · user "${username}"\n`);

  const backendReady = backendUrl ? await wakeBackend() : false;
  if (!backendUrl) console.log("(BACKEND_URL not set: checking broker and event_ack only)\n");

  let band;
  try {
    band = await connectBand();
    record("band logs in to the broker", true);
  } catch (err) {
    record("band logs in to the broker", false, err.message);
    return;
  }

  let disconnected = false;
  band.on("close", () => {
    disconnected = true;
  });

  // event_ack listener: resolves the waiter registered for each event_id, in arrival order.
  const waiters = new Map();
  band.on("message", (topic, payload) => {
    let body;
    try {
      body = JSON.parse(payload.toString());
    } catch {
      return;
    }
    const queue = waiters.get(body.event_id);
    if (queue?.length) queue.shift()(body);
  });
  const waitForAck = (eventId, timeoutMs = ACK_TIMEOUT_MS) =>
    new Promise((resolve) => {
      const queue = waiters.get(eventId) ?? [];
      waiters.set(eventId, queue);
      const done = (body) => resolve(body);
      queue.push(done);
      setTimeout(() => {
        const i = queue.indexOf(done);
        if (i >= 0) queue.splice(i, 1);
        resolve(null);
      }, timeoutMs);
    });

  const topic = (kind) => `${prefix}/${uid}/${kind}`;
  const publish = (kind, body) => band.publishAsync(topic(kind), JSON.stringify(body), { qos: 0 });

  try {
    const [granted] = await band.subscribeAsync(topic("event_ack"), { qos: 1 });
    record(`subscribe ${topic("event_ack")}`, granted.qos < 0x80, `granted qos ${granted.qos}`);

    const runId = `${Date.now()}`;
    const now = Date.now();

    // status
    const battery = 40 + Math.floor(Math.random() * 50);
    await publish("status", { battery, charging: false, rssi: -61, network: "wifi", worn: true, ts: now });

    // vitals: 6 samples, 10 s apart, the last one "now"; the 3rd has no reading
    const lastHr = 70 + Math.floor(Math.random() * 20);
    const vitals = {
      v: 1,
      t0: now - 50_000,
      dt: 10_000,
      hr: [74, 75, null, 76, 74, lastHr],
      spo2: [98, 97, null, 98, 98, 97],
      q: [92, 90, 0, 91, 93, 94],
    };
    await publish("vitals", vitals);
    await sleep(1_000);
    record("publish status + vitals (connection stays open)", band.connected && !disconnected);

    // event → ack, resending once with the same event_id if needed, like the firmware
    const eventId = `${uid}-test-${runId}-1`;
    const event = { event_id: eventId, type: "fall_cancelled", incident_id: `${uid}-test-${runId}`, ts: now };
    const firstAck = waitForAck(eventId, RESEND_AFTER_MS);
    await publish("events", event);
    let ack = await firstAck;
    if (!ack) {
      console.log(`  no event_ack after ${RESEND_AFTER_MS / 1000} s — resending ${eventId}`);
      const retryAck = waitForAck(eventId);
      await publish("events", event);
      ack = await retryAck;
    }
    record("event → event_ack \"received\"", ack?.status === "received", ack ? JSON.stringify(ack) : "no reply (is the backend running?)");

    if (ack) {
      // duplicate: same event_id must still be confirmed
      const dupAck = waitForAck(eventId);
      await publish("events", event);
      const dup = await dupAck;
      record("duplicate event_id is confirmed again", dup?.status === "received", dup ? "" : "no reply");

      // invalid type → rejected
      const badId = `${uid}-test-${runId}-2`;
      const badAck = waitForAck(badId);
      await publish("events", { event_id: badId, type: "fal", ts: now });
      const bad = await badAck;
      record("invalid event type → event_ack \"rejected\"", bad?.status === "rejected", bad ? bad.error : "no reply");
    }

    const token = backendReady && apiEmail && apiPassword ? await signIn() : null;
    if (backendReady && !apiEmail) console.log("(API_EMAIL/API_PASSWORD not set: skipping the API checks)");

    if (token) {
      await sleep(1_500);
      const { status, body } = await getJson(`${backendUrl}/api/live/devices/${uid}`, token);
      const device = body?.data;
      record(
        `GET /api/live/devices/${uid}`,
        status === 200 && device?.vitals?.heart_rate === lastHr && device?.status?.battery_pct === battery,
        status === 200
          ? `heart_rate ${device?.vitals?.heart_rate} (sent ${lastHr}), battery ${device?.status?.battery_pct}% (sent ${battery}%)`
          : body?.error ?? `HTTP ${status}`
      );

      const events = await getJson(`${backendUrl}/api/live/events?limit=200`, token);
      const found = events.body?.data?.filter((e) => e.event_id === eventId).length ?? 0;
      record("GET /api/live/events has the event exactly once", found === 1, `found ${found}`);

      const snap = await getJson(`${backendUrl}/api/facility/snapshot`, token);
      const bandRow = snap.body?.data?.devices?.find((d) => d.id === uid);
      const patient = snap.body?.data?.patients?.find((p) => p.deviceId === uid);
      const vitals = patient ? snap.body.data.vitals[patient.id] : null;
      record(
        "facility snapshot shows the band online with the new reading",
        Boolean(bandRow?.online && vitals?.hr === lastHr && bandRow?.battery === battery),
        bandRow ? `${patient?.name ?? "no patient"} · online ${bandRow.online} · hr ${vitals?.hr} · battery ${bandRow.battery}%` : `${uid} is not in this account's facility`
      );
    }
  } finally {
    band.end(true);
  }
}

main()
  .catch((err) => {
    console.error(`test-band: ${err.message}`);
    results.push({ ok: false });
  })
  .finally(() => {
    const failed = results.filter((r) => !r.ok).length;
    console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
    process.exitCode = failed === 0 ? 0 : 1;
  });
