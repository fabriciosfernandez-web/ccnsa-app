import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import { db, firebaseApp } from '../lib/firebase'
import { storedVapidKey } from './webPushDev'

const DEVICE_SUBSCRIPTION_KEY = 'ccnsa:push:subscription-id'

function requireFirebase() {
  if (!firebaseApp || !db) throw new Error('Firebase no está configurado.')
  return { app: firebaseApp, database: db }
}

async function ensureMessagingServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('Este navegador no dispone de Service Worker.')
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  await navigator.serviceWorker.ready
  return registration
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export interface PushDeviceRegistration {
  subscriptionId: string
  token: string
}

export async function registerPushDevice(socioId: string, uid: string): Promise<PushDeviceRegistration> {
  const { app, database } = requireFirebase()
  const supported = await isSupported().catch(() => false)
  if (!supported) throw new Error('Este navegador no soporta Firebase Cloud Messaging web.')

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()

  if (permission !== 'granted') {
    throw new Error('El navegador no concedió permiso para mostrar notificaciones.')
  }

  const registration = await ensureMessagingServiceWorker()
  const messaging = getMessaging(app)
  const vapidKey = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || storedVapidKey()).trim()
  const token = await getToken(
    messaging,
    vapidKey
      ? { vapidKey, serviceWorkerRegistration: registration }
      : { serviceWorkerRegistration: registration },
  )

  if (!token) throw new Error('FCM no devolvió un token para este dispositivo.')

  const subscriptionId = await sha256(token)
  await setDoc(doc(database, 'push_subscriptions', subscriptionId), {
    socioId,
    uid,
    token,
    enabled: true,
    platform: 'web',
    userAgent: navigator.userAgent,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true })

  window.localStorage.setItem(DEVICE_SUBSCRIPTION_KEY, subscriptionId)
  return { subscriptionId, token }
}

export async function disableCurrentPushDevice(socioId: string, uid: string) {
  const { database } = requireFirebase()
  const subscriptionId = window.localStorage.getItem(DEVICE_SUBSCRIPTION_KEY)
  if (!subscriptionId) return false

  await deleteDoc(doc(database, 'push_subscriptions', subscriptionId))
  window.localStorage.removeItem(DEVICE_SUBSCRIPTION_KEY)
  void socioId
  void uid
  return true
}

export function hasStoredPushDevice() {
  if (typeof window === 'undefined') return false
  return Boolean(window.localStorage.getItem(DEVICE_SUBSCRIPTION_KEY))
}
