import { getFunctions, httpsCallable } from 'firebase/functions'
import { firebaseApp } from '../lib/firebase'

export interface PushRecipientStatus {
  socioId: string
  activeDevices: number
  pushEnabled: boolean
  inAppEnabled: boolean
  emailEnabled: boolean
  deliverable: boolean
}

export async function getPushRecipientStatus(socioId: string): Promise<PushRecipientStatus> {
  if (!firebaseApp) throw new Error('Firebase no está configurado.')

  const callable = httpsCallable<{ socioId: string }, PushRecipientStatus>(
    getFunctions(firebaseApp),
    'getPushRecipientStatus',
  )

  const response = await callable({ socioId })
  return response.data
}
