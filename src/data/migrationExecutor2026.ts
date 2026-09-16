import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { MIGRATION_APPROVED_BASELINE_2026 } from './migrationApprovedBaseline2026'
import type {
  MigrationDryRun2026,
  MigrationDryRunCollection,
  MigrationDryRunDocument,
} from './migrationDryRun2026'
import { runMigrationPreflight2026 } from './migrationPreflight2026'

const WRITE_BATCH_SAFE_SIZE = 350
const EPSILON = 0.5

export interface MigrationExecutionProgress2026 {
  phase: 'PRECHECK' | 'WRITING' | 'VERIFYING' | 'COMPLETED'
  totalDocuments: number
  alreadyPresent: number
  pendingDocuments: number
  writtenDocuments: number
  committedBatches: number
  totalBatches: number
}

export interface MigrationExecutionResult2026 {
  status: 'COMPLETED' | 'ALREADY_COMPLETED'
  fingerprint: string
  totalDocuments: number
  alreadyPresent: number
  writtenDocuments: number
  committedBatches: number
  completionAuditId: string
}

export interface MigrationExecutionOptions2026 {
  actorUid: string
  /**
   * The caller must rebuild the plan from a fresh Google Sheets read immediately
   * before invoking this executor. This function deliberately does not own OAuth.
   */
  sourceWasRevalidatedImmediatelyBeforeExecution: boolean
  onProgress?: (progress: MigrationExecutionProgress2026) => void
}

function requireDb(): Firestore {
  if (!db) throw new Error('Firebase no está configurado.')
  return db
}

function approvedBaselineMatches(plan: MigrationDryRun2026) {
  const baseline = MIGRATION_APPROVED_BASELINE_2026
  return plan.status === 'LISTO'
    && plan.fingerprint === baseline.fingerprint
    && plan.totals.documentos === baseline.plannedDocuments
    && Math.abs(plan.totals.deuda2026 - baseline.deuda2026) <= EPSILON
    && Math.abs(plan.totals.deuda2025 - baseline.deuda2025) <= EPSILON
    && Math.abs(plan.totals.deudaTotal - baseline.deudaTotal) <= EPSILON
}

function migrationDocumentKey(item: MigrationDryRunDocument) {
  return `${item.collection}/${item.id}`
}

function completionAuditId(fingerprint: string) {
  return `migration-2026-complete-${fingerprint}`
}

function batchAuditId(fingerprint: string, first: MigrationDryRunDocument, last: MigrationDryRunDocument) {
  const clean = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)
  return `migration-2026-batch-${fingerprint}-${clean(first.id)}-${clean(last.id)}`
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function withExecutionMetadata(
  item: MigrationDryRunDocument,
  plan: MigrationDryRun2026,
  actorUid: string,
): DocumentData {
  const originalMigration = item.data.migration
  const migration = originalMigration && typeof originalMigration === 'object'
    ? originalMigration as Record<string, unknown>
    : {}

  const data: Record<string, unknown> = {
    ...item.data,
    migrationFingerprint: plan.fingerprint,
    migrationPlanVersion: plan.planVersion,
    migration: {
      ...migration,
      fingerprint: plan.fingerprint,
      approvedBaselineAcceptedAt: MIGRATION_APPROVED_BASELINE_2026.acceptedAt,
    },
    migratedAt: serverTimestamp(),
    migratedByUid: actorUid,
  }

  // Firestore rules make these immutable audit-linked records require the
  // authenticated actor explicitly.
  if (item.collection === 'aplicaciones_pago' || item.collection === 'categoria_historial') {
    data.actorUid = actorUid
  }

  return data
}

async function completionAuditExists(database: Firestore, fingerprint: string) {
  const id = completionAuditId(fingerprint)
  const snapshot = await getDoc(doc(database, 'audit_log', id))
  return { id, exists: snapshot.exists(), data: snapshot.data() }
}

/**
 * Executes the already-approved migration plan.
 *
 * IMPORTANT: do not call this from UI unless the user has explicitly approved
 * the real import in the current interaction. Merely importing this module does
 * not write anything.
 */
export async function executeMigration2026(
  plan: MigrationDryRun2026,
  options: MigrationExecutionOptions2026,
): Promise<MigrationExecutionResult2026> {
  const database = requireDb()
  const actorUid = options.actorUid.trim()
  if (!actorUid) throw new Error('No hay actorUid autenticado para ejecutar la migración.')
  if (!options.sourceWasRevalidatedImmediatelyBeforeExecution) {
    throw new Error('La fuente debe revalidarse inmediatamente antes de la primera escritura.')
  }
  if (!approvedBaselineMatches(plan)) {
    throw new Error(
      `El plan ${plan.fingerprint} no coincide con el baseline aprobado ${MIGRATION_APPROVED_BASELINE_2026.fingerprint}.`,
    )
  }

  options.onProgress?.({
    phase: 'PRECHECK',
    totalDocuments: plan.documents.length,
    alreadyPresent: 0,
    pendingDocuments: plan.documents.length,
    writtenDocuments: 0,
    committedBatches: 0,
    totalBatches: Math.ceil(plan.documents.length / WRITE_BATCH_SAFE_SIZE),
  })

  // Re-run the Firestore read-only preflight immediately before any batch.
  const preflight = await runMigrationPreflight2026(plan)
  if (preflight.status !== 'LISTO') {
    throw new Error(`Preflight final BLOQUEADO: ${preflight.blockers.join(' ')}`)
  }
  if (!preflight.baselineMatches) {
    throw new Error('El fingerprint dejó de coincidir con el baseline aprobado.')
  }
  const hardCollisions = preflight.collisions.filter((item) => !item.compatibleResume)
  if (hardCollisions.length > 0 || preflight.identityConflicts.length > 0) {
    throw new Error('El preflight final detectó colisiones o conflictos de identidad.')
  }

  const compatibleKeys = new Set(
    preflight.collisions
      .filter((item) => item.compatibleResume)
      .map((item) => `${item.collection}/${item.id}`),
  )

  // If there are migration-origin documents outside this exact resumable plan,
  // stop rather than mix two migrations silently.
  if (preflight.existingMigrationDocuments > compatibleKeys.size) {
    throw new Error(
      'Firestore contiene documentos de migración que no pertenecen a este fingerprint; se requiere revisión manual.',
    )
  }

  const completion = await completionAuditExists(database, plan.fingerprint)
  if (completion.exists) {
    if (compatibleKeys.size !== plan.documents.length) {
      throw new Error('Existe marca de migración completada, pero no están presentes todos los documentos del plan.')
    }
    return {
      status: 'ALREADY_COMPLETED',
      fingerprint: plan.fingerprint,
      totalDocuments: plan.documents.length,
      alreadyPresent: compatibleKeys.size,
      writtenDocuments: 0,
      committedBatches: 0,
      completionAuditId: completion.id,
    }
  }

  const pending = plan.documents.filter((item) => !compatibleKeys.has(migrationDocumentKey(item)))
  const batches = chunk(pending, WRITE_BATCH_SAFE_SIZE)
  let writtenDocuments = 0
  let committedBatches = 0

  options.onProgress?.({
    phase: 'WRITING',
    totalDocuments: plan.documents.length,
    alreadyPresent: compatibleKeys.size,
    pendingDocuments: pending.length,
    writtenDocuments,
    committedBatches,
    totalBatches: batches.length,
  })

  for (const items of batches) {
    if (items.length === 0) continue
    const batch = writeBatch(database)

    for (const item of items) {
      const ref = doc(database, item.collection as MigrationDryRunCollection, item.id)
      batch.set(ref, withExecutionMetadata(item, plan, actorUid))
    }

    const first = items[0]
    const last = items[items.length - 1]
    const auditId = batchAuditId(plan.fingerprint, first, last)
    batch.set(doc(database, 'audit_log', auditId), {
      action: 'MIGRATION_2026_BATCH_COMMITTED',
      actorUid,
      migrationFingerprint: plan.fingerprint,
      planVersion: plan.planVersion,
      documentCount: items.length,
      firstDocument: migrationDocumentKey(first),
      lastDocument: migrationDocumentKey(last),
      createdAt: serverTimestamp(),
      sourceSpreadsheetId: plan.sourceSpreadsheetId,
      sourceSheet: plan.sourceSheet,
    })

    await batch.commit()
    writtenDocuments += items.length
    committedBatches += 1

    options.onProgress?.({
      phase: 'WRITING',
      totalDocuments: plan.documents.length,
      alreadyPresent: compatibleKeys.size,
      pendingDocuments: Math.max(0, pending.length - writtenDocuments),
      writtenDocuments,
      committedBatches,
      totalBatches: batches.length,
    })
  }

  options.onProgress?.({
    phase: 'VERIFYING',
    totalDocuments: plan.documents.length,
    alreadyPresent: compatibleKeys.size,
    pendingDocuments: 0,
    writtenDocuments,
    committedBatches,
    totalBatches: batches.length,
  })

  // Verify all deterministic target IDs before writing the completion marker.
  for (const item of plan.documents) {
    const snapshot = await getDoc(doc(database, item.collection, item.id))
    if (!snapshot.exists()) throw new Error(`Verificación final: falta ${migrationDocumentKey(item)}.`)
    const fingerprint = String(snapshot.data().migrationFingerprint ?? '')
    if (fingerprint !== plan.fingerprint) {
      throw new Error(`Verificación final: ${migrationDocumentKey(item)} tiene otro fingerprint.`)
    }
  }

  const finalAudit = writeBatch(database)
  finalAudit.set(doc(database, 'audit_log', completion.id), {
    action: 'MIGRATION_2026_COMPLETED',
    actorUid,
    migrationFingerprint: plan.fingerprint,
    planVersion: plan.planVersion,
    totalDocuments: plan.documents.length,
    writtenDocumentsThisExecution: writtenDocuments,
    resumedDocuments: compatibleKeys.size,
    deuda2026: plan.totals.deuda2026,
    deuda2025: plan.totals.deuda2025,
    deudaTotal: plan.totals.deudaTotal,
    sourceSpreadsheetId: plan.sourceSpreadsheetId,
    sourceSheet: plan.sourceSheet,
    approvedBaselineAcceptedAt: MIGRATION_APPROVED_BASELINE_2026.acceptedAt,
    createdAt: serverTimestamp(),
  })
  await finalAudit.commit()

  options.onProgress?.({
    phase: 'COMPLETED',
    totalDocuments: plan.documents.length,
    alreadyPresent: compatibleKeys.size,
    pendingDocuments: 0,
    writtenDocuments,
    committedBatches,
    totalBatches: batches.length,
  })

  return {
    status: 'COMPLETED',
    fingerprint: plan.fingerprint,
    totalDocuments: plan.documents.length,
    alreadyPresent: compatibleKeys.size,
    writtenDocuments,
    committedBatches,
    completionAuditId: completion.id,
  }
}
