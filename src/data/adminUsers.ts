import { getFunctions, httpsCallable } from 'firebase/functions'
import { firebaseApp } from '../lib/firebase'
import type { UserRole } from '../auth/AuthProvider'

export interface AdminUserAccess {
  uid: string
  email: string | null
  displayName: string
  role: UserRole | null
  socioId: string | null
  active: boolean
  linked: boolean
  authDisabled: boolean
  providerIds: string[]
  createdAt: string | null
  lastSignInAt: string | null
}

interface ListUserAccessResponse {
  users: AdminUserAccess[]
}

export interface UpdateUserAccessInput {
  uid: string
  role: UserRole
  socioId?: string
  active: boolean
}

function requireApp() {
  if (!firebaseApp) throw new Error('Firebase no está configurado.')
  return firebaseApp
}

export async function listUserAccessAccounts(): Promise<AdminUserAccess[]> {
  const callable = httpsCallable<Record<string, never>, ListUserAccessResponse>(
    getFunctions(requireApp()),
    'listUserAccessAccounts',
  )
  const response = await callable({})
  return response.data.users
}

export async function updateUserAccess(input: UpdateUserAccessInput): Promise<AdminUserAccess> {
  const callable = httpsCallable<UpdateUserAccessInput, AdminUserAccess>(
    getFunctions(requireApp()),
    'updateUserAccess',
  )
  const response = await callable(input)
  return response.data
}
