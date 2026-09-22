import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export type MovimientoEstado = 'REGISTRADO' | 'ANULADO'
export type MovimientoFinancieroTipo = 'INGRESO' | 'EGRESO'
export type MovimientoOrigen = 'MANUAL' | 'ACTIVIDAD'

export interface FinanzasActor {
  uid: string
  nombre: string
  email?: string | null
  rol?: string | null
}

interface MovimientoBase {
  id: string
  fecha: string
  concepto: string
  categoria: string
  importe: number
  origen: MovimientoOrigen
  actividadId?: string
  actividadNombre?: string
  subcategoriaActividad?: string
  medioPago?: string
  referencia?: string
  estado: MovimientoEstado
  actorUid?: string
  actorNombre?: string
  actorEmail?: string
  actorRol?: string
  anulacionMotivo?: string
  anuladoPorUid?: string
  anuladoPorNombre?: string
  anuladoPorRol?: string
  anuladoAt?: Timestamp
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface IngresoManual extends MovimientoBase {}
export interface Egreso extends MovimientoBase {}

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

export interface FinanzasAuditEntry {
  id: string
  action: string
  entity: string
  entityId: string
  actorUid: string
  actorNombre?: string
  actorEmail?: string
  actorRol?: string
  fechaMovimiento?: string
  concepto?: string
  categoria?: string
  importe?: number
  motivo?: string
  createdAt?: Timestamp
}

export interface FinanzasSnapshot {
  periodo: string
  ingresosManuales: IngresoManual[]
  egresos: Egreso[]
  cobrosSocios: CobroSocio[]
  audit: FinanzasAuditEntry[]
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

function actorFields(actor: FinanzasActor) {
  return {
    actorUid: actor.uid,
    actorNombre: actor.nombre.trim() || actor.uid,
    actorEmail: actor.email?.trim() || null,
    actorRol: actor.rol?.trim() || null,
  }
}

function movimientoEstado(data: DocumentData): MovimientoEstado {
  return data.estado === 'ANULADO' ? 'ANULADO' : 'REGISTRADO'
}

function movimientoOrigen(data: DocumentData): MovimientoOrigen {
  return data.origen === 'ACTIVIDAD' ? 'ACTIVIDAD' : 'MANUAL'
}

function mapMovimientoBase(snapshot: QueryDocumentSnapshot<DocumentData>): MovimientoBase {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    fecha: asString(data.fecha),
    concepto: asString(data.concepto),
    categoria: asString(data.categoria) || 'OTRO',
    importe: asNumber(data.importe),
    origen: movimientoOrigen(data),
    actividadId: asString(data.actividadId) || undefined,
    actividadNombre: asString(data.actividadNombre) || undefined,
    subcategoriaActividad: asString(data.subcategoriaActividad) || undefined,
    medioPago: asString(data.medioPago) || undefined,
    referencia: asString(data.referencia) || undefined,
    estado: movimientoEstado(data),
    actorUid: asString(data.actorUid) || undefined,
    actorNombre: asString(data.actorNombre) || undefined,
    actorEmail: asString(data.actorEmail) || undefined,
    actorRol: asString(data.actorRol) || undefined,
    anulacionMotivo: asString(data.anulacionMotivo) || undefined,
    anuladoPorUid: asString(data.anuladoPorUid) || undefined,
    anuladoPorNombre: asString(data.anuladoPorNombre) || undefined,
    anuladoPorRol: asString(data.anuladoPorRol) || undefined,
    anuladoAt: data.anuladoAt as Timestamp | undefined,
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  }
}

function mapIngreso(snapshot: QueryDocumentSnapshot<DocumentData>): IngresoManual {
  return mapMovimientoBase(snapshot)
}

function mapEgreso(snapshot: QueryDocumentSnapshot<DocumentData>): Egreso {
  return mapMovimientoBase(snapshot)
}

function fechaPago(data: DocumentData) {
  return asString(data.fecha) || asString(data.fechaPago) || asString(data.periodoCobro)
}

function inPeriodo(fecha: string, periodo: string) {
  return Boolean(fecha) && fecha.startsWith(periodo)
}

function mapAudit(snapshot: QueryDocumentSnapshot<DocumentData>): FinanzasAuditEntry {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    action: asString(data.action),
    entity: asString(data.entity),
    entityId: asString(data.entityId),
    actorUid: asString(data.actorUid),
    actorNombre: asString(data.actorNombre) || undefined,
    actorEmail: asString(data.actorEmail) || undefined,
    actorRol: asString(data.actorRol) || undefined,
    fechaMovimiento: asString(data.fechaMovimiento) || asString(data.fecha) || undefined,
    concepto: asString(data.concepto) || undefined,
    categoria: asString(data.categoria) || undefined,
    importe: Number.isFinite(Number(data.importe)) ? Number(data.importe) : undefined,
    motivo: asString(data.motivo) || undefined,
    createdAt: data.createdAt as Timestamp | undefined,
  }
}

export async function loadFinanzas(periodo: string): Promise<FinanzasSnapshot> {
  const database = requireDb()
  const [ingresosSnapshot, egresosSnapshot, pagosSnapshot, sociosSnapshot, auditSnapshot, usersSnapshot] = await Promise.all([
    getDocs(collection(database, 'ingresos')),
    getDocs(collection(database, 'egresos')),
    getDocs(collection(database, 'pagos')),
    getDocs(collection(database, 'socios')),
    getDocs(collection(database, 'audit_log')),
    getDocs(collection(database, 'users')),
  ])

  const socios = new Map<string, string>()
  for (const socio of sociosSnapshot.docs) {
    socios.set(socio.id, asString(socio.data().nombre) || socio.id)
  }

  const usuarios = new Map<string, { nombre?: string; email?: string; rol?: string }>()
  for (const usuario of usersSnapshot.docs) {
    const data = usuario.data()
    usuarios.set(usuario.id, {
      nombre: asString(data.displayName) || asString(data.nombre) || undefined,
      email: asString(data.email) || undefined,
      rol: asString(data.role) || undefined,
    })
  }

  const ingresosManuales = ingresosSnapshot.docs
    .map(mapIngreso)
    .filter((item) => inPeriodo(item.fecha, periodo))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))

  const egresos = egresosSnapshot.docs
    .map(mapEgreso)
    .filter((item) => inPeriodo(item.fecha, periodo))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))

  const cobrosSocios: CobroSocio[] = pagosSnapshot.docs
    .map((snapshot) => {
      const data = snapshot.data()
      const socioId = asString(data.socioId)
      return {
        id: snapshot.id,
        socioId,
        socioNombre: socios.get(socioId) ?? (socioId || 'Socio'),
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

  const financeActions = new Set([
    'INGRESO_CREATED',
    'EGRESO_CREATED',
    'INGRESO_VOIDED',
    'EGRESO_VOIDED',
    'ACTIVIDAD_INGRESO_CREATED',
    'ACTIVIDAD_EGRESO_CREATED',
    'ACTIVIDAD_MOVIMIENTO_VOIDED',
  ])
  const audit = auditSnapshot.docs
    .map(mapAudit)
    .filter((item) => financeActions.has(item.action) && item.fechaMovimiento && inPeriodo(item.fechaMovimiento, periodo))
    .map((item) => {
      const currentUser = usuarios.get(item.actorUid)
      return {
        ...item,
        actorNombre: item.actorNombre || currentUser?.nombre || item.actorUid,
        actorEmail: item.actorEmail || currentUser?.email,
        actorRol: item.actorRol || currentUser?.rol,
      }
    })
    .sort((a, b) => {
      const aMillis = a.createdAt?.toMillis() ?? 0
      const bMillis = b.createdAt?.toMillis() ?? 0
      return bMillis - aMillis || b.id.localeCompare(a.id)
    })

  const cobrosSociosTotal = cobrosSocios.reduce((sum, item) => sum + item.importe, 0)
  const otrosIngresos = ingresosManuales
    .filter((item) => item.estado === 'REGISTRADO')
    .reduce((sum, item) => sum + item.importe, 0)
  const egresosTotales = egresos
    .filter((item) => item.estado === 'REGISTRADO')
    .reduce((sum, item) => sum + item.importe, 0)
  const ingresosTotales = cobrosSociosTotal + otrosIngresos

  return {
    periodo,
    ingresosManuales,
    egresos,
    cobrosSocios,
    audit,
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

export async function createIngresoManual(input: NuevoMovimientoFinanciero, actor: FinanzasActor) {
  validateMovimiento(input)
  const database = requireDb()
  const ingresoRef = doc(collection(database, 'ingresos'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)
  const actorSnapshot = actorFields(actor)

  batch.set(ingresoRef, {
    ...input,
    concepto: input.concepto.trim(),
    categoria: input.categoria.trim(),
    medioPago: input.medioPago?.trim() || null,
    referencia: input.referencia?.trim() || null,
    estado: 'REGISTRADO',
    origen: 'MANUAL',
    ...actorSnapshot,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  batch.set(auditRef, {
    ...actorSnapshot,
    action: 'INGRESO_CREATED',
    entity: 'ingresos',
    entityId: ingresoRef.id,
    fecha: input.fecha,
    concepto: input.concepto.trim(),
    categoria: input.categoria.trim(),
    importe: input.importe,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
  return ingresoRef.id
}

export async function createEgreso(input: NuevoMovimientoFinanciero, actor: FinanzasActor) {
  validateMovimiento(input)
  const database = requireDb()
  const egresoRef = doc(collection(database, 'egresos'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)
  const actorSnapshot = actorFields(actor)

  batch.set(egresoRef, {
    ...input,
    concepto: input.concepto.trim(),
    categoria: input.categoria.trim(),
    medioPago: input.medioPago?.trim() || null,
    referencia: input.referencia?.trim() || null,
    estado: 'REGISTRADO',
    origen: 'MANUAL',
    ...actorSnapshot,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  batch.set(auditRef, {
    ...actorSnapshot,
    action: 'EGRESO_CREATED',
    entity: 'egresos',
    entityId: egresoRef.id,
    fecha: input.fecha,
    concepto: input.concepto.trim(),
    categoria: input.categoria.trim(),
    importe: input.importe,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
  return egresoRef.id
}

export async function anularMovimientoFinanciero(
  tipo: MovimientoFinancieroTipo,
  movimientoId: string,
  motivo: string,
  actor: FinanzasActor,
) {
  const cleanReason = motivo.trim()
  if (cleanReason.length < 5) throw new Error('Indicá un motivo de anulación de al menos 5 caracteres.')

  const database = requireDb()
  const collectionName = tipo === 'INGRESO' ? 'ingresos' : 'egresos'
  const movementRef = doc(database, collectionName, movimientoId)
  const auditRef = doc(collection(database, 'audit_log'))
  const actorSnapshot = actorFields(actor)

  await runTransaction(database, async (transaction) => {
    const snapshot = await transaction.get(movementRef)
    if (!snapshot.exists()) throw new Error('El movimiento ya no existe.')

    const data = snapshot.data()
    if (movimientoEstado(data) === 'ANULADO') throw new Error('El movimiento ya se encuentra anulado.')
    if (movimientoOrigen(data) === 'ACTIVIDAD') {
      throw new Error('Los movimientos originados en Actividades deben anularse desde el módulo Actividades para mantener ambos registros sincronizados.')
    }

    transaction.update(movementRef, {
      estado: 'ANULADO',
      anulacionMotivo: cleanReason,
      anuladoPorUid: actor.uid,
      anuladoPorNombre: actorSnapshot.actorNombre,
      anuladoPorRol: actorSnapshot.actorRol,
      anuladoAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    transaction.set(auditRef, {
      ...actorSnapshot,
      action: tipo === 'INGRESO' ? 'INGRESO_VOIDED' : 'EGRESO_VOIDED',
      entity: collectionName,
      entityId: movimientoId,
      fechaMovimiento: asString(data.fecha),
      concepto: asString(data.concepto),
      categoria: asString(data.categoria),
      importe: asNumber(data.importe),
      motivo: cleanReason,
      createdAt: serverTimestamp(),
    })
  })
}
