import { collection, getDocs, type DocumentData } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { MigrationDryRunCollection } from './migrationDryRun2026'

export interface MigrationCleanupPreviewItem2026 {
  collection: MigrationDryRunCollection
  id: string
  socioId: string | null
  socioNombre: string | null
  summary: string
  origin: string | null
  relationStatus: 'OK' | 'HUERFANO' | 'SIN_SOCIO' | 'SOCIO'
  relationNote: string
}

export interface MigrationCleanupPreview2026 {
  status: 'LISTO_PARA_REVISION' | 'ADVERTENCIA'
  totalDocuments: number
  collectionCounts: Record<MigrationDryRunCollection, number>
  linkedToExistingSocios: number
  orphanReferences: number
  migrationDocuments: number
  items: MigrationCleanupPreviewItem2026[]
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

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatGs(value: unknown) {
  const amount = asNumber(value)
  return amount === null ? null : `Gs. ${Math.round(amount).toLocaleString('es-PY')}`
}

function migrationFingerprint(data: DocumentData) {
  const direct = asString(data.migrationFingerprint)
  if (direct) return direct
  const migration = data.migration
  if (migration && typeof migration === 'object') {
    return asString((migration as Record<string, unknown>).fingerprint)
  }
  return ''
}

function isMigrationDocument(data: DocumentData) {
  const origen = asString(data.origen)
  const migration = data.migration
  const source = migration && typeof migration === 'object'
    ? asString((migration as Record<string, unknown>).source)
    : ''
  return Boolean(migrationFingerprint(data)) || origen.startsWith('MIGRACION_') || source === 'LISTA_MIEMBROS_2026'
}

function summarize(collectionName: MigrationDryRunCollection, data: DocumentData) {
  if (collectionName === 'socios') {
    const nombre = asString(data.nombre) || 'Socio sin nombre'
    const numero = asString(data.numeroSocio)
    const categoria = asString(data.categoria)
    const estado = asString(data.estado)
    return [nombre, numero ? `N.º ${numero}` : '', categoria, estado].filter(Boolean).join(' · ')
  }
  if (collectionName === 'obligaciones') {
    const concepto = asString(data.concepto) || 'Obligación'
    const periodo = asString(data.periodo)
    const importe = formatGs(data.importe)
    const estado = asString(data.estado)
    return [concepto, periodo, importe, estado].filter(Boolean).join(' · ')
  }
  if (collectionName === 'pagos') {
    const importe = formatGs(data.importe)
    const periodo = asString(data.periodoCobro) || asString(data.fecha)
    const estado = asString(data.estado)
    return ['Pago', importe, periodo, estado].filter(Boolean).join(' · ')
  }
  if (collectionName === 'aplicaciones_pago') {
    const importe = formatGs(data.importe)
    const pagoId = asString(data.pagoId)
    const obligacionId = asString(data.obligacionId)
    return ['Aplicación', importe, pagoId ? `pago ${pagoId}` : '', obligacionId ? `obligación ${obligacionId}` : ''].filter(Boolean).join(' · ')
  }
  if (collectionName === 'excepciones_cobro') {
    const tipo = asString(data.tipo) || asString(data.tipoExcepcion) || 'Excepción'
    const alcance = asString(data.alcance)
    const importe = formatGs(data.importe)
    return [tipo, alcance, importe].filter(Boolean).join(' · ')
  }
  const anterior = asString(data.categoriaAnterior)
  const nueva = asString(data.categoriaNueva)
  const desde = asString(data.vigenteDesde)
  return ['Cambio de categoría', anterior && nueva ? `${anterior}→${nueva}` : '', desde].filter(Boolean).join(' · ')
}

export async function buildMigrationCleanupPreview2026(): Promise<MigrationCleanupPreview2026> {
  const database = requireDb()
  const snapshots = await Promise.all(
    COLLECTIONS.map(async (name) => ({ name, snapshot: await getDocs(collection(database, name)) })),
  )

  const byCollection = new Map<MigrationDryRunCollection, Map<string, DocumentData>>()
  const counts = Object.fromEntries(COLLECTIONS.map((name) => [name, 0])) as Record<MigrationDryRunCollection, number>

  for (const { name, snapshot } of snapshots) {
    const docs = new Map<string, DocumentData>()
    counts[name] = snapshot.size
    for (const item of snapshot.docs) docs.set(item.id, item.data())
    byCollection.set(name, docs)
  }

  const socios = byCollection.get('socios') ?? new Map<string, DocumentData>()
  const pagos = byCollection.get('pagos') ?? new Map<string, DocumentData>()
  const obligaciones = byCollection.get('obligaciones') ?? new Map<string, DocumentData>()
  const socioNames = new Map<string, string>()
  for (const [id, data] of socios) socioNames.set(id, asString(data.nombre) || id)

  const items: MigrationCleanupPreviewItem2026[] = []
  let orphanReferences = 0
  let linkedToExistingSocios = 0
  let migrationDocuments = 0

  for (const collectionName of COLLECTIONS) {
    const docs = byCollection.get(collectionName) ?? new Map<string, DocumentData>()
    for (const [id, data] of docs) {
      if (isMigrationDocument(data)) migrationDocuments += 1
      const socioId = collectionName === 'socios' ? id : (asString(data.socioId) || null)
      const socioNombre = socioId ? (socioNames.get(socioId) ?? null) : null
      let relationStatus: MigrationCleanupPreviewItem2026['relationStatus'] = collectionName === 'socios' ? 'SOCIO' : 'OK'
      let relationNote = collectionName === 'socios' ? 'Documento raíz de socio existente.' : ''

      if (collectionName !== 'socios') {
        if (!socioId) {
          relationStatus = 'SIN_SOCIO'
          relationNote = 'No declara socioId.'
          orphanReferences += 1
        } else if (!socios.has(socioId)) {
          relationStatus = 'HUERFANO'
          relationNote = `Referencia socioId ${socioId} no existe en socios.`
          orphanReferences += 1
        } else {
          linkedToExistingSocios += 1
          relationNote = `Relacionado con ${socioNombre ?? socioId}.`
        }
      }

      if (collectionName === 'aplicaciones_pago') {
        const pagoId = asString(data.pagoId)
        const obligacionId = asString(data.obligacionId)
        const missing: string[] = []
        if (!pagoId || !pagos.has(pagoId)) missing.push(`pago ${pagoId || '(vacío)'}`)
        if (!obligacionId || !obligaciones.has(obligacionId)) missing.push(`obligación ${obligacionId || '(vacía)'}`)
        if (missing.length > 0) {
          if (relationStatus === 'OK') orphanReferences += 1
          relationStatus = 'HUERFANO'
          relationNote = `Referencia faltante: ${missing.join(', ')}.`
        }
      }

      items.push({
        collection: collectionName,
        id,
        socioId,
        socioNombre,
        summary: summarize(collectionName, data),
        origin: asString(data.origen) || null,
        relationStatus,
        relationNote,
      })
    }
  }

  items.sort((a, b) => {
    const collectionDiff = COLLECTIONS.indexOf(a.collection) - COLLECTIONS.indexOf(b.collection)
    if (collectionDiff !== 0) return collectionDiff
    return (a.socioNombre ?? a.id).localeCompare(b.socioNombre ?? b.id, 'es')
  })

  const warnings: string[] = []
  if (migrationDocuments > 0) warnings.push(`${migrationDocuments} documento(s) ya parecen pertenecer a una migración y no deben incluirse en una limpieza de pruebas.`)
  if (orphanReferences > 0) warnings.push(`${orphanReferences} documento(s) tienen referencias incompletas o huérfanas.`)
  if (items.length === 0) warnings.push('No hay documentos existentes en las seis colecciones objetivo.')

  return {
    status: migrationDocuments === 0 ? 'LISTO_PARA_REVISION' : 'ADVERTENCIA',
    totalDocuments: items.length,
    collectionCounts: counts,
    linkedToExistingSocios,
    orphanReferences,
    migrationDocuments,
    items,
    warnings,
  }
}
