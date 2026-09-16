import { collection, getDocs, type DocumentData } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type {
  MigrationDryRun2026,
  MigrationDryRunCollection,
  MigrationDryRunDocument,
} from './migrationDryRun2026'

export interface MigrationPreflightCollision {
  collection: MigrationDryRunCollection
  id: string
  memberName: string
  compatibleResume: boolean
  reason: string
}

export interface MigrationPreflightIdentityConflict {
  memberName: string
  plannedSocioId: string
  existingSocioId: string
  reason: string
}

export interface MigrationPreflight2026 {
  status: 'LISTO' | 'BLOQUEADO'
  fingerprint: string
  checkedAt: string
  plannedDocuments: number
  freeIds: number
  compatibleExisting: number
  collisions: MigrationPreflightCollision[]
  identityConflicts: MigrationPreflightIdentityConflict[]
  priorMatchingAuditEntries: number
  existingMigrationDocuments: number
  existingCollectionCounts: Record<MigrationDryRunCollection, number>
  blockers: string[]
  warnings: string[]
}

const COLLECTIONS: MigrationDryRunCollection[] = [
  'socios',
  'obligaciones',
  'pagos',
  'aplicaciones_pago',
  'excepciones_cobro',
  'categoria_historial',
]

function requireDb() {
  if (!db) throw new Error('Firebase no está configurado.')
  return db
}

function normalizeName(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function normalizedMemberNumber(value: unknown) {
  return String(value ?? '').trim()
}

function migrationFingerprint(data: DocumentData) {
  if (typeof data.migrationFingerprint === 'string') return data.migrationFingerprint
  const migration = data.migration
  if (migration && typeof migration === 'object') {
    const value = (migration as Record<string, unknown>).fingerprint
    if (typeof value === 'string') return value
  }
  return null
}

function isMigrationDocument(data: DocumentData) {
  const origen = String(data.origen ?? '')
  const migration = data.migration
  const source = migration && typeof migration === 'object'
    ? String((migration as Record<string, unknown>).source ?? '')
    : ''
  return origen.startsWith('MIGRACION_') || source === 'LISTA_MIEMBROS_2026'
}

function plannedSocios(plan: MigrationDryRun2026) {
  return plan.documents.filter((item): item is MigrationDryRunDocument => item.collection === 'socios')
}

export async function runMigrationPreflight2026(plan: MigrationDryRun2026): Promise<MigrationPreflight2026> {
  const database = requireDb()
  const blockers: string[] = []
  const warnings: string[] = []

  if (plan.status !== 'LISTO') blockers.push('El dry-run 3C está BLOQUEADO; no corresponde ejecutar preflight de importación.')

  const snapshots = await Promise.all(
    COLLECTIONS.map(async (name) => ({ name, snapshot: await getDocs(collection(database, name)) })),
  )

  const existingByCollection = new Map<MigrationDryRunCollection, Map<string, DocumentData>>()
  const existingCollectionCounts = Object.fromEntries(COLLECTIONS.map((name) => [name, 0])) as Record<MigrationDryRunCollection, number>
  let existingMigrationDocuments = 0

  for (const { name, snapshot } of snapshots) {
    const docs = new Map<string, DocumentData>()
    existingCollectionCounts[name] = snapshot.size
    for (const item of snapshot.docs) {
      const data = item.data()
      docs.set(item.id, data)
      if (isMigrationDocument(data)) existingMigrationDocuments += 1
    }
    existingByCollection.set(name, docs)
  }

  const collisions: MigrationPreflightCollision[] = []
  for (const planned of plan.documents) {
    const existing = existingByCollection.get(planned.collection)?.get(planned.id)
    if (!existing) continue
    const sameFingerprint = migrationFingerprint(existing) === plan.fingerprint
    collisions.push({
      collection: planned.collection,
      id: planned.id,
      memberName: planned.memberName,
      compatibleResume: sameFingerprint,
      reason: sameFingerprint
        ? 'El ID ya existe y declara el mismo fingerprint; sería compatible con una futura reanudación idempotente.'
        : 'El ID determinístico ya existe, pero no acredita el mismo fingerprint de migración.',
    })
  }

  const hardCollisions = collisions.filter((item) => !item.compatibleResume)
  if (hardCollisions.length > 0) blockers.push(`${hardCollisions.length} ID(s) determinístico(s) colisionan con documentos existentes.`)
  const compatibleExisting = collisions.length - hardCollisions.length
  if (compatibleExisting > 0) warnings.push(`${compatibleExisting} documento(s) ya existen con el mismo fingerprint; una importación real deberá tratarlos como reanudación, no recrearlos.`)

  const existingSocios = existingByCollection.get('socios') ?? new Map<string, DocumentData>()
  const identityConflicts: MigrationPreflightIdentityConflict[] = []
  for (const planned of plannedSocios(plan)) {
    const plannedNumber = normalizedMemberNumber(planned.data.numeroSocio)
    const plannedName = normalizeName(planned.data.nombre)
    for (const [existingId, data] of existingSocios) {
      if (existingId === planned.id) continue
      const existingNumber = normalizedMemberNumber(data.numeroSocio)
      const existingName = normalizeName(data.nombre)
      if (plannedNumber && existingNumber && plannedNumber === existingNumber) {
        identityConflicts.push({
          memberName: planned.memberName,
          plannedSocioId: planned.id,
          existingSocioId: existingId,
          reason: `Ya existe otro socio con número ${plannedNumber}.`,
        })
        break
      }
      if (plannedName && existingName && plannedName === existingName) {
        identityConflicts.push({
          memberName: planned.memberName,
          plannedSocioId: planned.id,
          existingSocioId: existingId,
          reason: 'Ya existe otro socio con el mismo nombre normalizado.',
        })
        break
      }
    }
  }
  if (identityConflicts.length > 0) blockers.push(`${identityConflicts.length} socio(s) del plan coinciden con identidades ya existentes en Firestore.`)

  const auditSnapshot = await getDocs(collection(database, 'audit_log'))
  let priorMatchingAuditEntries = 0
  for (const item of auditSnapshot.docs) {
    const data = item.data()
    const fingerprint = String(data.migrationFingerprint ?? data.fingerprint ?? '')
    const action = String(data.action ?? '')
    if (fingerprint === plan.fingerprint && action.startsWith('MIGRATION_2026')) priorMatchingAuditEntries += 1
  }
  if (priorMatchingAuditEntries > 0) {
    warnings.push(`El audit_log ya contiene ${priorMatchingAuditEntries} entrada(s) para este fingerprint; antes de escribir habrá que validar si corresponde reanudar o bloquear.`)
  }

  const freeIds = plan.totals.documentos - collisions.length
  if (freeIds + collisions.length !== plan.totals.documentos) blockers.push('El conteo de IDs del preflight no coincide con el dry-run 3C.')

  if (existingMigrationDocuments === 0) {
    warnings.push('No se detectaron documentos previos originados por esta migración en las seis colecciones objetivo.')
  } else {
    warnings.push(`Se detectaron ${existingMigrationDocuments} documento(s) con metadatos de migración en las colecciones objetivo; deben revisarse antes de cualquier escritura real.`)
  }

  return {
    status: blockers.length === 0 ? 'LISTO' : 'BLOQUEADO',
    fingerprint: plan.fingerprint,
    checkedAt: new Date().toISOString(),
    plannedDocuments: plan.totals.documentos,
    freeIds,
    compatibleExisting,
    collisions,
    identityConflicts,
    priorMatchingAuditEntries,
    existingMigrationDocuments,
    existingCollectionCounts,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
  }
}
