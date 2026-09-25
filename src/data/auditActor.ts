import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

export interface AuditActorSnapshot {
  actorUid: string
  actorNombre: string
  actorEmail: string | null
  actorRol: string | null
}

export type AuditActorInput = string | AuditActorSnapshot

function requireDb() {
  if (!db) throw new Error('Firebase no está configurado.')
  return db
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function resolveAuditActor(actor: AuditActorInput): Promise<AuditActorSnapshot> {
  if (typeof actor !== 'string') return actor

  const database = requireDb()
  const snapshot = await getDoc(doc(database, 'users', actor))
  const data = snapshot.exists() ? snapshot.data() : {}

  return {
    actorUid: actor,
    actorNombre: asString(data.displayName) || asString(data.nombre) || actor,
    actorEmail: asString(data.email) || null,
    actorRol: asString(data.role) || null,
  }
}
