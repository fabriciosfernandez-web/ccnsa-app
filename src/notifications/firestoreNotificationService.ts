import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { resolveAuditActor } from '../data/auditActor'
import type { NotificationService } from './NotificationService'
import type { AccountNotification, NotificationDelivery, NotificationKind, NotificationPreferences } from './types'

const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'socioId'> = {
  inApp: true,
  email: false,
  push: false,
  overdueReminders: true,
  paymentConfirmations: true,
  monthlyStatements: true,
}

function requireDb() {
  if (!db) throw new Error('Firebase no está configurado.')
  return db
}

function timestampToIso(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().toISOString()
  }
  if (typeof value === 'string' && value) return value
  return new Date(0).toISOString()
}

function notificationKind(value: unknown): NotificationKind {
  const kind = String(value ?? '')
  if (
    kind === 'ACCOUNT_STATEMENT_READY'
    || kind === 'PAYMENT_POSTED'
    || kind === 'OBLIGATION_POSTED'
    || kind === 'OVERDUE_REMINDER'
    || kind === 'GENERAL_NOTICE'
  ) return kind
  return 'GENERAL_NOTICE'
}

function mapNotification(snapshot: QueryDocumentSnapshot<DocumentData>): AccountNotification {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    socioId: String(data.socioId ?? ''),
    kind: notificationKind(data.kind),
    title: String(data.title ?? 'Notificación'),
    message: String(data.message ?? ''),
    status: data.status === 'READ' ? 'READ' : 'UNREAD',
    createdAt: timestampToIso(data.createdAt),
    readAt: data.readAt ? timestampToIso(data.readAt) : undefined,
    accountPeriod: data.accountPeriod ? String(data.accountPeriod) : undefined,
    amount: typeof data.amount === 'number' ? data.amount : undefined,
    currency: data.currency === 'PYG' ? 'PYG' : undefined,
    actionUrl: data.actionUrl ? String(data.actionUrl) : undefined,
    sourceType: data.sourceType ? String(data.sourceType) : undefined,
    sourceId: data.sourceId ? String(data.sourceId) : undefined,
    deduplicationKey: data.deduplicationKey ? String(data.deduplicationKey) : undefined,
  }
}

function mapPreferences(socioId: string, data?: DocumentData): NotificationPreferences {
  return {
    socioId,
    inApp: data?.inApp !== false,
    email: data?.email === true,
    push: data?.push === true,
    overdueReminders: data?.overdueReminders !== false,
    paymentConfirmations: data?.paymentConfirmations !== false,
    monthlyStatements: data?.monthlyStatements !== false,
  }
}

function notificationsQuery(socioId: string) {
  const database = requireDb()
  return query(collection(database, 'notifications'), where('socioId', '==', socioId))
}

function sortNotifications(items: AccountNotification[]) {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function subscribeNotificationsForSocio(
  socioId: string,
  onItems: (items: AccountNotification[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    notificationsQuery(socioId),
    (snapshot) => onItems(sortNotifications(snapshot.docs.map(mapNotification))),
    (caught) => onError?.(caught instanceof Error ? caught : new Error('No fue posible escuchar las notificaciones.')),
  )
}

export async function markAllNotificationsAsRead(socioId: string) {
  const database = requireDb()
  const snapshot = await getDocs(notificationsQuery(socioId))
  const unread = snapshot.docs.filter((item) => item.data().status !== 'READ')
  if (unread.length === 0) return 0

  const batch = writeBatch(database)
  unread.forEach((item) => {
    batch.update(item.ref, {
      status: 'READ',
      readAt: serverTimestamp(),
    })
  })
  await batch.commit()
  return unread.length
}

export const firestoreNotificationService: NotificationService = {
  async listForSocio(socioId) {
    const snapshot = await getDocs(notificationsQuery(socioId))
    return sortNotifications(snapshot.docs.map(mapNotification))
  },

  async countUnread(socioId) {
    const items = await this.listForSocio(socioId)
    return items.filter((item) => item.status === 'UNREAD').length
  },

  async markAsRead(notificationId, socioId) {
    const database = requireDb()
    const notificationRef = doc(database, 'notifications', notificationId)
    const snapshot = await getDoc(notificationRef)
    if (!snapshot.exists() || String(snapshot.data().socioId ?? '') !== socioId) {
      throw new Error('La notificación no pertenece a este socio.')
    }
    if (snapshot.data().status === 'READ') return
    await updateDoc(notificationRef, {
      status: 'READ',
      readAt: serverTimestamp(),
    })
  },

  async getPreferences(socioId) {
    const database = requireDb()
    const snapshot = await getDoc(doc(database, 'notification_preferences', socioId))
    return mapPreferences(socioId, snapshot.exists() ? snapshot.data() : DEFAULT_PREFERENCES)
  },

  async savePreferences(preferences) {
    const database = requireDb()
    await setDoc(doc(database, 'notification_preferences', preferences.socioId), {
      ...preferences,
      updatedAt: serverTimestamp(),
    }, { merge: true })
  },
}


export interface GeneralNoticeInput {
  socioId: string
  title: string
  message: string
  actionUrl?: '/socio' | '/socio/notificaciones'
}

export async function createGeneralNotice(input: GeneralNoticeInput, actorUid: string) {
  const database = requireDb()
  const actorSnapshot = await resolveAuditActor(actorUid)
  const preferencesSnapshot = await getDoc(doc(database, 'notification_preferences', input.socioId))
  const preferences = mapPreferences(
    input.socioId,
    preferencesSnapshot.exists() ? preferencesSnapshot.data() : DEFAULT_PREFERENCES,
  )

  if (!preferences.inApp) {
    return { created: false as const, reason: 'IN_APP_DISABLED' as const }
  }

  const notificationRef = doc(collection(database, 'notifications'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)
  const actionUrl = input.actionUrl === '/socio/notificaciones' ? '/socio/notificaciones' : '/socio'

  batch.set(notificationRef, {
    socioId: input.socioId,
    kind: 'GENERAL_NOTICE',
    title: input.title.trim(),
    message: input.message.trim(),
    status: 'UNREAD',
    createdAt: serverTimestamp(),
    actionUrl,
    sourceType: 'manual_notice',
    sourceId: notificationRef.id,
    deduplicationKey: `general:${notificationRef.id}`,
    createdByUid: actorUid,
  })

  batch.set(auditRef, {
    ...actorSnapshot,
    action: 'GENERAL_NOTICE_CREATED',
    entity: 'notifications',
    entityId: notificationRef.id,
    socioId: input.socioId,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
  return { created: true as const, id: notificationRef.id }
}


export async function listRecentPushDeliveries(limit = 12): Promise<NotificationDelivery[]> {
  const database = requireDb()
  const snapshot = await getDocs(collection(database, 'notification_deliveries'))
  const deliveries = snapshot.docs.map((item) => {
    const data = item.data()
    const rawStatus = String(data.status ?? 'PENDING')
    const status: NotificationDelivery['status'] = rawStatus === 'SENT'
      || rawStatus === 'PARTIAL'
      || rawStatus === 'FAILED'
      || rawStatus === 'SKIPPED'
      ? rawStatus
      : 'PENDING'

    return {
      id: item.id,
      notificationId: String(data.notificationId ?? item.id),
      socioId: data.socioId ? String(data.socioId) : undefined,
      channel: 'PUSH' as const,
      status,
      updatedAt: data.updatedAt ? timestampToIso(data.updatedAt) : undefined,
      attempted: typeof data.attempted === 'number' ? data.attempted : undefined,
      successCount: typeof data.successCount === 'number' ? data.successCount : undefined,
      failureCount: typeof data.failureCount === 'number' ? data.failureCount : undefined,
      reason: data.reason ? String(data.reason) : undefined,
    }
  })

  return deliveries
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
    .slice(0, Math.max(1, limit))
}
