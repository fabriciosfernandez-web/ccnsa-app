import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'

initializeApp()

const database = getFirestore()

type NotificationData = {
  socioId?: unknown
  kind?: unknown
  title?: unknown
  message?: unknown
  actionUrl?: unknown
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function preferenceAllowsKind(kind: string, preferences: Record<string, unknown>) {
  if (preferences.push !== true) return false
  if (kind === 'PAYMENT_POSTED') return preferences.paymentConfirmations !== false
  if (kind === 'OVERDUE_REMINDER') return preferences.overdueReminders !== false
  if (kind === 'ACCOUNT_STATEMENT_READY') return preferences.monthlyStatements !== false
  return true
}

async function writeDelivery(
  notificationId: string,
  payload: Record<string, unknown>,
) {
  await database.collection('notification_deliveries').doc(notificationId).set({
    ...payload,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
}

export const deliverNotificationPush = onDocumentCreated(
  {
    document: 'notifications/{notificationId}',
    minInstances: 0,
    maxInstances: 1,
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (event) => {
    const snapshot = event.data
    const notificationId = event.params.notificationId

    if (!snapshot) return

    const notification = snapshot.data() as NotificationData
    const socioId = stringValue(notification.socioId)
    const title = stringValue(notification.title, 'CCNSA')
    const body = stringValue(notification.message, 'Tenés una nueva notificación.')
    const kind = stringValue(notification.kind, 'GENERAL_NOTICE')
    const actionUrl = stringValue(notification.actionUrl, '/socio/notificaciones')

    if (!socioId) {
      await writeDelivery(notificationId, {
        status: 'SKIPPED',
        reason: 'MISSING_SOCIO_ID',
      })
      return
    }

    const preferenceSnapshot = await database
      .collection('notification_preferences')
      .doc(socioId)
      .get()

    const preferences = preferenceSnapshot.exists
      ? preferenceSnapshot.data() ?? {}
      : {}

    if (!preferenceAllowsKind(kind, preferences)) {
      await writeDelivery(notificationId, {
        status: 'SKIPPED',
        reason: 'PUSH_DISABLED_BY_PREFERENCE',
        socioId,
      })
      return
    }

    const subscriptionsSnapshot = await database
      .collection('push_subscriptions')
      .where('socioId', '==', socioId)
      .get()

    const subscriptions = subscriptionsSnapshot.docs
      .map((document) => ({
        ref: document.ref,
        token: stringValue(document.data().token),
        enabled: document.data().enabled === true,
      }))
      .filter((item) => item.enabled && item.token)

    if (subscriptions.length === 0) {
      await writeDelivery(notificationId, {
        status: 'SKIPPED',
        reason: 'NO_ACTIVE_PUSH_SUBSCRIPTIONS',
        socioId,
      })
      return
    }

    const selected = subscriptions.slice(0, 500)
    const result = await getMessaging().sendEachForMulticast({
      tokens: selected.map((item) => item.token),
      data: {
        title,
        body,
        actionUrl: actionUrl.startsWith('/') ? actionUrl : '/socio/notificaciones',
        notificationId,
        kind,
      },
      webpush: {
        headers: {
          TTL: '86400',
          Urgency: kind === 'OVERDUE_REMINDER' ? 'normal' : 'high',
        },
      },
    })

    const invalidCodes = new Set([
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
    ])

    const cleanup: Promise<unknown>[] = []
    result.responses.forEach((response, index) => {
      if (response.success) return
      const code = response.error?.code || ''
      if (invalidCodes.has(code)) {
        cleanup.push(selected[index].ref.delete())
      }
    })
    await Promise.all(cleanup)

    await writeDelivery(notificationId, {
      status: result.failureCount === 0 ? 'SENT' : result.successCount > 0 ? 'PARTIAL' : 'FAILED',
      socioId,
      attempted: selected.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
      staleSubscriptionsRemoved: cleanup.length,
    })
  },
)
