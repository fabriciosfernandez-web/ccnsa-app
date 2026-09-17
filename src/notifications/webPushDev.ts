import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging'
import { appEnvironment, firebaseApp } from '../lib/firebase'

const STORAGE_KEY = 'ccnsa:dev:vapid-key'

export interface PushSetupState {
  supported: boolean
  permission: NotificationPermission | 'unavailable'
  secureContext: boolean
}

export function storedVapidKey() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(STORAGE_KEY) ?? ''
}

export function saveVapidKey(value: string) {
  if (typeof window === 'undefined') return
  const trimmed = value.trim()
  if (trimmed) window.localStorage.setItem(STORAGE_KEY, trimmed)
  else window.localStorage.removeItem(STORAGE_KEY)
}

export async function inspectPushSupport(): Promise<PushSetupState> {
  const secureContext = typeof window !== 'undefined' && window.isSecureContext
  const notificationAvailable = typeof Notification !== 'undefined'
  const supported = Boolean(
    secureContext
    && notificationAvailable
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && await isSupported().catch(() => false),
  )

  return {
    supported,
    permission: notificationAvailable ? Notification.permission : 'unavailable',
    secureContext,
  }
}

export async function registerPushForManualTest(vapidKey: string) {
  if (appEnvironment !== 'dev') {
    throw new Error('La activación manual de push está habilitada únicamente en DEV.')
  }
  if (!firebaseApp) throw new Error('Firebase no está configurado.')

  const support = await inspectPushSupport()
  if (!support.secureContext) throw new Error('Push web requiere HTTPS.')
  if (!support.supported) throw new Error('Este navegador no soporta Firebase Cloud Messaging web.')

  const key = vapidKey.trim()
  if (!key) throw new Error('Pegá primero la clave pública VAPID de Firebase.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('El navegador no concedió permiso para mostrar notificaciones.')
  }

  saveVapidKey(key)
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  await navigator.serviceWorker.ready

  const messaging = getMessaging(firebaseApp)
  const token = await getToken(messaging, {
    vapidKey: key,
    serviceWorkerRegistration: registration,
  })

  if (!token) throw new Error('FCM no devolvió un token para este navegador.')
  return token
}

export async function subscribeForegroundMessages(handler: (payload: MessagePayload) => void) {
  if (!firebaseApp) return () => undefined
  const support = await inspectPushSupport()
  if (!support.supported) return () => undefined
  const messaging = getMessaging(firebaseApp)
  return onMessage(messaging, handler)
}
