const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')

// Exercise the compiled trigger with isolated Firestore/FCM adapters: no real sends.
function setup({ preferences = { push: true }, subscriptions = [], sendError, readError, responses } = {}) {
  const deliveries = []
  const sends = []
  const removed = []
  const database = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              assert.equal(name, 'notification_preferences')
              assert.equal(id, 'demo')
              if (readError) throw readError
              return { exists: true, data: () => preferences }
            },
            async set(value) {
              assert.equal(name, 'notification_deliveries')
              assert.equal(id, 'notice')
              deliveries.push(value)
            },
          }
        },
        where(field, operator, value) {
          assert.equal(name, 'push_subscriptions')
          assert.equal(field, 'socioId')
          assert.equal(operator, '==')
          return {
            async get() {
              return { docs: subscriptions.filter((item) => item.socioId === value).map((item) => ({
                data: () => item,
                ref: { async delete() { removed.push(item.token) } },
              })) }
            },
          }
        },
      }
    },
  }
  const adapters = {
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/firestore': { getFirestore: () => database, FieldValue: { serverTimestamp: () => 1 } },
    'firebase-admin/messaging': { getMessaging: () => ({ async sendEachForMulticast(message) {
      sends.push(message)
      if (sendError) throw sendError
      const results = responses || message.tokens.map(() => ({ success: true }))
      return { responses: results, successCount: results.filter((r) => r.success).length, failureCount: results.filter((r) => !r.success).length }
    } }) },
    'firebase-functions/v2/firestore': { onDocumentCreated: (_, handler) => handler },
    'firebase-functions/v2/https': { onCall: (_, handler) => handler, HttpsError: Error },
    'firebase-functions': { logger: { error() {} } },
  }
  const exports = {}
  runInNewContext(readFileSync(require.resolve('../lib/index.js'), 'utf8'), {
    exports,
    require(name) { assert.ok(adapters[name], name); return adapters[name] },
  })
  return {
    deliveries, sends, removed,
    run: () => exports.deliverNotificationPush({ params: { notificationId: 'notice' }, data: { data: () => ({ socioId: 'demo', title: 'Test', message: 'Test', kind: 'GENERAL_NOTICE' }) } }),
  }
}

test('sends only to enabled devices belonging to the selected socio', async () => {
  const h = setup({ subscriptions: [
    { socioId: 'demo', enabled: true, token: 'demo-token' },
    { socioId: 'other', enabled: true, token: 'other-token' },
    { socioId: 'demo', enabled: false, token: 'disabled-token' },
  ] })
  await h.run()
  assert.equal(h.sends.length, 1)
  assert.equal(JSON.stringify(h.sends[0].tokens), JSON.stringify(['demo-token']))
  assert.equal(h.deliveries.at(-1).status, 'SENT')
})

test('disabled preference does not send', async () => {
  const h = setup({ preferences: { push: false } })
  await h.run()
  assert.equal(h.sends.length, 0)
  assert.equal(h.deliveries.at(-1).reason, 'PUSH_DISABLED_BY_PREFERENCE')
})

test('missing devices has an explicit delivery result', async () => {
  const h = setup()
  await h.run()
  assert.equal(h.deliveries.at(-1).reason, 'NO_ACTIVE_PUSH_SUBSCRIPTIONS')
})

test('Firestore failure becomes visible instead of leaving no delivery', async () => {
  const h = setup({ readError: { code: 'permission-denied' } })
  await h.run()
  assert.equal(h.deliveries.at(-1).status, 'FAILED')
  assert.equal(h.deliveries.at(-1).reason, 'permission-denied')
})

test('FCM request failure records the provider code', async () => {
  const h = setup({ subscriptions: [{ socioId: 'demo', enabled: true, token: 'demo-token' }], sendError: { code: 'messaging/authentication-error' } })
  await h.run()
  assert.equal(h.deliveries.at(-1).status, 'FAILED')
  assert.equal(h.deliveries.at(-1).reason, 'messaging/authentication-error')
})

test('partial delivery reports error and removes only an invalid token', async () => {
  const h = setup({ subscriptions: [
    { socioId: 'demo', enabled: true, token: 'valid' },
    { socioId: 'demo', enabled: true, token: 'expired' },
  ], responses: [{ success: true }, { success: false, error: { code: 'messaging/registration-token-not-registered' } }] })
  await h.run()
  assert.deepEqual(h.removed, ['expired'])
  assert.equal(h.deliveries.at(-1).status, 'PARTIAL')
  assert.equal(h.deliveries.at(-1).reason, 'messaging/registration-token-not-registered')
})
