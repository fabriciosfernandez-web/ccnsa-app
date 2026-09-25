import { firebaseApp } from '../lib/firebase'

export async function ensureMessagingServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('Este navegador no dispone de Service Worker.')
  }
  if (!firebaseApp) throw new Error('Firebase no está configurado.')

  const options = firebaseApp.options
  const params = new URLSearchParams({
    apiKey: String(options.apiKey || ''),
    authDomain: String(options.authDomain || ''),
    projectId: String(options.projectId || ''),
    storageBucket: String(options.storageBucket || ''),
    messagingSenderId: String(options.messagingSenderId || ''),
    appId: String(options.appId || ''),
  })

  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${params.toString()}`,
  )
  await navigator.serviceWorker.ready
  return registration
}
