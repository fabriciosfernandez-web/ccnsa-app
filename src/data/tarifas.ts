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
import { resolveAuditActor, type AuditActorInput } from './auditActor'
import { createObligacion, listSocios, type SocioCategoria } from './socios'
import {
  aplicarExcepcion,
  listCambiosCategoria,
  listExcepcionesCobro,
  resolverCategoriaPeriodo,
} from './reglasCobro'

export type TarifaCategoria = SocioCategoria | 'TODOS'

export interface TarifaCuota {
  id: string
  concepto: string
  categoria: TarifaCategoria
  importe: number
  vigenciaDesde: string
  vigenciaHasta?: string
  diaVencimiento: number
  activa: boolean
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface GeneracionCuotasResult {
  periodo: string
  creadas: number
  omitidas: number
  exentas: number
  ajustadas: number
  totalGenerado: number
  creditoAplicado: number
}

function requireDb() {
  if (!db) throw new Error('Firebase no está configurado.')
  return db
}

function mapTarifa(snapshot: QueryDocumentSnapshot<DocumentData>): TarifaCuota {
  const data = snapshot.data()
  const categoria: TarifaCategoria = data.categoria === 'CASADO'
    ? 'CASADO'
    : data.categoria === 'TODOS'
      ? 'TODOS'
      : 'SOLTERO'

  return {
    id: snapshot.id,
    concepto: String(data.concepto ?? ''),
    categoria,
    importe: Number(data.importe ?? 0),
    vigenciaDesde: String(data.vigenciaDesde ?? ''),
    vigenciaHasta: data.vigenciaHasta ? String(data.vigenciaHasta) : undefined,
    diaVencimiento: Math.min(31, Math.max(1, Number(data.diaVencimiento ?? 10))),
    activa: data.activa !== false,
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  }
}

function tarifaAplicaPeriodo(tarifa: TarifaCuota, periodo: string) {
  return tarifa.activa
    && tarifa.vigenciaDesde <= periodo
    && (!tarifa.vigenciaHasta || tarifa.vigenciaHasta >= periodo)
}

function categoriaAplica(tarifa: TarifaCuota, categoria: SocioCategoria) {
  return tarifa.categoria === 'TODOS' || tarifa.categoria === categoria
}

function fechaVencimiento(periodo: string, dia: number) {
  const [year, month] = periodo.split('-').map(Number)
  const ultimoDia = new Date(year, month, 0).getDate()
  return `${periodo}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`
}

export async function listTarifasCuota(): Promise<TarifaCuota[]> {
  const database = requireDb()
  const snapshot = await getDocs(collection(database, 'tarifas_cuotas'))
  return snapshot.docs
    .map(mapTarifa)
    .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde) || a.concepto.localeCompare(b.concepto, 'es'))
}

export async function createTarifaCuota(
  input: Omit<TarifaCuota, 'id' | 'createdAt' | 'updatedAt'>,
  actor: AuditActorInput,
): Promise<string> {
  const database = requireDb()
  const actorSnapshot = await resolveAuditActor(actor)
  const tarifaRef = doc(collection(database, 'tarifas_cuotas'))
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)

  batch.set(tarifaRef, {
    ...input,
    vigenciaHasta: input.vigenciaHasta || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(auditRef, {
    ...actorSnapshot,
    action: 'TARIFA_CUOTA_CREATED',
    entity: 'tarifas_cuotas',
    entityId: tarifaRef.id,
    concepto: input.concepto,
    categoria: input.categoria,
    importe: input.importe,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
  return tarifaRef.id
}

export async function setTarifaCuotaActiva(tarifaId: string, activa: boolean, actor: AuditActorInput) {
  const database = requireDb()
  const actorSnapshot = await resolveAuditActor(actor)
  const tarifaRef = doc(database, 'tarifas_cuotas', tarifaId)
  const auditRef = doc(collection(database, 'audit_log'))
  const batch = writeBatch(database)

  batch.update(tarifaRef, { activa, updatedAt: serverTimestamp() })
  batch.set(auditRef, {
    ...actorSnapshot,
    action: activa ? 'TARIFA_CUOTA_ACTIVATED' : 'TARIFA_CUOTA_DEACTIVATED',
    entity: 'tarifas_cuotas',
    entityId: tarifaId,
    createdAt: serverTimestamp(),
  })
  await batch.commit()
}

export async function generarCuotasPeriodo(periodo: string, actor: AuditActorInput): Promise<GeneracionCuotasResult> {
  const database = requireDb()
  const actorSnapshot = await resolveAuditActor(actor)
  const [socios, tarifas, excepciones, cambios, obligacionesSnapshot] = await Promise.all([
    listSocios(),
    listTarifasCuota(),
    listExcepcionesCobro(),
    listCambiosCategoria(),
    getDocs(query(collection(database, 'obligaciones'), where('periodo', '==', periodo))),
  ])

  const tarifasAplicables = tarifas.filter((tarifa) => tarifaAplicaPeriodo(tarifa, periodo))
  if (tarifasAplicables.length === 0) {
    throw new Error(`No hay tarifas activas y vigentes para ${periodo}.`)
  }

  const existentes = new Set<string>()
  for (const obligation of obligacionesSnapshot.docs) {
    const data = obligation.data()
    const socioId = String(data.socioId ?? '')
    const tarifaId = data.tarifaId ? String(data.tarifaId) : ''
    if (socioId && tarifaId) existentes.add(`${socioId}|${tarifaId}`)
  }

  let creadas = 0
  let omitidas = 0
  let exentas = 0
  let ajustadas = 0
  let totalGenerado = 0
  let creditoAplicado = 0

  for (const socio of socios.filter((item) => item.estado === 'ACTIVO')) {
    const categoriaPeriodo = resolverCategoriaPeriodo(socio, periodo, cambios)
    for (const tarifa of tarifasAplicables.filter((item) => categoriaAplica(item, categoriaPeriodo))) {
      const key = `${socio.id}|${tarifa.id}`
      if (existentes.has(key)) {
        omitidas += 1
        continue
      }

      const excepcion = aplicarExcepcion(socio.id, 'MENSUAL', periodo, tarifa.importe, excepciones)
      const importe = excepcion.estado === 'EXENTA' ? tarifa.importe : excepcion.importe
      const generatedInput = {
        socioId: socio.id,
        concepto: tarifa.concepto,
        periodo,
        importe,
        estado: excepcion.estado,
        fechaVencimiento: fechaVencimiento(periodo, tarifa.diaVencimiento),
        tarifaId: tarifa.id,
        excepcionId: excepcion.excepcion?.id ?? null,
        categoriaAplicada: categoriaPeriodo,
        importeBase: tarifa.importe,
        origen: 'TARIFA',
      } as unknown as Parameters<typeof createObligacion>[0]

      const result = await createObligacion(generatedInput, actorSnapshot)
      existentes.add(key)
      creadas += 1
      if (excepcion.estado === 'EXENTA') exentas += 1
      else {
        totalGenerado += importe
        if (importe !== tarifa.importe) ajustadas += 1
      }
      creditoAplicado += result.importeAplicado
    }
  }

  const auditRef = doc(collection(database, 'audit_log'))
  const summaryBatch = writeBatch(database)
  summaryBatch.set(auditRef, {
    ...actorSnapshot,
    action: 'CUOTAS_PERIODO_GENERATED',
    entity: 'obligaciones',
    periodo,
    creadas,
    omitidas,
    exentas,
    ajustadas,
    totalGenerado,
    creditoAplicado,
    createdAt: serverTimestamp(),
  })
  await summaryBatch.commit()

  return { periodo, creadas, omitidas, exentas, ajustadas, totalGenerado, creditoAplicado }
}
