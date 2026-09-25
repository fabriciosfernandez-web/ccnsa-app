import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { resolveAuditActor, type AuditActorInput } from './auditActor'
import {
  listAplicacionesPago,
  listObligaciones,
  listPagos,
  listSocios,
  type AplicacionPago,
  type Obligacion,
  type Pago,
} from './socios'

export interface ConciliacionResult {
  cantidadAplicaciones: number
  importeConciliado: number
}

export interface ConciliacionMasivaItem {
  socioId: string
  socioNombre: string
  cantidadAplicaciones: number
  importeConciliable: number
}

export interface ConciliacionMasivaPreview {
  socios: ConciliacionMasivaItem[]
  totalSocios: number
  totalAplicaciones: number
  importeConciliable: number
}

export interface ConciliacionMasivaResult {
  sociosProcesados: number
  cantidadAplicaciones: number
  importeConciliado: number
  errores: string[]
}

const MAX_APPLICATIONS_PER_RUN = 400

function requireDb() {
  if (!db) throw new Error('Firebase no está configurado.')
  return db
}

function sumBy<T>(items: T[], key: (item: T) => string, value: (item: T) => number) {
  const totals = new Map<string, number>()
  for (const item of items) {
    totals.set(key(item), (totals.get(key(item)) ?? 0) + value(item))
  }
  return totals
}

function buildConciliacionPlan(
  obligaciones: Obligacion[],
  pagos: Pago[],
  aplicaciones: AplicacionPago[],
) {
  const pagosVigentes = new Set(
    pagos.filter((item) => item.estado !== 'ANULADO').map((item) => item.id),
  )
  const obligacionesVigentes = new Set(
    obligaciones
      .filter((item) => item.estado !== 'ANULADA' && item.estado !== 'EXENTA')
      .map((item) => item.id),
  )
  const aplicacionesVigentes = aplicaciones.filter(
    (item) => pagosVigentes.has(item.pagoId) && obligacionesVigentes.has(item.obligacionId),
  )

  const aplicadoPorObligacion = sumBy(aplicacionesVigentes, (item) => item.obligacionId, (item) => item.importe)
  const aplicadoPorPago = sumBy(aplicacionesVigentes, (item) => item.pagoId, (item) => item.importe)

  const obligacionesPendientes = obligaciones
    .filter((item) => obligacionesVigentes.has(item.id))
    .map((item) => ({
      ...item,
      pendiente: Math.max(0, item.importe - (aplicadoPorObligacion.get(item.id) ?? 0)),
    }))
    .filter((item) => item.pendiente > 0)
    .sort((a, b) => a.periodo.localeCompare(b.periodo) || a.id.localeCompare(b.id))

  const pagosDisponibles = pagos
    .filter((item) => pagosVigentes.has(item.id))
    .map((item) => ({
      ...item,
      disponible: Math.max(0, item.importe - (aplicadoPorPago.get(item.id) ?? 0)),
    }))
    .filter((item) => item.disponible > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))

  const nuevasAplicaciones: Array<{ pagoId: string; obligacionId: string; importe: number }> = []
  let pagoIndex = 0
  let obligacionIndex = 0

  while (pagoIndex < pagosDisponibles.length && obligacionIndex < obligacionesPendientes.length) {
    const pago = pagosDisponibles[pagoIndex]
    const obligacion = obligacionesPendientes[obligacionIndex]
    const importe = Math.min(pago.disponible, obligacion.pendiente)

    if (importe <= 0) break

    nuevasAplicaciones.push({
      pagoId: pago.id,
      obligacionId: obligacion.id,
      importe,
    })

    pago.disponible -= importe
    obligacion.pendiente -= importe

    if (pago.disponible <= 0) pagoIndex += 1
    if (obligacion.pendiente <= 0) obligacionIndex += 1
  }

  return {
    nuevasAplicaciones,
    importeConciliable: nuevasAplicaciones.reduce((sum, item) => sum + item.importe, 0),
  }
}

export async function conciliarRegistrosPrevios(
  socioId: string,
  actor: AuditActorInput,
): Promise<ConciliacionResult> {
  const database = requireDb()
  const actorSnapshot = await resolveAuditActor(actor)
  const actorUid = actorSnapshot.actorUid
  const [obligaciones, pagos, aplicaciones] = await Promise.all([
    listObligaciones(socioId),
    listPagos(socioId),
    listAplicacionesPago(socioId),
  ])

  const { nuevasAplicaciones } = buildConciliacionPlan(obligaciones, pagos, aplicaciones)

  if (nuevasAplicaciones.length === 0) {
    return { cantidadAplicaciones: 0, importeConciliado: 0 }
  }

  if (nuevasAplicaciones.length > MAX_APPLICATIONS_PER_RUN) {
    throw new Error('La conciliación supera el límite seguro de operaciones para una sola ejecución.')
  }

  const batch = writeBatch(database)
  let importeConciliado = 0

  for (const aplicacion of nuevasAplicaciones) {
    const aplicacionRef = doc(collection(database, 'aplicaciones_pago'))
    batch.set(aplicacionRef, {
      socioId,
      pagoId: aplicacion.pagoId,
      obligacionId: aplicacion.obligacionId,
      importe: aplicacion.importe,
      actorUid,
      origen: 'CONCILIACION_HISTORICA',
      createdAt: serverTimestamp(),
    })
    importeConciliado += aplicacion.importe
  }

  const auditRef = doc(collection(database, 'audit_log'))
  batch.set(auditRef, {
    ...actorSnapshot,
    action: 'CUENTA_RECONCILIADA',
    entity: 'socios',
    entityId: socioId,
    socioId,
    cantidadAplicaciones: nuevasAplicaciones.length,
    importeConciliado,
    createdAt: serverTimestamp(),
  })

  await batch.commit()

  return {
    cantidadAplicaciones: nuevasAplicaciones.length,
    importeConciliado,
  }
}


export async function analizarConciliacionMasiva(): Promise<ConciliacionMasivaPreview> {
  const socios = await listSocios()
  const items: ConciliacionMasivaItem[] = []

  for (const socio of socios) {
    const [obligaciones, pagos, aplicaciones] = await Promise.all([
      listObligaciones(socio.id),
      listPagos(socio.id),
      listAplicacionesPago(socio.id),
    ])
    const plan = buildConciliacionPlan(obligaciones, pagos, aplicaciones)
    if (plan.nuevasAplicaciones.length === 0) continue

    items.push({
      socioId: socio.id,
      socioNombre: socio.nombre,
      cantidadAplicaciones: plan.nuevasAplicaciones.length,
      importeConciliable: plan.importeConciliable,
    })
  }

  return {
    socios: items,
    totalSocios: items.length,
    totalAplicaciones: items.reduce((sum, item) => sum + item.cantidadAplicaciones, 0),
    importeConciliable: items.reduce((sum, item) => sum + item.importeConciliable, 0),
  }
}

export async function conciliarRegistrosPreviosMasivo(actor: AuditActorInput): Promise<ConciliacionMasivaResult> {
  const actorSnapshot = await resolveAuditActor(actor)
  const socios = await listSocios()
  let sociosProcesados = 0
  let cantidadAplicaciones = 0
  let importeConciliado = 0
  const errores: string[] = []

  for (const socio of socios) {
    try {
      const result = await conciliarRegistrosPrevios(socio.id, actorSnapshot)
      if (result.cantidadAplicaciones === 0) continue
      sociosProcesados += 1
      cantidadAplicaciones += result.cantidadAplicaciones
      importeConciliado += result.importeConciliado
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Error desconocido'
      errores.push(`${socio.nombre}: ${detail}`)
    }
  }

  return {
    sociosProcesados,
    cantidadAplicaciones,
    importeConciliado,
    errores,
  }
}
