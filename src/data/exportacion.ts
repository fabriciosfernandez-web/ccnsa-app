import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { appEnvironment, db } from '../lib/firebase'
import { resolveAuditActor, type AuditActorInput } from './auditActor'

const SNAPSHOT_COLLECTIONS = [
  'users',
  'socios',
  'obligaciones',
  'pagos',
  'aplicaciones_pago',
  'ingresos',
  'egresos',
  'actividades',
  'movimientos_actividad',
  'actividad_inscripciones',
  'configuracion',
  'tarifas_cuotas',
  'reglas_cobro',
  'excepciones_cobro',
  'categoria_historial',
  'notifications',
  'notification_preferences',
  'notification_deliveries',
  'audit_log',
] as const

function requireDb() {
  if (!db) throw new Error('Firebase no está configurado.')
  return db
}

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(normalizeValue)

  const timestampLike = value as { toDate?: () => Date }
  if (typeof timestampLike.toDate === 'function') {
    return {
      __type: 'timestamp',
      iso: timestampLike.toDate().toISOString(),
    }
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => [key, normalizeValue(nested)]),
  )
}

export interface ManualSnapshotResult {
  collections: number
  documents: number
  fileName: string
}

export async function downloadManualFirestoreSnapshot(actor: AuditActorInput): Promise<ManualSnapshotResult> {
  const database = requireDb()
  const actorSnapshot = await resolveAuditActor(actor)

  const snapshots = await Promise.all(
    SNAPSHOT_COLLECTIONS.map(async (collectionName) => ({
      collectionName,
      snapshot: await getDocs(collection(database, collectionName)),
    })),
  )

  const data: Record<string, Array<{ id: string; data: unknown }>> = {}
  let documents = 0

  for (const { collectionName, snapshot } of snapshots) {
    data[collectionName] = snapshot.docs.map((document) => ({
      id: document.id,
      data: normalizeValue(document.data()),
    }))
    documents += snapshot.size
  }

  const auditRef = doc(collection(database, 'audit_log'))
  const auditBatch = writeBatch(database)
  auditBatch.set(auditRef, {
    ...actorSnapshot,
    action: 'FIRESTORE_SNAPSHOT_EXPORTED',
    entity: 'firestore_snapshot',
    entityId: appEnvironment,
    documents,
    collections: SNAPSHOT_COLLECTIONS.length,
    createdAt: serverTimestamp(),
  })
  await auditBatch.commit()

  const generatedAt = new Date()
  const localDate = new Date(
    generatedAt.getTime() - generatedAt.getTimezoneOffset() * 60_000,
  ).toISOString().slice(0, 10)
  const fileName = `ccnsa-firestore-${appEnvironment}-${localDate}.json`

  const payload = {
    format: 'CCNSA_FIRESTORE_MANUAL_SNAPSHOT',
    schemaVersion: 1,
    environment: appEnvironment,
    generatedAt: generatedAt.toISOString(),
    collections: data,
    notes: [
      'Snapshot manual de consulta y contingencia.',
      'No reemplaza backups administrados, PITR ni un procedimiento formal de restauración.',
      'push_subscriptions no se incluye porque su lectura está restringida al socio propietario.',
    ],
  }

  const url = URL.createObjectURL(new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: 'application/json;charset=utf-8' },
  ))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)

  return {
    collections: SNAPSHOT_COLLECTIONS.length,
    documents,
    fileName,
  }
}
