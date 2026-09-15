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
import {
  createObligacion,
  listSocios,
  type Socio,
  type SocioCategoria,
} from './socios'

export type ReglaEspecialTipo = 'ANUAL' | 'INGRESO'
export type CategoriaAplicable = SocioCategoria | 'TODOS'
export type ExcepcionTipo = 'EXENTO' | 'IMPORTE_FIJO'
export type ExcepcionAmbito = 'MENSUAL' | 'ANUAL' | 'INGRESO' | 'TODOS'

export interface ReglaCobroEspecial {
  id: string
  concepto: string
  tipo: ReglaEspecialTipo
  categoria: CategoriaAplicable
  importe: number
  vigenciaDesde: string
  vigenciaHasta?: string
  mesVencimiento?: number
  diaVencimiento: number
  activa: boolean
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface ExcepcionCobro {
  id: string
  socioId: string
  tipo: ExcepcionTipo
  ambito: ExcepcionAmbito
  periodoDesde: string
  periodoHasta?: string
  importe?: number
  motivo: string
  activa: boolean
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface CambioCategoria {
  id: string
  socioId: string
  categoriaAnterior: SocioCategoria
  categoriaNueva: SocioCategoria
  vigenteDesde: string
  actorUid?: string
  createdAt?: Timestamp
}

export interface AplicacionExcepcion {
  excepcion?: ExcepcionCobro
  importe: number
  estado?: 'EXENTA'
}

export interface GeneracionEspecialResult {
  creadas: number
  omitidas: number
  exentas: number
  totalGenerado: number
  creditoAplicado: number
}

function requireDb() {
  if (!db) throw new Error('Firebase no está configurado.')
  return db
}

function mapRegla(snapshot: QueryDocumentSnapshot<DocumentData>): ReglaCobroEspecial {
  const data = snapshot.data()
  const tipo: ReglaEspecialTipo = data.tipo === 'INGRESO' ? 'INGRESO' : 'ANUAL'
  const categoria: CategoriaAplicable = data.categoria === 'CASADO'
    ? 'CASADO'
    : data.categoria === 'TODOS'
      ? 'TODOS'
      : 'SOLTERO'

  return {
    id: snapshot.id,
    concepto: String(data.concepto ?? ''),
    tipo,
    categoria,
    importe: Number(data.importe ?? 0),
    vigenciaDesde: String(data.vigenciaDesde ?? ''),
    vigenciaHasta: data.vigenciaHasta ? String(data.vigenciaHasta) : undefined,
    mesVencimiento: data.mesVencimiento ? Number(data.mesVencimiento) : undefined,
    diaVencimiento: Math.min(31, Math.max(1, Number(data.diaVencimiento ?? 10))),
    activa: data.activa !== false,
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  }
}

function mapExcepcion(snapshot: QueryDocumentSnapshot<DocumentData>): ExcepcionCobro {
  const data = snapshot.data()
  const tipo: ExcepcionTipo = data.tipo === 'IMPORTE_FIJO' ? 'IMPORTE_FIJO' : 'EXENTO'
  const ambitoRaw = String(data.ambito ?? 'TODOS')
  const ambito: ExcepcionAmbito = ambitoRaw === 'MENSUAL' || ambitoRaw === 'ANUAL' || ambitoRaw === 'INGRESO'
    ? ambitoRaw
    : 'TODOS'

  return {
    id: snapshot.id,
    socioId: String(data.socioId ?? ''),
    tipo,
    ambito,
    periodoDesde: String(data.periodoDesde ?? ''),
    periodoHasta: data.periodoHasta ? String(data.periodoHasta) : undefined,
    importe: data.importe === null || data.importe === undefined ? undefined : Number(data.importe),
    motivo: String(data.motivo ?? ''),
    activa: data.activa !== false,
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  }
}

function mapCambio(snapshot: QueryDocumentSnapshot<DocumentData>): CambioCategoria {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    socioId: String(data.socioId ?? ''),
    categoriaAnterior: data.categoriaAnterior === 'CASADO' ? 'CASADO' : 'SOLTERO',
    categoriaNueva: data.categoriaNueva === 'CASADO' ? 'CASADO' : 'SOLTERO',
    vigenteDesde: String(data.vigenteDesde ?? ''),
    actorUid: data.actorUid ? String(data.actorUid) : undefined,
    createdAt: data.createdAt as Timestamp | undefined,
  }
}

export async function listReglasCobroEspecial(): Promise<ReglaCobroEspecial[]> {
  const database = requireDb()
  const snapshot = await getDocs(collection(database, 'reglas_cobro'))
  return snapshot.docs.map(mapRegla).sort((a, b) => a.tipo.localeCompare(b.tipo) || b.vigenciaDesde.localeCompare(a.vigenciaDesde))
}

export async function listExcepcionesCobro(): Promise<ExcepcionCobro[]> {
  const database = requireDb()
  const snapshot = await getDocs(collection(database, 'excepciones_cobro'))
  return snapshot.docs.map(mapExcepcion).sort((a, b) => b.periodoDesde.localeCompare(a.periodoDesde))
}

export async function listCambiosCategoria(): Promise<CambioCategoria[]> {
  const database = requireDb()
  const snapshot = await getDocs(collection(database, 'categoria_historial'))
  return snapshot.docs.map(mapCambio).sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
}

export async function createReglaCobroEspecial(
  input: Omit<ReglaCobroEspecial, 'id' | 'createdAt' | 'updatedAt'>,
  actorUid: string,
) {
  const database = requireDb()
  const ruleRef = doc(collection(database, 'reglas_cobro'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)
  batch.set(ruleRef, {
    ...input,
    vigenciaHasta: input.vigenciaHasta || null,
    mesVencimiento: input.tipo === 'ANUAL' ? (input.mesVencimiento ?? 1) : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(auditRef, {
    actorUid,
    action: 'REGLA_COBRO_CREATED',
    entity: 'reglas_cobro',
    entityId: ruleRef.id,
    tipo: input.tipo,
    categoria: input.categoria,
    importe: input.importe,
    createdAt: serverTimestamp(),
  })
  await batch.commit()
  return ruleRef.id
}

export async function setReglaCobroActiva(id: string, activa: boolean, actorUid: string) {
  const database = requireDb()
  const ruleRef = doc(database, 'reglas_cobro', id)
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)
  batch.update(ruleRef, { activa, updatedAt: serverTimestamp() })
  batch.set(auditRef, {
    actorUid,
    action: activa ? 'REGLA_COBRO_ACTIVATED' : 'REGLA_COBRO_DEACTIVATED',
    entity: 'reglas_cobro',
    entityId: id,
    createdAt: serverTimestamp(),
  })
  await batch.commit()
}

export async function createExcepcionCobro(
  input: Omit<ExcepcionCobro, 'id' | 'createdAt' | 'updatedAt'>,
  actorUid: string,
) {
  const database = requireDb()
  const exceptionRef = doc(collection(database, 'excepciones_cobro'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)
  batch.set(exceptionRef, {
    ...input,
    importe: input.tipo === 'IMPORTE_FIJO' ? input.importe : null,
    periodoHasta: input.periodoHasta || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(auditRef, {
    actorUid,
    action: 'EXCEPCION_COBRO_CREATED',
    entity: 'excepciones_cobro',
    entityId: exceptionRef.id,
    socioId: input.socioId,
    tipo: input.tipo,
    ambito: input.ambito,
    createdAt: serverTimestamp(),
  })
  await batch.commit()
  return exceptionRef.id
}

export async function setExcepcionCobroActiva(id: string, activa: boolean, actorUid: string) {
  const database = requireDb()
  const exceptionRef = doc(database, 'excepciones_cobro', id)
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)
  batch.update(exceptionRef, { activa, updatedAt: serverTimestamp() })
  batch.set(auditRef, {
    actorUid,
    action: activa ? 'EXCEPCION_COBRO_ACTIVATED' : 'EXCEPCION_COBRO_DEACTIVATED',
    entity: 'excepciones_cobro',
    entityId: id,
    createdAt: serverTimestamp(),
  })
  await batch.commit()
}

export function resolverCategoriaPeriodo(
  socio: Socio,
  periodo: string,
  cambios: CambioCategoria[],
): SocioCategoria {
  let categoria = socio.categoria
  const historial = cambios
    .filter((item) => item.socioId === socio.id)
    .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))

  for (const cambio of historial) {
    if (periodo < cambio.vigenteDesde) categoria = cambio.categoriaAnterior
  }
  return categoria
}

export function aplicarExcepcion(
  socioId: string,
  ambito: ExcepcionAmbito,
  periodo: string,
  importeBase: number,
  excepciones: ExcepcionCobro[],
): AplicacionExcepcion {
  const exception = excepciones
    .filter((item) => item.activa)
    .filter((item) => item.socioId === socioId)
    .filter((item) => item.ambito === 'TODOS' || item.ambito === ambito)
    .filter((item) => item.periodoDesde <= periodo && (!item.periodoHasta || item.periodoHasta >= periodo))
    .sort((a, b) => b.periodoDesde.localeCompare(a.periodoDesde))[0]

  if (!exception) return { importe: importeBase }
  if (exception.tipo === 'EXENTO') return { excepcion: exception, importe: importeBase, estado: 'EXENTA' }
  return { excepcion: exception, importe: Math.max(0, Number(exception.importe ?? importeBase)) }
}

export async function cambiarCategoriaSocio(
  socio: Socio,
  categoriaNueva: SocioCategoria,
  vigenteDesde: string,
  actorUid: string,
) {
  if (socio.categoria === categoriaNueva) throw new Error('El socio ya pertenece a esa categoría.')
  const database = requireDb()
  const socioRef = doc(database, 'socios', socio.id)
  const historyRef = doc(collection(database, 'categoria_historial'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)

  batch.update(socioRef, { categoria: categoriaNueva, updatedAt: serverTimestamp() })
  batch.set(historyRef, {
    socioId: socio.id,
    categoriaAnterior: socio.categoria,
    categoriaNueva,
    vigenteDesde,
    actorUid,
    createdAt: serverTimestamp(),
  })
  batch.set(auditRef, {
    actorUid,
    action: 'SOCIO_CATEGORY_CHANGED',
    entity: 'socios',
    entityId: socio.id,
    categoriaAnterior: socio.categoria,
    categoriaNueva,
    vigenteDesde,
    createdAt: serverTimestamp(),
  })
  await batch.commit()
}

function categoriaAplica(regla: ReglaCobroEspecial, categoria: SocioCategoria) {
  return regla.categoria === 'TODOS' || regla.categoria === categoria
}

function reglaVigente(regla: ReglaCobroEspecial, periodo: string) {
  return regla.activa
    && regla.vigenciaDesde <= periodo
    && (!regla.vigenciaHasta || regla.vigenciaHasta >= periodo)
}

function fechaAnual(year: number, month: number, day: number) {
  const last = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`
}

export async function generarCargosAnuales(year: number, actorUid: string): Promise<GeneracionEspecialResult> {
  const database = requireDb()
  const periodoBase = `${year}-01`
  const periodoObligacion = `${year}-ANUAL`
  const [socios, reglas, excepciones, cambios, existingSnapshot] = await Promise.all([
    listSocios(),
    listReglasCobroEspecial(),
    listExcepcionesCobro(),
    listCambiosCategoria(),
    getDocs(collection(database, 'obligaciones')),
  ])
  const aplicables = reglas.filter((item) => item.tipo === 'ANUAL' && reglaVigente(item, periodoBase))
  if (aplicables.length === 0) throw new Error(`No hay reglas anuales activas para ${year}.`)

  const existentes = new Set<string>()
  for (const snap of existingSnapshot.docs) {
    const data = snap.data()
    if (data.reglaCobroId && data.socioId && data.periodo === periodoObligacion) {
      existentes.add(`${String(data.socioId)}|${String(data.reglaCobroId)}`)
    }
  }

  let creadas = 0
  let omitidas = 0
  let exentas = 0
  let totalGenerado = 0
  let creditoAplicado = 0

  for (const socio of socios.filter((item) => item.estado === 'ACTIVO')) {
    const categoria = resolverCategoriaPeriodo(socio, periodoBase, cambios)
    for (const regla of aplicables.filter((item) => categoriaAplica(item, categoria))) {
      const key = `${socio.id}|${regla.id}`
      if (existentes.has(key)) {
        omitidas += 1
        continue
      }
      const applied = aplicarExcepcion(socio.id, 'ANUAL', periodoBase, regla.importe, excepciones)
      const importe = applied.estado === 'EXENTA' ? regla.importe : applied.importe
      const result = await createObligacion({
        socioId: socio.id,
        concepto: regla.concepto,
        periodo: periodoObligacion,
        importe,
        estado: applied.estado,
        fechaVencimiento: fechaAnual(year, regla.mesVencimiento ?? 1, regla.diaVencimiento),
        reglaCobroId: regla.id,
        excepcionId: applied.excepcion?.id ?? null,
        origen: 'REGLA_ANUAL',
      } as unknown as Parameters<typeof createObligacion>[0], actorUid)
      existentes.add(key)
      creadas += 1
      if (applied.estado === 'EXENTA') exentas += 1
      else totalGenerado += importe
      creditoAplicado += result.importeAplicado
    }
  }

  return { creadas, omitidas, exentas, totalGenerado, creditoAplicado }
}

export async function generarAporteIngreso(socio: Socio, actorUid: string): Promise<GeneracionEspecialResult> {
  const database = requireDb()
  const fechaIngreso = socio.fechaIngreso || new Date().toISOString().slice(0, 10)
  const periodo = fechaIngreso.slice(0, 7)
  const [reglas, excepciones, cambios, existingSnapshot] = await Promise.all([
    listReglasCobroEspecial(),
    listExcepcionesCobro(),
    listCambiosCategoria(),
    getDocs(collection(database, 'obligaciones')),
  ])
  const categoria = resolverCategoriaPeriodo(socio, periodo, cambios)
  const aplicables = reglas.filter((item) => item.tipo === 'INGRESO' && reglaVigente(item, periodo) && categoriaAplica(item, categoria))
  if (aplicables.length === 0) throw new Error('No hay una regla de aporte de ingreso activa para este socio.')

  const existentes = new Set<string>()
  for (const snap of existingSnapshot.docs) {
    const data = snap.data()
    if (data.reglaCobroId && data.socioId === socio.id && data.origen === 'REGLA_INGRESO') {
      existentes.add(`${socio.id}|${String(data.reglaCobroId)}`)
    }
  }

  let creadas = 0
  let omitidas = 0
  let exentas = 0
  let totalGenerado = 0
  let creditoAplicado = 0

  for (const regla of aplicables) {
    const key = `${socio.id}|${regla.id}`
    if (existentes.has(key)) {
      omitidas += 1
      continue
    }
    const applied = aplicarExcepcion(socio.id, 'INGRESO', periodo, regla.importe, excepciones)
    const importe = applied.estado === 'EXENTA' ? regla.importe : applied.importe
    const result = await createObligacion({
      socioId: socio.id,
      concepto: regla.concepto,
      periodo,
      importe,
      estado: applied.estado,
      fechaVencimiento: fechaIngreso,
      reglaCobroId: regla.id,
      excepcionId: applied.excepcion?.id ?? null,
      origen: 'REGLA_INGRESO',
    } as unknown as Parameters<typeof createObligacion>[0], actorUid)
    existentes.add(key)
    creadas += 1
    if (applied.estado === 'EXENTA') exentas += 1
    else totalGenerado += importe
    creditoAplicado += result.importeAplicado
  }

  return { creadas, omitidas, exentas, totalGenerado, creditoAplicado }
}
