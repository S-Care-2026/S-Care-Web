// MQTT subscriber: listens to every band's topics on the broker (HiveMQ Cloud)
// and hands each message to the matching handler in handlers.js.

import mqtt from "mqtt";
import { handlers, PayloadError } from "./handlers.js";

const MAX_PAYLOAD_BYTES = 256 * 1024;
const DEVICE_UID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

// MQTT 5 reason codes
const SESSION_TAKEN_OVER = 0x8e;
const AUTH_FAILURES = new Set([0x86, 0x87]); // bad username or password, not authorized

const log = {
  info: (msg) => console.log(`[mqtt] ${msg}`),
  warn: (msg) => console.warn(`[mqtt] ${msg}`),
  error: (msg) => console.error(`[mqtt] ${msg}`),
};

let client = null;
const state = {
  // "starting" until startSubscriber runs (after the startup warm-up), so health checks don't read "disabled".
  status: process.env.MQTT_BROKER_URL ? "starting" : "disabled",
  broker: null,
  client_id: null,
  connected_since: null,
  last_message_at: null,
  last_error: null,
  messages_received: 0,
  messages_rejected: 0,
};

// Messages from one band are handled one at a time, in arrival order, so a fall_confirmed
// can't be processed before its fall_detected. Different bands run concurrently.
const queues = new Map(); // uid -> Promise

export function getMqttStatus() {
  return { ...state };
}

function topicPrefix() {
  return (process.env.MQTT_TOPIC_PREFIX || "scare/devices").replace(/\/+$/, "");
}

function subscriptions() {
  const prefix = topicPrefix();
  return Object.fromEntries(
    Object.entries(handlers).map(([kind, { qos }]) => [`${prefix}/+/${kind}`, { qos }])
  );
}

// Publishes to scare/devices/{uid}/{kind}. Returns false when not connected (the message is
// still queued by mqtt.js and sent after reconnecting).
export function publishToBand(uid, kind, body, options = { qos: 1 }) {
  if (!client) return false;
  const topic = `${topicPrefix()}/${uid}/${kind}`;
  client
    .publishAsync(topic, JSON.stringify(body), options)
    .catch((err) => log.error(`failed to publish ${topic}: ${err.message}`));
  return client.connected;
}

async function processMessage(topic, uid, handler, payload, receivedAt) {
  try {
    if (payload.length > MAX_PAYLOAD_BYTES) throw new PayloadError(`payload of ${payload.length} bytes is too large`);

    let body;
    try {
      body = JSON.parse(payload.toString("utf8"));
    } catch {
      throw new PayloadError("payload is not valid JSON");
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new PayloadError("payload must be a JSON object");
    }

    const reply = await handler.handle(uid, body, receivedAt, log);
    if (handler.replyTopic && reply) publishToBand(uid, handler.replyTopic, reply);
  } catch (err) {
    state.messages_rejected++;
    if (err instanceof PayloadError) {
      log.warn(`rejected ${topic}: ${err.message}`);
      if (handler.replyTopic && err.reply) publishToBand(uid, handler.replyTopic, err.reply);
    } else {
      // Storage failure: no reply, so a band waiting for event_ack retries.
      log.error(`failed to handle ${topic}: ${err.stack || err.message}`);
    }
  }
}

function onMessage(topic, payload) {
  const receivedAt = Date.now();
  state.messages_received++;
  state.last_message_at = new Date(receivedAt).toISOString();

  const prefix = `${topicPrefix()}/`;
  const [uid, kind, ...rest] = topic.startsWith(prefix) ? topic.slice(prefix.length).split("/") : [];
  const handler = handlers[kind];
  if (!handler || rest.length > 0 || !DEVICE_UID_PATTERN.test(uid ?? "")) {
    state.messages_rejected++;
    log.warn(`rejected ${topic}: unknown topic or invalid device uid`);
    return;
  }

  const previous = queues.get(uid) ?? Promise.resolve();
  const current = previous.then(() => processMessage(topic, uid, handler, payload, receivedAt));
  queues.set(uid, current);
  current.finally(() => {
    if (queues.get(uid) === current) queues.delete(uid);
  });
}

export function startSubscriber() {
  const url = process.env.MQTT_BROKER_URL;
  if (!url) {
    log.warn("MQTT_BROKER_URL is not set — subscriber disabled");
    return;
  }

  // Keep the client id stable across restarts so the broker keeps our persistent
  // session and queues QoS 1 events while we're down. Separate per environment so a
  // local run never takes over production's session.
  const clientId = process.env.MQTT_CLIENT_ID || `scare-backend-${process.env.NODE_ENV || "development"}`;

  state.status = "connecting";
  state.broker = new URL(url).host;
  state.client_id = clientId;

  client = mqtt.connect(url, {
    clientId,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    protocolVersion: 5,
    clean: false,
    properties: { sessionExpiryInterval: 60 * 60 },
    keepalive: 60,
    connectTimeout: 30_000,
    reconnectPeriod: 5_000,
    resubscribe: false,
  });

  client.on("connect", async (connack) => {
    state.status = "connected";
    state.connected_since = new Date().toISOString();
    state.last_error = null;
    log.info(`connected to ${state.broker} as ${clientId} (session present: ${connack.sessionPresent})`);

    try {
      const granted = await client.subscribeAsync(subscriptions());
      for (const { topic, qos } of granted) {
        if (qos >= 0x80) log.error(`subscription to ${topic} refused (reason ${qos})`);
        else log.info(`subscribed ${topic} (qos ${qos})`);
      }
    } catch (err) {
      state.last_error = err.message;
      log.error(`subscribe failed: ${err.message}`);
    }
  });

  client.on("message", onMessage);

  client.on("reconnect", () => {
    state.status = "reconnecting";
  });

  client.on("offline", () => {
    state.status = "offline";
    state.connected_since = null;
    log.warn("disconnected from broker, retrying");
  });

  client.on("disconnect", (packet) => {
    if (packet.reasonCode === SESSION_TAKEN_OVER) {
      // A newer instance (e.g. during a Render deploy) connected with our client id — let it win.
      log.warn("session taken over by another instance with the same client id, stopping");
      void stopSubscriber();
    }
  });

  client.on("error", (err) => {
    state.last_error = err.message;
    log.error(err.message);
    if (AUTH_FAILURES.has(err.code)) {
      log.error("check MQTT_USERNAME / MQTT_PASSWORD — not retrying");
      void stopSubscriber();
    }
  });
}

export async function stopSubscriber() {
  if (!client) return;
  const closing = client;
  client = null;
  state.status = "stopped";
  state.connected_since = null;
  await Promise.allSettled([...queues.values()]);
  await closing.endAsync();
}
