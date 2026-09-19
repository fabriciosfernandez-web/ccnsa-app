/* CCNSA DEV — Firebase Cloud Messaging service worker.
 * Uses the compat build so the worker does not need a separate bundling step.
 * Firebase web configuration is public client configuration, not a secret.
 */

// Keep the notification click useful during the manual DEV test.
// Register this handler before importing Messaging so FCM does not override it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const requestedUrl = event.notification?.data?.url || '/socio/notificaciones'
  const targetUrl = new URL(requestedUrl, self.location.origin).href

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const existing = windowClients.find((client) => client.url.startsWith(self.location.origin))
      if (existing) {
        existing.navigate(targetUrl)
        return existing.focus()
      }
      return clients.openWindow(targetUrl)
    }),
  )
})

importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyDogqY0q9HsgkZ6PbMTrLDVR0eyFQuOI9k',
  authDomain: 'ccnsa-web-dev.firebaseapp.com',
  projectId: 'ccnsa-web-dev',
  storageBucket: 'ccnsa-web-dev.firebasestorage.app',
  messagingSenderId: '97068608166',
  appId: '1:97068608166:web:b6ba40ec94e8736157e267',
})

const messaging = firebase.messaging()

// The backend sends data-only messages so CCNSA owns the notification UI and
// can route the tap to the exact in-app destination.
messaging.onBackgroundMessage((payload) => {
  const data = payload?.data || {}
  const title = data.title || 'CCNSA'
  const body = data.body || 'Tenés una nueva notificación.'
  const url = data.actionUrl || '/socio/notificaciones'

  return self.registration.showNotification(title, {
    body,
    icon: '/ccnsa-app-icon.webp',
    tag: data.notificationId ? `ccnsa-${data.notificationId}` : 'ccnsa-notification',
    data: { url },
  })
})
