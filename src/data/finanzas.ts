import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export type MovimientoEstado = 'REGISTRADO' | 'ANULADO'

export interface IngresoManual {
  id: string
  fecha: string
  concepto: string
  categoria: string
  importe: number
  medioPago?: string
  referencia?: string
  estado: MovimientoEstado
  origen: 'MANUAL'
  actorUid?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface Egreso {
  id: string
  fecha: string
  concepto: string
  categoria: string
  importe: number
  medioPago?: string
  referencia?: string
  estado: MovimientoEstado
  actorUid?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface CobroSocio {
  id: string
  socioId: string
  socioNombre: string
  fecha: string
  importe: number
  medioPago?: string
  referencia?: string
}

export interface FinanzasTotales {
  cobrosSocios: number
  otrosIngresos: number
  ingresosTotales: number
  egresosTotales: number
  resultado: number
}

export interface FinanzasSnapshot {
  periodo: string
  ingresosManuales: IngresoManual[]
  egresos: Egreso[]
  cobrosSocios: CobroSocio[]
  totales: FinanzasTotales
}

export interface NuevoMovimientoFinanciero {
  fecha: string
  concepto: string
  categoria: string
  importe: number
  medioPago?: string
  referencia?: string
}

function requireDb() {
  if (!db) throw new Error('Firebase no está configurado.')
  return db
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function movimientoEstado(data: DocumentData): MovimientoEstado {
  return data.estado === 'ANULADO' ? 'ANULADO' : 'REGISTRADO'
}

function mapIngreso(snapshot: QueryDocumentSnapshot<DocumentData>): IngresoManual {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    fecha: asString(data.fecha),
    concepto: asString(data.concepto),
    categoria: asString(data.categoria) || 'OTRO',
    importe: asNumber(data.importe),
    medioPago: asString(data.medioPago) || undefined,
    referencia: asString(data.referencia) || undefined,
    estado: movimientoEstado(data),
    origen: 'MANUAL',
    actorUid: asString(data.actorUid) || undefined,
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  }
}

function mapEgreso(snapshot: QueryDocumentSnapshot<DocumentData>): Egreso {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    fecha: asString(data.fecha),
    concepto: asString(data.concepto),
    categoria: asString(data.categoria) || 'OTRO',
    importe: asNumber(data.importe),
    medioPago: asString(data.medioPago) || undefined,
    referencia: asString(data.referencia) || undefined,
    estado: movimientoEstado(data),
    actorUid: asString(data.actorUid) || undefined,
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  }
}

function fechaPago(data: DocumentData) {
  return asString(data.fecha) || asString(data.fechaPago) || asString(data.periodoCobro)
}

function inPeriodo(fecha: string, periodo: string) {
  return Boolean(fecha) && fecha.startsWith(periodo)
}

export async function loadFinanzas(periodo: string): Promise<FinanzasSnapshot> {
  const database = requireDb()
  const [ingresosSnapshot, egresosSnapshot, pagosSnapshot, sociosSnapshot] = await Promise.all([
    getDocs(collection(database, 'ingresos')),
    getDocs(collection(database, 'egresos')),
    getDocs(collection(database, 'pagos')),
    getDocs(collection(database, 'socios')),
  ])

  const socios = new Map<string, string>()
  for (const socio of sociosSnapshot.docs) {
    socios.set(socio.id, asString(socio.data().nombre) || socio.id)
  }

  const ingresosManuales = ingresosSnapshot.docs
    .map(mapIngreso)
    .filter((item) => item.estado !== 'ANULADO' && inPeriodo(item.fecha, periodo))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))

  const egresos = egresosSnapshot.docs
    .map(mapEgreso)
    .filter((item) => item.estado !== 'ANULADO' && inPeriodo(item.fecha, periodo))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))

  const cobrosSocios: CobroSocio[] = pagosSnapshot.docs
    .map((snapshot) => {
      const data = snapshot.data()
      const socioId = asString(data.socioId)
      return {
        id: snapshot.id,
        socioId,
        socioNombre: socios.get(socioId) ?? socioId || 'Socio',
        fecha: fechaPago(data),
        importe: asNumber(data.importe),
        medioPago: asString(data.medioPago) || undefined,
        referencia: asString(data.referencia) || undefined,
        estado: movimientoEstado(data),
      }
    })
    .filter((item) => item.estado !== 'ANULADO' && inPeriodo(item.fecha, periodo) && item.importe > 0)
    .map(({ estado: _estado, ...item }) => item)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))

  const cobrosSociosTotal = cobrosSocios.reduce((sum, item) => sum + item.importe, 0)
  const otrosIngresos = ingresosManuales.reduce((sum, item) => sum + item.importe, 0)
  const egresosTotales = egresos.reduce((sum, item) => sum + item.importe, 0)
  const ingresosTotales = cobrosSociosTotal + otrosIngresos

  return {
    periodo,
    ingresosManuales,
    egresos,
    cobrosSocios,
    totales: {
      cobrosSocios: cobrosSociosTotal,
      otrosIngresos,
      ingresosTotales,
      egresosTotales,
      resultado: ingresosTotales - egresosTotales,
    },
  }
}

function validateMovimiento(input: NuevoMovimientoFinanciero) {
  if (!input.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) throw new Error('Indicá una fecha válida.')
  if (!input.concepto.trim()) throw new Error('Indicá el concepto del movimiento.')
  if (!input.categoria.trim()) throw new Error('Indicá una categoría.')
  if (!Number.isFinite(input.importe) || input.importe <= 0) throw new Error('El importe debe ser mayor a cero.')
}

export async function createIngresoManual(input: NuevoMovimientoFinanciero, actorUid: string) {
  validateMovimiento(input)
  const database = requireDb()
  const ingresoRef = doc(collection(database, 'ingresos'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)

  batch.set(ingresoRef, {
    ...input,
    concepto: input.concepto.trim(),
    categoria: input.categoria.trim(),
    medioPago: input.medioPago?.trim() || null,
    referencia: input.referencia?.trim() || null,
    estado: 'REGISTRADO',
    origen: 'MANUAL',
    actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  batch.set(auditRef, {
    actorUid,
    action: 'INGRESO_CREATED',
    entity: 'ingresos',
    entityId: ingresoRef.id,
    fecha: input.fecha,
    categoria: input.categoria.trim(),
    importe: input.importe,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
  return ingresoRef.id
}

export async function createEgreso(input: NuevoMovimientoFinanciero, actorUid: string) {
  validateMovimiento(input)
  const database = requireDb()
  const egresoRef = doc(collection(database, 'egresos'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)

  batch.set(egresoRef, {
    ...input,
    concepto: input.concepto.trim(),
    categoria: input.categoria.trim(),
    medioPago: input.medioPago?.trim() || null,
    referencia: input.referencia?.trim() || null,
    estado: 'REGISTRADO',
    actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  batch.set(auditRef, {
    actorUid,
    action: 'EGRESO_CREATED',
    entity: 'egresos',
    entityId: egresoRef.id,
    fecha: input.fecha,
    categoria: input.categoria.trim(),
    importe: input.importe,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
  return egresoRef.id
}
