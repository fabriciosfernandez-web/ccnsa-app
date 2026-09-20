import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export type ActividadTipo = 'RETIRO' | 'SAN_JUAN' | 'CLUB_DAMAS' | 'ACADEMIA' | 'OTRO'
export type ActividadEstado = 'PLANIFICADA' | 'ACTIVA' | 'CERRADA' | 'CANCELADA'
export type MovimientoActividadTipo = 'INGRESO' | 'EGRESO'
export type MovimientoActividadEstado = 'REGISTRADO' | 'ANULADO'
export type ActividadInscripcionEstado = 'CONFIRMADA' | 'CANCELADA'

export interface ActividadActor {
  uid: string
  nombre: string
  email?: string | null
  rol?: string | null
}

export interface Actividad {
  id: string
  nombre: string
  tipo: ActividadTipo
  fechaInicio: string
  fechaFin?: string
  estado: ActividadEstado
  descripcion?: string
  presupuesto?: number
  actorUid?: string
  actorNombre?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface MovimientoActividad {
  id: string
  actividadId: string
  actividadNombre: string
  tipo: MovimientoActividadTipo
  fecha: string
  concepto: string
  categoria: string
  importe: number
  medioPago?: string
  referencia?: string
  estado: MovimientoActividadEstado
  financeCollection: 'ingresos' | 'egresos'
  financeMovementId: string
  actorUid?: string
  actorNombre?: string
  actorRol?: string
  anulacionMotivo?: string
  anuladoPorUid?: string
  anuladoPorNombre?: string
  anuladoAt?: Timestamp
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface ActividadInscripcion {
  id: string
  actividadId: string
  actividadNombre: string
  socioId: string
  uid: string
  socioNombre: string
  estado: ActividadInscripcionEstado
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface NuevaActividad {
  nombre: string
  tipo: ActividadTipo
  fechaInicio: string
  fechaFin?: string
  estado: ActividadEstado
  descripcion?: string
  presupuesto?: number
}

export interface NuevoMovimientoActividad {
  tipo: MovimientoActividadTipo
  fecha: string
  concepto: string
  categoria: string
  importe: number
  medioPago?: string
  referencia?: string
}

export interface ActividadesSnapshot {
  actividades: Actividad[]
  movimientos: MovimientoActividad[]
  inscripciones: ActividadInscripcion[]
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

function actorFields(actor: ActividadActor) {
  return {
    actorUid: actor.uid,
    actorNombre: actor.nombre.trim() || actor.uid,
    actorEmail: actor.email?.trim() || null,
    actorRol: actor.rol?.trim() || null,
  }
}

function actividadTipo(data: DocumentData): ActividadTipo {
  const value = asString(data.tipo)
  return value === 'RETIRO' || value === 'SAN_JUAN' || value === 'CLUB_DAMAS' || value === 'ACADEMIA' ? value : 'OTRO'
}

function actividadEstado(data: DocumentData): ActividadEstado {
  const value = asString(data.estado)
  if (value === 'ACTIVA' || value === 'CERRADA' || value === 'CANCELADA') return value
  return 'PLANIFICADA'
}

function mapActividad(snapshot: QueryDocumentSnapshot<DocumentData>): Actividad {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    nombre: asString(data.nombre) || 'Actividad',
    tipo: actividadTipo(data),
    fechaInicio: asString(data.fechaInicio),
    fechaFin: asString(data.fechaFin) || undefined,
    estado: actividadEstado(data),
    descripcion: asString(data.descripcion) || undefined,
    presupuesto: Number.isFinite(Number(data.presupuesto)) ? Number(data.presupuesto) : undefined,
    actorUid: asString(data.actorUid) || undefined,
    actorNombre: asString(data.actorNombre) || undefined,
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  }
}

function mapMovimiento(snapshot: QueryDocumentSnapshot<DocumentData>): MovimientoActividad {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    actividadId: asString(data.actividadId),
    actividadNombre: asString(data.actividadNombre) || 'Actividad',
    tipo: data.tipo === 'EGRESO' ? 'EGRESO' : 'INGRESO',
    fecha: asString(data.fecha),
    concepto: asString(data.concepto),
    categoria: asString(data.categoria) || 'OTRO',
    importe: asNumber(data.importe),
    medioPago: asString(data.medioPago) || undefined,
    referencia: asString(data.referencia) || undefined,
    estado: data.estado === 'ANULADO' ? 'ANULADO' : 'REGISTRADO',
    financeCollection: data.financeCollection === 'egresos' ? 'egresos' : 'ingresos',
    financeMovementId: asString(data.financeMovementId),
    actorUid: asString(data.actorUid) || undefined,
    actorNombre: asString(data.actorNombre) || undefined,
    actorRol: asString(data.actorRol) || undefined,
    anulacionMotivo: asString(data.anulacionMotivo) || undefined,
    anuladoPorUid: asString(data.anuladoPorUid) || undefined,
    anuladoPorNombre: asString(data.anuladoPorNombre) || undefined,
    anuladoAt: data.anuladoAt as Timestamp | undefined,
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  }
}

function mapInscripcion(snapshot: QueryDocumentSnapshot<DocumentData>): ActividadInscripcion {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    actividadId: asString(data.actividadId),
    actividadNombre: asString(data.actividadNombre) || 'Actividad',
    socioId: asString(data.socioId),
    uid: asString(data.uid),
    socioNombre: asString(data.socioNombre) || 'Socio',
    estado: data.estado === 'CANCELADA' ? 'CANCELADA' : 'CONFIRMADA',
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  }
}

function validateDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Indicá una ${label} válida.`)
}

function validateActividad(input: NuevaActividad) {
  if (!input.nombre.trim()) throw new Error('Indicá el nombre de la actividad.')
  validateDate(input.fechaInicio, 'fecha de inicio')
  if (input.fechaFin) {
    validateDate(input.fechaFin, 'fecha de cierre')
    if (input.fechaFin < input.fechaInicio) throw new Error('La fecha de cierre no puede ser anterior al inicio.')
  }
  if (input.presupuesto !== undefined && (!Number.isFinite(input.presupuesto) || input.presupuesto < 0)) {
    throw new Error('El presupuesto no puede ser negativo.')
  }
}

function validateMovimiento(input: NuevoMovimientoActividad) {
  validateDate(input.fecha, 'fecha')
  if (!input.concepto.trim()) throw new Error('Indicá el concepto del movimiento.')
  if (!input.categoria.trim()) throw new Error('Indicá una categoría.')
  if (!Number.isFinite(input.importe) || input.importe <= 0) throw new Error('El importe debe ser mayor a cero.')
}

export async function loadSocioActividades(): Promise<Actividad[]> {
  const database = requireDb()
  const snapshot = await getDocs(
    query(
      collection(database, 'actividades'),
      where('estado', 'in', ['PLANIFICADA', 'ACTIVA']),
    ),
  )

  return snapshot.docs
    .map(mapActividad)
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio) || a.nombre.localeCompare(b.nombre, 'es'))
}

export async function loadSocioActivityRegistrations(socioId: string): Promise<ActividadInscripcion[]> {
  const database = requireDb()
  const snapshot = await getDocs(
    query(
      collection(database, 'actividad_inscripciones'),
      where('socioId', '==', socioId),
    ),
  )

  return snapshot.docs
    .map(mapInscripcion)
    .sort((a, b) => a.actividadNombre.localeCompare(b.actividadNombre, 'es'))
}

export async function setSocioActivityRegistration(
  actividad: Actividad,
  socio: { socioId: string; uid: string; nombre: string },
  estado: ActividadInscripcionEstado,
) {
  if (actividad.estado !== 'PLANIFICADA' && actividad.estado !== 'ACTIVA') {
    throw new Error('La actividad ya no admite confirmaciones.')
  }

  const database = requireDb()
  const id = `${actividad.id}__${socio.socioId}`
  const ref = doc(database, 'actividad_inscripciones', id)

  await setDoc(ref, {
    actividadId: actividad.id,
    actividadNombre: actividad.nombre,
    socioId: socio.socioId,
    uid: socio.uid,
    socioNombre: socio.nombre.trim() || 'Socio',
    estado,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true })

  return id
}

export async function loadActividades(): Promise<ActividadesSnapshot> {
  const database = requireDb()
  const [actividadesSnapshot, movimientosSnapshot, inscripcionesSnapshot] = await Promise.all([
    getDocs(collection(database, 'actividades')),
    getDocs(collection(database, 'movimientos_actividad')),
    getDocs(collection(database, 'actividad_inscripciones')),
  ])

  return {
    actividades: actividadesSnapshot.docs
      .map(mapActividad)
      .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio) || a.nombre.localeCompare(b.nombre, 'es')),
    movimientos: movimientosSnapshot.docs
      .map(mapMovimiento)
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id)),
    inscripciones: inscripcionesSnapshot.docs
      .map(mapInscripcion)
      .sort((a, b) => a.socioNombre.localeCompare(b.socioNombre, 'es')),
  }
}

export async function createActividad(input: NuevaActividad, actor: ActividadActor) {
  validateActividad(input)
  const database = requireDb()
  const actividadRef = doc(collection(database, 'actividades'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)
  const actorSnapshot = actorFields(actor)

  batch.set(actividadRef, {
    nombre: input.nombre.trim(),
    tipo: input.tipo,
    fechaInicio: input.fechaInicio,
    fechaFin: input.fechaFin || null,
    estado: input.estado,
    descripcion: input.descripcion?.trim() || null,
    presupuesto: input.presupuesto ?? null,
    ...actorSnapshot,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  batch.set(auditRef, {
    ...actorSnapshot,
    action: 'ACTIVIDAD_CREATED',
    entity: 'actividades',
    entityId: actividadRef.id,
    concepto: input.nombre.trim(),
    categoria: input.tipo,
    fechaMovimiento: input.fechaInicio,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
  return actividadRef.id
}

export async function setActividadEstado(actividadId: string, estado: ActividadEstado, actor: ActividadActor) {
  const database = requireDb()
  const actividadRef = doc(database, 'actividades', actividadId)
  const auditRef = doc(collection(database, 'audit_log'))
  const actorSnapshot = actorFields(actor)

  await runTransaction(database, async (transaction) => {
    const snapshot = await transaction.get(actividadRef)
    if (!snapshot.exists()) throw new Error('La actividad ya no existe.')
    const data = snapshot.data()
    const previous = actividadEstado(data)
    if (previous === estado) return
    if (previous === 'CERRADA' || previous === 'CANCELADA') {
      throw new Error('Una actividad cerrada o cancelada no puede reabrirse desde esta pantalla.')
    }

    transaction.update(actividadRef, {
      estado,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByNombre: actorSnapshot.actorNombre,
    })
    transaction.set(auditRef, {
      ...actorSnapshot,
      action: 'ACTIVIDAD_STATUS_CHANGED',
      entity: 'actividades',
      entityId: actividadId,
      concepto: asString(data.nombre),
      categoria: asString(data.tipo),
      estadoAnterior: previous,
      estadoNuevo: estado,
      fechaMovimiento: asString(data.fechaInicio),
      createdAt: serverTimestamp(),
    })
  })
}

export async function createMovimientoActividad(
  actividadId: string,
  input: NuevoMovimientoActividad,
  actor: ActividadActor,
) {
  validateMovimiento(input)
  const database = requireDb()
  const actividadRef = doc(database, 'actividades', actividadId)
  const movimientoRef = doc(collection(database, 'movimientos_actividad'))
  const financeCollection = input.tipo === 'INGRESO' ? 'ingresos' : 'egresos'
  const financeRef = doc(collection(database, financeCollection))
  const auditRef = doc(collection(database, 'audit_log'))
  const actorSnapshot = actorFields(actor)

  await runTransaction(database, async (transaction) => {
    const actividadSnapshot = await transaction.get(actividadRef)
    if (!actividadSnapshot.exists()) throw new Error('La actividad ya no existe.')
    const actividad = actividadSnapshot.data()
    const estado = actividadEstado(actividad)
    if (estado === 'CERRADA' || estado === 'CANCELADA') {
      throw new Error('No se pueden registrar movimientos en una actividad cerrada o cancelada.')
    }

    const actividadNombre = asString(actividad.nombre) || 'Actividad'
    const common = {
      fecha: input.fecha,
      concepto: input.concepto.trim(),
      importe: input.importe,
      medioPago: input.medioPago?.trim() || null,
      referencia: input.referencia?.trim() || null,
      estado: 'REGISTRADO',
      origen: 'ACTIVIDAD',
      actividadId,
      actividadNombre,
      movimientoActividadId: movimientoRef.id,
      ...actorSnapshot,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    transaction.set(financeRef, {
      ...common,
      categoria: 'ACTIVIDAD',
      subcategoriaActividad: input.categoria.trim(),
    })

    transaction.set(movimientoRef, {
      actividadId,
      actividadNombre,
      tipo: input.tipo,
      fecha: input.fecha,
      concepto: input.concepto.trim(),
      categoria: input.categoria.trim(),
      importe: input.importe,
      medioPago: input.medioPago?.trim() || null,
      referencia: input.referencia?.trim() || null,
      estado: 'REGISTRADO',
      financeCollection,
      financeMovementId: financeRef.id,
      ...actorSnapshot,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    transaction.set(auditRef, {
      ...actorSnapshot,
      action: input.tipo === 'INGRESO' ? 'ACTIVIDAD_INGRESO_CREATED' : 'ACTIVIDAD_EGRESO_CREATED',
      entity: 'movimientos_actividad',
      entityId: movimientoRef.id,
      actividadId,
      actividadNombre,
      financeCollection,
      financeMovementId: financeRef.id,
      fechaMovimiento: input.fecha,
      concepto: input.concepto.trim(),
      categoria: input.categoria.trim(),
      importe: input.importe,
      createdAt: serverTimestamp(),
    })
  })

  return movimientoRef.id
}

export async function anularMovimientoActividad(
  movimientoId: string,
  motivo: string,
  actor: ActividadActor,
) {
  const cleanReason = motivo.trim()
  if (cleanReason.length < 5) throw new Error('Indicá un motivo de anulación de al menos 5 caracteres.')

  const database = requireDb()
  const movimientoRef = doc(database, 'movimientos_actividad', movimientoId)
  const auditRef = doc(collection(database, 'audit_log'))
  const actorSnapshot = actorFields(actor)

  await runTransaction(database, async (transaction) => {
    const movimientoSnapshot = await transaction.get(movimientoRef)
    if (!movimientoSnapshot.exists()) throw new Error('El movimiento ya no existe.')
    const movimiento = movimientoSnapshot.data()
    if (movimiento.estado === 'ANULADO') throw new Error('El movimiento ya se encuentra anulado.')

    const financeCollection = movimiento.financeCollection === 'egresos' ? 'egresos' : 'ingresos'
    const financeMovementId = asString(movimiento.financeMovementId)
    if (!financeMovementId) throw new Error('El movimiento financiero vinculado no está identificado.')
    const financeRef = doc(database, financeCollection, financeMovementId)
    const financeSnapshot = await transaction.get(financeRef)
    if (!financeSnapshot.exists()) throw new Error('El movimiento financiero vinculado ya no existe.')
    if (financeSnapshot.data().estado === 'ANULADO') throw new Error('El movimiento financiero vinculado ya está anulado.')

    const voidFields = {
      estado: 'ANULADO',
      anulacionMotivo: cleanReason,
      anuladoPorUid: actor.uid,
      anuladoPorNombre: actorSnapshot.actorNombre,
      anuladoPorRol: actorSnapshot.actorRol,
      anuladoAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    transaction.update(movimientoRef, voidFields)
    transaction.update(financeRef, voidFields)
    transaction.set(auditRef, {
      ...actorSnapshot,
      action: 'ACTIVIDAD_MOVIMIENTO_VOIDED',
      entity: 'movimientos_actividad',
      entityId: movimientoId,
      actividadId: asString(movimiento.actividadId),
      actividadNombre: asString(movimiento.actividadNombre),
      financeCollection,
      financeMovementId,
      fechaMovimiento: asString(movimiento.fecha),
      concepto: asString(movimiento.concepto),
      categoria: asString(movimiento.categoria),
      importe: asNumber(movimiento.importe),
      motivo: cleanReason,
      createdAt: serverTimestamp(),
    })
  })
}
