import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  listAplicacionesPago,
  listObligaciones,
  listPagos,
} from './socios'

export interface ConciliacionResult {
  cantidadAplicaciones: number
  importeConciliado: number
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

export async function conciliarRegistrosPrevios(
  socioId: string,
  actorUid: string,
): Promise<ConciliacionResult> {
  const database = requireDb()
  const [obligaciones, pagos, aplicaciones] = await Promise.all([
    listObligaciones(socioId),
    listPagos(socioId),
    listAplicacionesPago(socioId),
  ])

  const aplicadoPorObligacion = sumBy(aplicaciones, (item) => item.obligacionId, (item) => item.importe)
  const aplicadoPorPago = sumBy(aplicaciones, (item) => item.pagoId, (item) => item.importe)

  const obligacionesPendientes = obligaciones
    .filter((item) => item.estado !== 'ANULADA' && item.estado !== 'EXENTA')
    .map((item) => ({
      ...item,
      pendiente: Math.max(0, item.importe - (aplicadoPorObligacion.get(item.id) ?? 0)),
    }))
    .filter((item) => item.pendiente > 0)
    .sort((a, b) => a.periodo.localeCompare(b.periodo) || a.id.localeCompare(b.id))

  const pagosDisponibles = pagos
    .filter((item) => item.estado !== 'ANULADO')
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
    actorUid,
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
