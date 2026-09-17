import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { NotificationService } from './NotificationService'
import type { AccountNotification, NotificationKind, NotificationPreferences } from './types'

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

export const firestoreNotificationService: NotificationService = {
  async listForSocio(socioId) {
    const database = requireDb()
    const snapshot = await getDocs(query(collection(database, 'notifications'), where('socioId', '==', socioId)))
    return snapshot.docs
      .map(mapNotification)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
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
