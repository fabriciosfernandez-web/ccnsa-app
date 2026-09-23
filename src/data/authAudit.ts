import { getFunctions, httpsCallable } from 'firebase/functions'
import { firebaseApp } from '../lib/firebase'

export type AuthAuditAction = 'LOGIN_SUCCESS' | 'LOGOUT'

export async function recordAuthAuditEvent(action: AuthAuditAction) {
  if (!firebaseApp) return false

  const callable = httpsCallable<
    { action: AuthAuditAction },
    { recorded: boolean; reason?: string }
  >(getFunctions(firebaseApp), 'recordAuthEvent')

  const response = await callable({ action })
  return response.data.recorded === true
}
