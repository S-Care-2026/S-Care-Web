const assert = require('node:assert/strict')
const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')

const source = ts.transpileModule(readFileSync(join(__dirname, '../src/data/activity.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function browser({ visible = true, token = 'test-token' } = {}) {
  let now = 0
  let interval
  const requests = []
  const events = new Map()
  const listeners = {
    addEventListener: (name, handler) => events.set(name, handler),
    removeEventListener: (name) => events.delete(name),
  }
  const document = { ...listeners, visibilityState: visible ? 'visible' : 'hidden' }
  const exports = {}
  runInNewContext(source, {
    exports,
    require: () => ({ API_URL: 'https://example.org', getToken: () => token }),
    performance: { now: () => now },
    document,
    window: { ...listeners, setInterval: (fn) => { interval = fn; return 1 }, clearInterval: () => { interval = null } },
    fetch: (url, options) => { requests.push({ url, ...JSON.parse(options.body) }); return Promise.resolve({ ok: true }) },
  })
  const stop = exports.startActivityTracking()
  return {
    requests, stop, events,
    tick: (ms) => { now += ms; interval?.() },
    advance: (ms) => { now += ms },
    visibility: (state) => { document.visibilityState = state; events.get('visibilitychange')?.() },
    event: (name) => events.get(name)?.(),
  }
}

test('visible heartbeat, hidden pause and resume exclude background time', () => {
  const b = browser()
  assert.deepEqual(b.requests.map((r) => r.activeMs), [0])
  b.tick(30000)
  b.advance(5000)
  b.visibility('hidden')
  b.tick(30000)
  b.tick(30000)
  assert.deepEqual(b.requests.map((r) => r.activeMs), [0, 30000, 5000])
  b.visibility('visible')
  b.tick(30000)
  assert.deepEqual(b.requests.map((r) => r.activeMs), [0, 30000, 5000, 0, 30000])
  b.stop()
})

test('hidden initial tabs do not send and suspended timers do not accrue time', () => {
  const b = browser({ visible: false })
  b.tick(30000)
  assert.equal(b.requests.length, 0)
  b.visibility('visible')
  b.tick(3600000)
  assert.deepEqual(b.requests.map((r) => r.activeMs), [0, 0])
  b.stop()
})

test('page exit flushes once and back-forward restoration resets the clock', () => {
  const b = browser()
  b.advance(10000)
  b.event('pagehide')
  b.tick(600000)
  assert.deepEqual(b.requests.map((r) => r.activeMs), [0, 10000])
  b.event('pageshow')
  b.tick(30000)
  b.stop()
  const count = b.requests.length
  b.tick(30000)
  assert.equal(b.events.size, 0)
  assert.equal(b.requests.length, count)
  assert.deepEqual(b.requests.slice(0, 4).map((r) => r.activeMs), [0, 10000, 0, 30000])
})

test('no token means no activity is sent', () => {
  const b = browser({ token: null })
  b.tick(30000)
  b.stop()
  assert.equal(b.requests.length, 0)
})
