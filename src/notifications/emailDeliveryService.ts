import { getFunctions, httpsCallable } from 'firebase/functions'
import { firebaseApp } from '../lib/firebase'

export interface EmailQueueResult {
  notificationId: string
  socioId?: string
  status: 'QUEUED' | 'SKIPPED'
  email?: string
  reason?: string
}

function requireApp() {
  if (!firebaseApp) throw new Error('Firebase no está configurado.')
  return firebaseApp
}

export async function queueNotificationEmailNow(notificationId: string): Promise<EmailQueueResult> {
  const callable = httpsCallable<
    { notificationId: string },
    EmailQueueResult
  >(getFunctions(requireApp()), 'queueNotificationEmailNow')

  const response = await callable({ notificationId })
  return response.data
}
