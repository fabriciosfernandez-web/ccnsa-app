import {
  collection,
  doc,
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
  estado: 'PENDIENTE' | 'PAGADO' | 'ANULADO'
  createdAt?: Timestamp
}

export interface Pago {
  id: string
  socioId: string
  importe: number
  fecha: string
  referencia?: string
  createdAt?: Timestamp
}

function requireDb() {
  if (!db) throw new Error('Firebase no está configurado.')
  return db
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
  return {
    id: snapshot.id,
    socioId: String(data.socioId ?? ''),
    concepto: String(data.concepto ?? ''),
    periodo: String(data.periodo ?? ''),
    importe: Number(data.importe ?? 0),
    estado: data.estado === 'PAGADO' || data.estado === 'ANULADO' ? data.estado : 'PENDIENTE',
    createdAt: data.createdAt as Timestamp | undefined,
  }
}

function mapPago(snapshot: QueryDocumentSnapshot<DocumentData>): Pago {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    socioId: String(data.socioId ?? ''),
    importe: Number(data.importe ?? 0),
    fecha: String(data.fecha ?? ''),
    referencia: data.referencia ? String(data.referencia) : undefined,
    createdAt: data.createdAt as Timestamp | undefined,
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
  const snapshot = await getDocs(
    query(collection(database, 'obligaciones'), where('socioId', '==', socioId)),
  )
  return snapshot.docs
    .map(mapObligacion)
    .sort((a, b) => b.periodo.localeCompare(a.periodo))
}

export async function createObligacion(
  input: Omit<Obligacion, 'id' | 'createdAt'>,
  actorUid: string,
): Promise<string> {
  const database = requireDb()
  const obligacionRef = doc(collection(database, 'obligaciones'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)

  batch.set(obligacionRef, {
    ...input,
    createdAt: serverTimestamp(),
  })
  batch.set(auditRef, {
    actorUid,
    action: 'OBLIGACION_CREATED',
    entity: 'obligaciones',
    entityId: obligacionRef.id,
    socioId: input.socioId,
    importe: input.importe,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
  return obligacionRef.id
}

export async function listPagos(socioId: string): Promise<Pago[]> {
  const database = requireDb()
  const snapshot = await getDocs(
    query(collection(database, 'pagos'), where('socioId', '==', socioId)),
  )
  return snapshot.docs
    .map(mapPago)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export async function createPago(
  input: Omit<Pago, 'id' | 'createdAt'>,
  actorUid: string,
): Promise<string> {
  const database = requireDb()
  const pagoRef = doc(collection(database, 'pagos'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)

  batch.set(pagoRef, {
    ...input,
    createdAt: serverTimestamp(),
  })
  batch.set(auditRef, {
    actorUid,
    action: 'PAGO_CREATED',
    entity: 'pagos',
    entityId: pagoRef.id,
    socioId: input.socioId,
    importe: input.importe,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
  return pagoRef.id
}
