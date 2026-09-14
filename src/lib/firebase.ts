import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { initializeFirestore, type Firestore } from 'firebase/firestore'

// Firebase web configuration is public client configuration, not a private credential.
// Environment variables override these development defaults when another environment is used.
const devFirebaseConfig = {
  apiKey: 'AIzaSyDogqY0q9HsgkZ6PbMTrLDVR0eyFQuOI9k',
  authDomain: 'ccnsa-web-dev.firebaseapp.com',
  projectId: 'ccnsa-web-dev',
  storageBucket: 'ccnsa-web-dev.firebasestorage.app',
  messagingSenderId: '97068608166',
  appId: '1:97068608166:web:b6ba40ec94e8736157e267',
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || devFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || devFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || devFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || devFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || devFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || devFirebaseConfig.appId,
}

const requiredConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
]

export const firebaseConfigured = requiredConfig.every(Boolean)

export const firebaseApp: FirebaseApp | null = firebaseConfigured
  ? initializeApp(firebaseConfig)
  : null

export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null
export const db: Firestore | null = firebaseApp
  ? initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true })
  : null
