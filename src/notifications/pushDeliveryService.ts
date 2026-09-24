import { getFunctions, httpsCallable } from 'firebase/functions'
import { firebaseApp } from '../lib/firebase'

export interface PushDeliveryResult {
  notificationId: string
  socioId?: string
  status: 'SENT' | 'PARTIAL' | 'FAILED' | 'SKIPPED'
  attempted?: number
  successCount?: number
  failureCount?: number
  reason?: string
}

function requireApp() {
  if (!firebaseApp) throw new Error('Firebase no está configurado.')
  return firebaseApp
}

export async function deliverNotificationPushNow(notificationId: string): Promise<PushDeliveryResult> {
  const callable = httpsCallable<
    { notificationId: string },
    PushDeliveryResult
  >(getFunctions(requireApp()), 'deliverNotificationPushNow')

  const response = await callable({ notificationId })
  return response.data
}
