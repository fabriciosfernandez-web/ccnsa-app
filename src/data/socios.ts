import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export type SocioCategoria = 'SOLTERO' | 'CASADO'
export type SocioEstado = 'ACTIVO' | 'INACTIVO'
export type ObligacionEstado = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'ANULADA' | 'EXENTA'
export type PagoEstado = 'REGISTRADO' | 'ANULADO'

export interface Socio {
  id: string
  nombre: string
  email?: string
  categoria: SocioCategoria
  estado: SocioEstado
  fechaIngreso?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface Obligacion {
  id: string
  socioId: string
  concepto: string
  periodo: string
  importe: number
  estado: ObligacionEstado
  fechaVencimiento?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface Pago {
  id: string
  socioId: string
  importe: number
  fecha: string
  medioPago?: string
  referencia?: string
  estado: PagoEstado
  createdAt?: Timestamp
}

export interface AplicacionPago {
  id: string
  socioId: string
  pagoId: string
  obligacionId: string
  importe: number
  actorUid?: string
  createdAt?: Timestamp
}

export interface ObligacionCalculada extends Obligacion {
  importeAplicado: number
  saldoPendiente: number
  estadoCalculado: ObligacionEstado
}

export interface PagoCalculado extends Pago {
  importeAplicado: number
  saldoDisponible: number
}

export interface EstadoCuenta {
  obligaciones: ObligacionCalculada[]
  pagos: PagoCalculado[]
  aplicaciones: AplicacionPago[]
  totalCargos: number
  totalPagos: number
  saldoPendiente: number
  saldoFavor: number
  saldoNeto: number
}

export interface RegistroConAplicacionResult {
  id: string
  importeAplicado: number
  saldoDisponible: number
  cantidadAplicaciones: number
}

interface InAppNotificationPreferences {
  inApp: boolean
  paymentConfirmations: boolean
}

function requireDb() {
  if (!db) throw new Error('Firebase no está configurado.')
  return db
}

async function loadInAppNotificationPreferences(socioId: string): Promise<InAppNotificationPreferences> {
  const database = requireDb()
  const snapshot = await getDoc(doc(database, 'notification_preferences', socioId))
  if (!snapshot.exists()) return { inApp: true, paymentConfirmations: true }
  const data = snapshot.data()
  return {
    inApp: data.inApp !== false,
    paymentConfirmations: data.paymentConfirmations !== false,
  }
}

function notificationMoney(value: number) {
  return `Gs. ${Math.round(value).toLocaleString('es-PY')}`
}

function mapSocio(snapshot: QueryDocumentSnapshot<DocumentData>): Socio {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    nombre: String(data.nombre ?? ''),
    email: data.email ? String(data.email) : undefined,
    categoria: data.categoria === 'CASADO' ? 'CASADO' : 'SOLTERO',
    estado: data.estado === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO',
    fechaIngreso: data.fechaIngreso ? String(data.fechaIngreso) : undefined,
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  }
}

function mapObligacion(snapshot: QueryDocumentSnapshot<DocumentData>): Obligacion {
  const data = snapshot.data()
  const rawEstado = String(data.estado ?? 'PENDIENTE')
  const estado: ObligacionEstado = rawEstado === 'PAGADO'
    ? 'PAGADA'
    : rawEstado === 'PARCIAL' || rawEstado === 'PAGADA' || rawEstado === 'ANULADA' || rawEstado === 'EXENTA'
      ? rawEstado
      : 'PENDIENTE'

  return {
    id: snapshot.id,
    socioId: String(data.socioId ?? ''),
    concepto: String(data.concepto ?? ''),
    periodo: String(data.periodo ?? ''),
    importe: Number(data.importe ?? 0),
    estado,
    fechaVencimiento: data.fechaVencimiento ? String(data.fechaVencimiento) : undefined,
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  }
}

function mapPago(snapshot: QueryDocumentSnapshot<DocumentData>): Pago {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    socioId: String(data.socioId ?? ''),
    importe: Number(data.importe ?? 0),
    fecha: String(data.fecha ?? data.fechaPago ?? ''),
    medioPago: data.medioPago ? String(data.medioPago) : undefined,
    referencia: data.referencia ? String(data.referencia) : undefined,
    estado: data.estado === 'ANULADO' ? 'ANULADO' : 'REGISTRADO',
    createdAt: data.createdAt as Timestamp | undefined,
  }
}

function mapAplicacion(snapshot: QueryDocumentSnapshot<DocumentData>): AplicacionPago {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    socioId: String(data.socioId ?? ''),
    pagoId: String(data.pagoId ?? ''),
    obligacionId: String(data.obligacionId ?? ''),
    importe: Number(data.importe ?? 0),
    actorUid: data.actorUid ? String(data.actorUid) : undefined,
    createdAt: data.createdAt as Timestamp | undefined,
  }
}

function sumBy<T>(items: T[], key: (item: T) => string, value: (item: T) => number) {
  const totals = new Map<string, number>()
  for (const item of items) totals.set(key(item), (totals.get(key(item)) ?? 0) + value(item))
  return totals
}

export function buildEstadoCuenta(
  obligaciones: Obligacion[],
  pagos: Pago[],
  aplicaciones: AplicacionPago[],
): EstadoCuenta {
  const aplicadoPorObligacion = sumBy(aplicaciones, (item) => item.obligacionId, (item) => item.importe)
  const aplicadoPorPago = sumBy(aplicaciones, (item) => item.pagoId, (item) => item.importe)

  const obligacionesCalculadas = obligaciones.map((item) => {
    const importeAplicado = Math.min(item.importe, Math.max(0, aplicadoPorObligacion.get(item.id) ?? 0))
    const baseCero = item.estado === 'ANULADA' || item.estado === 'EXENTA'
    const saldoPendiente = baseCero ? 0 : Math.max(0, item.importe - importeAplicado)
    const estadoCalculado: ObligacionEstado = item.estado === 'ANULADA' || item.estado === 'EXENTA'
      ? item.estado
      : saldoPendiente === 0
        ? 'PAGADA'
        : importeAplicado > 0
          ? 'PARCIAL'
          : 'PENDIENTE'

    return { ...item, importeAplicado, saldoPendiente, estadoCalculado }
  })

  const pagosCalculados = pagos.map((item) => {
    const importeAplicado = item.estado === 'ANULADO'
      ? 0
      : Math.min(item.importe, Math.max(0, aplicadoPorPago.get(item.id) ?? 0))
    return {
      ...item,
      importeAplicado,
      saldoDisponible: item.estado === 'ANULADO' ? 0 : Math.max(0, item.importe - importeAplicado),
    }
  })

  const totalCargos = obligacionesCalculadas
    .filter((item) => item.estadoCalculado !== 'ANULADA' && item.estadoCalculado !== 'EXENTA')
    .reduce((sum, item) => sum + item.importe, 0)
  const totalPagos = pagosCalculados
    .filter((item) => item.estado !== 'ANULADO')
    .reduce((sum, item) => sum + item.importe, 0)
  const saldoPendiente = obligacionesCalculadas.reduce((sum, item) => sum + item.saldoPendiente, 0)
  const saldoFavor = pagosCalculados.reduce((sum, item) => sum + item.saldoDisponible, 0)

  return {
    obligaciones: obligacionesCalculadas,
    pagos: pagosCalculados,
    aplicaciones,
    totalCargos,
    totalPagos,
    saldoPendiente,
    saldoFavor,
    saldoNeto: saldoPendiente - saldoFavor,
  }
}

export async function listSocios(): Promise<Socio[]> {
  const database = requireDb()
  const snapshot = await getDocs(collection(database, 'socios'))
  return snapshot.docs.map(mapSocio).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export async function createSocio(
  input: Omit<Socio, 'id' | 'createdAt' | 'updatedAt'>,
  actorUid: string,
): Promise<string> {
  const database = requireDb()
  const socioRef = doc(collection(database, 'socios'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)

  batch.set(socioRef, {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(auditRef, {
    actorUid,
    action: 'SOCIO_CREATED',
    entity: 'socios',
    entityId: socioRef.id,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
  return socioRef.id
}

export async function listObligaciones(socioId: string): Promise<Obligacion[]> {
  const database = requireDb()
  const snapshot = await getDocs(query(collection(database, 'obligaciones'), where('socioId', '==', socioId)))
  return snapshot.docs.map(mapObligacion).sort((a, b) => b.periodo.localeCompare(a.periodo))
}

export async function listPagos(socioId: string): Promise<Pago[]> {
  const database = requireDb()
  const snapshot = await getDocs(query(collection(database, 'pagos'), where('socioId', '==', socioId)))
  return snapshot.docs.map(mapPago).sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export async function listAplicacionesPago(socioId: string): Promise<AplicacionPago[]> {
  const database = requireDb()
  const snapshot = await getDocs(query(collection(database, 'aplicaciones_pago'), where('socioId', '==', socioId)))
  return snapshot.docs.map(mapAplicacion)
}

export async function loadEstadoCuenta(socioId: string): Promise<EstadoCuenta> {
  const [obligaciones, pagos, aplicaciones] = await Promise.all([
    listObligaciones(socioId),
    listPagos(socioId),
    listAplicacionesPago(socioId),
  ])
  return buildEstadoCuenta(obligaciones, pagos, aplicaciones)
}

export async function createObligacion(
  input: Omit<Obligacion, 'id' | 'createdAt' | 'updatedAt' | 'estado'> & { estado?: ObligacionEstado },
  actorUid: string,
): Promise<RegistroConAplicacionResult> {
  const database = requireDb()
  const [pagos, aplicaciones, notificationPreferences] = await Promise.all([
    listPagos(input.socioId),
    listAplicacionesPago(input.socioId),
    loadInAppNotificationPreferences(input.socioId),
  ])
  const aplicadoPorPago = sumBy(aplicaciones, (item) => item.pagoId, (item) => item.importe)
  const pagosConCredito = pagos
    .filter((item) => item.estado !== 'ANULADO')
    .map((item) => ({ ...item, disponible: Math.max(0, item.importe - (aplicadoPorPago.get(item.id) ?? 0)) }))
    .filter((item) => item.disponible > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))

  const obligacionRef = doc(collection(database, 'obligaciones'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)
  const estadoInicial = input.estado ?? 'PENDIENTE'
  const sinImputacion = estadoInicial === 'EXENTA' || estadoInicial === 'ANULADA'
  let restante = sinImputacion ? 0 : input.importe
  let aplicado = 0
  let cantidadAplicaciones = 0

  batch.set(obligacionRef, {
    ...input,
    estado: estadoInicial,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  if (!sinImputacion) {
    for (const pago of pagosConCredito) {
      if (restante <= 0) break
      const importe = Math.min(restante, pago.disponible)
      const aplicacionRef = doc(collection(database, 'aplicaciones_pago'))
      batch.set(aplicacionRef, {
        socioId: input.socioId,
        pagoId: pago.id,
        obligacionId: obligacionRef.id,
        importe,
        actorUid,
        createdAt: serverTimestamp(),
      })
      restante -= importe
      aplicado += importe
      cantidadAplicaciones += 1
    }
  }

  batch.set(auditRef, {
    actorUid,
    action: 'OBLIGACION_CREATED',
    entity: 'obligaciones',
    entityId: obligacionRef.id,
    socioId: input.socioId,
    importe: input.importe,
    estado: estadoInicial,
    creditoAplicado: aplicado,
    createdAt: serverTimestamp(),
  })

  if (notificationPreferences.inApp && !sinImputacion) {
    const notificationRef = doc(database, 'notifications', `obligation_${obligacionRef.id}`)
    const coveredText = restante <= 0
      ? ' La obligación quedó cubierta con saldo a favor existente.'
      : aplicado > 0
        ? ` Se aplicaron ${notificationMoney(aplicado)} de tu saldo a favor.`
        : ''
    batch.set(notificationRef, {
      socioId: input.socioId,
      kind: 'OBLIGATION_POSTED',
      title: 'Nueva obligación registrada',
      message: `El Comité de Finanzas registró ${input.concepto || 'una obligación'} por ${notificationMoney(input.importe)}${input.periodo ? ` para ${input.periodo}` : ''}.${coveredText}`,
      status: 'UNREAD',
      createdAt: serverTimestamp(),
      accountPeriod: input.periodo || null,
      amount: input.importe,
      currency: 'PYG',
      actionUrl: '/socio',
      sourceType: 'obligaciones',
      sourceId: obligacionRef.id,
      deduplicationKey: `obligation:${obligacionRef.id}`,
      createdByUid: actorUid,
    })
  }

  await batch.commit()
  return { id: obligacionRef.id, importeAplicado: aplicado, saldoDisponible: restante, cantidadAplicaciones }
}

export async function createPago(
  input: Omit<Pago, 'id' | 'createdAt' | 'estado'> & { estado?: PagoEstado },
  actorUid: string,
): Promise<RegistroConAplicacionResult> {
  const database = requireDb()
  const [obligaciones, aplicaciones, notificationPreferences] = await Promise.all([
    listObligaciones(input.socioId),
    listAplicacionesPago(input.socioId),
    loadInAppNotificationPreferences(input.socioId),
  ])
  const aplicadoPorObligacion = sumBy(aplicaciones, (item) => item.obligacionId, (item) => item.importe)
  const pendientes = obligaciones
    .filter((item) => item.estado !== 'ANULADA' && item.estado !== 'EXENTA')
    .map((item) => ({
      ...item,
      pendiente: Math.max(0, item.importe - (aplicadoPorObligacion.get(item.id) ?? 0)),
    }))
    .filter((item) => item.pendiente > 0)
    .sort((a, b) => a.periodo.localeCompare(b.periodo) || a.id.localeCompare(b.id))

  const pagoRef = doc(collection(database, 'pagos'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)
  const estadoInicial = input.estado ?? 'REGISTRADO'
  let restante = input.importe
  let aplicado = 0
  let cantidadAplicaciones = 0

  batch.set(pagoRef, {
    ...input,
    estado: estadoInicial,
    createdAt: serverTimestamp(),
  })

  if (estadoInicial !== 'ANULADO') {
    for (const obligacion of pendientes) {
      if (restante <= 0) break
      const importe = Math.min(restante, obligacion.pendiente)
      const aplicacionRef = doc(collection(database, 'aplicaciones_pago'))
      batch.set(aplicacionRef, {
        socioId: input.socioId,
        pagoId: pagoRef.id,
        obligacionId: obligacion.id,
        importe,
        actorUid,
        createdAt: serverTimestamp(),
      })
      restante -= importe
      aplicado += importe
      cantidadAplicaciones += 1
    }
  }

  batch.set(auditRef, {
    actorUid,
    action: 'PAGO_CREATED',
    entity: 'pagos',
    entityId: pagoRef.id,
    socioId: input.socioId,
    importe: input.importe,
    importeAplicado: aplicado,
    saldoDisponible: restante,
    createdAt: serverTimestamp(),
  })

  if (estadoInicial === 'REGISTRADO' && notificationPreferences.inApp && notificationPreferences.paymentConfirmations) {
    const notificationRef = doc(database, 'notifications', `payment_${pagoRef.id}`)
    const saldoText = restante > 0 ? ` Quedaron ${notificationMoney(restante)} como saldo a favor.` : ''
    batch.set(notificationRef, {
      socioId: input.socioId,
      kind: 'PAYMENT_POSTED',
      title: 'Pago registrado',
      message: `El Comité de Finanzas registró un pago de ${notificationMoney(input.importe)}. Se aplicaron ${notificationMoney(aplicado)} a tus obligaciones.${saldoText}`,
      status: 'UNREAD',
      createdAt: serverTimestamp(),
      amount: input.importe,
      currency: 'PYG',
      actionUrl: '/socio',
      sourceType: 'pagos',
      sourceId: pagoRef.id,
      deduplicationKey: `payment:${pagoRef.id}`,
      createdByUid: actorUid,
    })
  }

  await batch.commit()
  return { id: pagoRef.id, importeAplicado: aplicado, saldoDisponible: restante, cantidadAplicaciones }
}
