/* Firebase Cloud Messaging service worker for CCNSA DEV.
 * Uses the compat build so the worker does not need a separate bundling step.
 * Firebase web configuration is public client configuration, not a secret.
 */
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

firebase.messaging()
