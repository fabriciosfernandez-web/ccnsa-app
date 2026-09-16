import type { MigrationPreview } from './migration2026'
import type {
  MigrationMemberSnapshot2026,
  MigrationSnapshot2026,
  MigrationSnapshotMovement,
  MigrationSnapshotObligation,
} from './migrationSnapshot2026'
import { getLegacyMemberOverride2026 } from './legacyMigration2026Overrides'

export type MigrationDryRunCollection =
  | 'socios'
  | 'obligaciones'
  | 'pagos'
  | 'aplicaciones_pago'
  | 'excepciones_cobro'
  | 'categoria_historial'

export interface MigrationDryRunDocument {
  collection: MigrationDryRunCollection
  id: string
  memberNumber: string
  memberName: string
  sourceRow: number
  summary: string
  data: Record<string, unknown>
}

export interface MigrationDryRunMember {
  row: number
  numero: string
  nombre: string
  socioId: string
  estado: 'ACTIVO' | 'INACTIVO'
  categoria: 'SOLTERO' | 'CASADO' | 'REVISAR'
  obligaciones2026: number
  obligaciones2025: number
  pagos: number
  aplicaciones: number
  excepciones: number
  cambiosCategoria: number
  deuda2026Plan: number
  deuda2025Plan: number
  notes: string[]
}

export interface MigrationDryRun2026 {
  planVersion: '3C-DRY-RUN-V1'
  status: 'LISTO' | 'BLOQUEADO'
  fingerprint: string
  sourceSpreadsheetId: string
  sourceSheet: string
  blockers: string[]
  warnings: string[]
  totals: {
    socios: number
    obligaciones2026: number
    obligaciones2025: number
    obligacionesExentas: number
    pagos: number
    aplicaciones: number
    excepciones: number
    cambiosCategoria: number
    documentos: number
    lotesEstimados: number
    deuda2026: number
    deuda2025: number
    deudaTotal: number
    importePagos: number
    pagosHistoricosRehidratados: number
  }
  collectionCounts: Record<MigrationDryRunCollection, number>
  members: MigrationDryRunMember[]
  documents: MigrationDryRunDocument[]
}

const PLAN_VERSION = '3C-DRY-RUN-V1' as const
const EPSILON = 0.5
const WRITE_BATCH_SAFE_SIZE = 400

function slug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sin-id'
}

function memberKey(numero: string, row: number) {
  const numeric = numero.match(/^\d+$/) ? numero.padStart(3, '0') : slug(numero)
  return `${numeric}-r${row}`
}

function nextMonth(periodo: string) {
  const match = periodo.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  const date = new Date(Date.UTC(year, month, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthlyCategory(amount: number, preview: MigrationPreview, fallback: 'SOLTERO' | 'CASADO' | 'REVISAR') {
  if (preview.tariffs.aporteSoltero !== null && Math.abs(amount - preview.tariffs.aporteSoltero) <= EPSILON) return 'SOLTERO'
  if (preview.tariffs.aporteCasado !== null && Math.abs(amount - preview.tariffs.aporteCasado) <= EPSILON) return 'CASADO'
  return fallback
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

function simpleHash(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function docId(prefix: string, key: string, suffix: string) {
  return `m26-${prefix}-${key}-${slug(suffix)}`
}

function migrationMeta(preview: MigrationPreview, member: MigrationPreview['members'][number], sourceCell?: string) {
  return {
    planVersion: PLAN_VERSION,
    source: 'LISTA_MIEMBROS_2026',
    spreadsheetId: preview.spreadsheetId,
    sheet: preview.sheetName,
    row: member.row,
    numeroSocio: member.numero,
    sourceCell: sourceCell ?? null,
  }
}

function obligationId(key: string, obligation: MigrationSnapshotObligation) {
  return docId('obl', key, obligation.key)
}

function movementPaymentId(key: string, movement: MigrationSnapshotMovement, index: number) {
  const source = movement.sourceCell ?? movement.targetKey ?? `${movement.kind}-${index}`
  return docId('pag', key, source)
}

function applicationId(key: string, paymentId: string, obligationIdValue: string) {
  return docId('apl', key, `${paymentId}-${obligationIdValue}`)
}

function pushDocument(
  documents: MigrationDryRunDocument[],
  member: MigrationPreview['members'][number],
  collection: MigrationDryRunCollection,
  id: string,
  summary: string,
  data: Record<string, unknown>,
) {
  documents.push({
    collection,
    id,
    memberNumber: member.numero,
    memberName: member.nombre,
    sourceRow: member.row,
    summary,
    data,
  })
}

function buildMemberPlan(
  preview: MigrationPreview,
  member: MigrationPreview['members'][number],
  snapshot: MigrationMemberSnapshot2026,
  documents: MigrationDryRunDocument[],
  blockers: string[],
  warnings: string[],
): MigrationDryRunMember {
  const key = memberKey(member.numero, member.row)
  const socioId = `m26-socio-${key}`
  const notes: string[] = []
  const obligationsBySnapshotKey = new Map<string, string>()
  let obligaciones2026 = 0
  let obligaciones2025 = 0
  let pagos = 0
  let aplicaciones = 0
  let excepciones = 0
  let cambiosCategoria = 0
  let deuda2026Plan = 0
  let deuda2025Plan = 0

  if (member.categoriaPropuesta === 'REVISAR') {
    blockers.push(`${member.nombre}: condición actual sin resolver.`)
  }

  pushDocument(documents, member, 'socios', socioId, `${member.estadoPropuesto} · ${member.categoriaPropuesta}`, {
    nombre: member.nombre,
    numeroSocio: member.numero,
    rangoLegacy: member.rango || null,
    categoria: member.categoriaPropuesta,
    estado: member.estadoPropuesto,
    fechaIngreso: member.fechaIngreso || null,
    fechaBaja: member.fechaBaja ?? null,
    origen: 'MIGRACION_2026',
    migration: migrationMeta(preview, member),
  })

  for (const obligation of snapshot.obligaciones) {
    if (obligation.kind === 'AJUSTE_LEGACY') {
      blockers.push(`${member.nombre}: existe un ajuste técnico de cargo que no debe importarse como obligación real.`)
      continue
    }
    const id = obligationId(key, obligation)
    obligationsBySnapshotKey.set(obligation.key, id)
    obligaciones2026 += 1
    const categoriaAplicada = obligation.kind === 'CUOTA_MENSUAL'
      ? monthlyCategory(obligation.importe, preview, member.categoriaPropuesta)
      : null
    const isExempt = obligation.estado === 'EXENTA'
    if (!isExempt) deuda2026Plan += obligation.importe

    pushDocument(documents, member, 'obligaciones', id, `${obligation.concepto} · ${obligation.estado}`, {
      socioId,
      concepto: obligation.concepto,
      periodo: obligation.periodo,
      importe: obligation.importe,
      estado: obligation.estado,
      categoriaAplicada,
      origen: 'MIGRACION_2026',
      sourceNote: obligation.sourceNote ?? null,
      migration: migrationMeta(preview, member, obligation.sourceCell),
    })
  }

  const excludedMovements = snapshot.movimientos.filter((movement) => movement.kind === 'EXCLUIDO')
  const excludedPeriods = new Set<string>()
  for (const movement of excludedMovements) {
    if (!movement.periodoObligacion || movement.importe <= EPSILON) continue
    const historicalKey = `row-${member.row}-historico-${movement.periodoObligacion}`
    if (excludedPeriods.has(movement.periodoObligacion)) {
      blockers.push(`${member.nombre}: más de un cobro histórico excluido para ${movement.periodoObligacion}.`)
      continue
    }
    excludedPeriods.add(movement.periodoObligacion)
    const obligation: MigrationSnapshotObligation = {
      key: historicalKey,
      kind: 'CUOTA_MENSUAL',
      concepto: `Cuota social histórica ${movement.periodoObligacion}`,
      periodo: movement.periodoObligacion,
      importe: movement.importe,
      estado: 'PAGADA',
      sourceCell: movement.sourceCell,
      sourceNote: 'Cuota cobrada bajo la condición histórica previa; se rehidrata en 3C para conservar el historial sin alterar el saldo conciliado.',
    }
    const id = obligationId(key, obligation)
    obligationsBySnapshotKey.set(historicalKey, id)
    obligaciones2026 += 1
    deuda2026Plan += movement.importe
    pushDocument(documents, member, 'obligaciones', id, `${obligation.concepto} · PAGADA`, {
      socioId,
      concepto: obligation.concepto,
      periodo: obligation.periodo,
      importe: obligation.importe,
      estado: 'PAGADA',
      categoriaAplicada: monthlyCategory(obligation.importe, preview, member.categoriaPropuesta),
      origen: 'MIGRACION_2026_HISTORICO',
      migration: migrationMeta(preview, member, movement.sourceCell),
    })
  }

  snapshot.movimientos.forEach((movement, index) => {
    if (movement.kind === 'EXONERACION') return
    if (movement.kind === 'AJUSTE_PAGO_LEGACY') {
      blockers.push(`${member.nombre}: existe un ajuste técnico de pago que no debe convertirse en cobro real.`)
      return
    }
    if (movement.importe <= EPSILON) return

    let targetKey = movement.targetKey
    if (movement.kind === 'EXCLUIDO' && movement.periodoObligacion) {
      targetKey = `row-${member.row}-historico-${movement.periodoObligacion}`
    }
    if (!targetKey) {
      blockers.push(`${member.nombre}: cobro de ${movement.importe} sin obligación destino.`)
      return
    }
    const targetObligationId = obligationsBySnapshotKey.get(targetKey)
    if (!targetObligationId) {
      blockers.push(`${member.nombre}: no se encontró la obligación destino para ${movement.sourceCell ?? targetKey}.`)
      return
    }

    const paymentId = movementPaymentId(key, movement, index)
    const fechaPrecision = movement.periodoCobro ? 'MES' : 'DESCONOCIDA'
    pushDocument(documents, member, 'pagos', paymentId, `Pago ${movement.sourceCell ?? ''} · ${movement.importe}`, {
      socioId,
      importe: movement.importe,
      estado: 'REGISTRADO',
      fecha: movement.periodoCobro ?? '',
      periodoCobro: movement.periodoCobro ?? null,
      fechaPrecision,
      medioPago: 'MIGRACION_LEGACY',
      referencia: movement.sourceCell ? `Lista de miembros 2026 ${movement.sourceCell}` : 'Lista de miembros 2026',
      origen: 'MIGRACION_2026',
      migration: migrationMeta(preview, member, movement.sourceCell),
    })
    pagos += 1

    const appId = applicationId(key, paymentId, targetObligationId)
    pushDocument(documents, member, 'aplicaciones_pago', appId, `Aplicación ${movement.importe}`, {
      socioId,
      pagoId: paymentId,
      obligacionId: targetObligationId,
      importe: movement.importe,
      origen: 'MIGRACION_2026',
      migration: migrationMeta(preview, member, movement.sourceCell),
    })
    aplicaciones += 1
    deuda2026Plan -= movement.importe
  })

  if ((member.deuda2025 ?? 0) > EPSILON) {
    const id = docId('obl', key, 'deuda-2025')
    const amount = member.deuda2025 ?? 0
    obligaciones2025 += 1
    deuda2025Plan += amount
    pushDocument(documents, member, 'obligaciones', id, `Saldo pendiente 2025 · ${amount}`, {
      socioId,
      concepto: 'Saldo pendiente migrado 2025',
      periodo: '2025-LEGACY',
      importe: amount,
      estado: 'PENDIENTE',
      origen: 'MIGRACION_SALDO_2025',
      migration: migrationMeta(preview, member, `W${member.row}`),
    })
  }

  const override = getLegacyMemberOverride2026(member.nombre)
  if (override?.exoneracionTotal) {
    const id = docId('exc', key, 'exento-total-2026')
    pushDocument(documents, member, 'excepciones_cobro', id, 'Exención total 2026', {
      socioId,
      tipo: 'EXENTO',
      ambito: 'TODOS',
      periodoDesde: '2026-01',
      periodoHasta: '2026-12',
      motivo: override.motivoExoneracion ?? 'Exoneración total validada para 2026.',
      activa: true,
      origen: 'MIGRACION_2026',
      migration: migrationMeta(preview, member),
    })
    excepciones += 1
    notes.push('Exoneración total limitada a 2026; no se presume vigencia permanente.')
  }

  if (excludedMovements.length > 0) {
    const solteroTariff = preview.tariffs.aporteSoltero
    const allMatchSoltero = solteroTariff !== null
      && excludedMovements.every((movement) => Math.abs(movement.importe - solteroTariff) <= EPSILON)
    const periods = excludedMovements
      .map((movement) => movement.periodoObligacion)
      .filter((period): period is string => Boolean(period))
      .sort()
    const lastHistoricalPeriod = periods.at(-1)
    const vigenteDesde = lastHistoricalPeriod ? nextMonth(lastHistoricalPeriod) : null

    if (member.categoriaPropuesta === 'CASADO' && allMatchSoltero && vigenteDesde) {
      const id = docId('cat', key, `soltero-casado-${vigenteDesde}`)
      pushDocument(documents, member, 'categoria_historial', id, `SOLTERO → CASADO desde ${vigenteDesde}`, {
        socioId,
        categoriaAnterior: 'SOLTERO',
        categoriaNueva: 'CASADO',
        vigenteDesde,
        origen: 'MIGRACION_2026',
        migration: migrationMeta(preview, member),
      })
      cambiosCategoria += 1
      notes.push(`Cambio histórico SOLTERO → CASADO reconstruido desde ${vigenteDesde}.`)
    } else {
      blockers.push(`${member.nombre}: existen cobros históricos excluidos que no pudieron convertirse en un cambio de categoría determinístico.`)
    }
  }

  if (Math.abs(deuda2026Plan - snapshot.deudaObjetivoMigracion) > EPSILON) {
    blockers.push(`${member.nombre}: el plan 3C deja deuda 2026 de ${Math.round(deuda2026Plan)}, pero el objetivo 3B es ${Math.round(snapshot.deudaObjetivoMigracion)}.`)
  }

  if (snapshot.estado === 'REVISAR') {
    blockers.push(`${member.nombre}: 3B todavía está en estado REVISAR.`)
  }

  if (snapshot.ajusteCargoLegacy > EPSILON || snapshot.ajustePagoLegacy > EPSILON) {
    blockers.push(`${member.nombre}: 3B todavía contiene ajustes técnicos legacy.`)
  }

  return {
    row: member.row,
    numero: member.numero,
    nombre: member.nombre,
    socioId,
    estado: member.estadoPropuesto,
    categoria: member.categoriaPropuesta,
    obligaciones2026,
    obligaciones2025,
    pagos,
    aplicaciones,
    excepciones,
    cambiosCategoria,
    deuda2026Plan,
    deuda2025Plan,
    notes,
  }
}

export function buildMigrationDryRun2026(
  preview: MigrationPreview,
  snapshot: MigrationSnapshot2026,
): MigrationDryRun2026 {
  const blockers: string[] = []
  const warnings = [
    'Este dry-run no escribe en Firestore ni modifica Google Sheets.',
    'No crea usuarios de Firebase Authentication ni documentos users; E:F permanecen fuera de la migración.',
    'Los pagos con precisión MES conservan solo el mes de cobro demostrado por el color; no se inventa un día exacto.',
    'Los cobros de membresía/ingreso sin mes demostrable quedan con fecha vacía y precisión DESCONOCIDA.',
    'La deuda 2025 se conserva como un saldo legacy agregado por socio, sin inventar meses ni pagos de 2025.',
  ]
  const documents: MigrationDryRunDocument[] = []

  const globalDifference = snapshot.totals.deudaReconstruida - snapshot.totals.deudaObjetivoMigracion
  if (Math.abs(globalDifference) > EPSILON) blockers.push(`La conciliación 3B tiene diferencia global de ${Math.round(globalDifference)}.`)
  if (snapshot.totals.revisar > 0) blockers.push(`Hay ${snapshot.totals.revisar} fila(s) REVISAR en 3B.`)
  if (snapshot.totals.ajustesCargo > EPSILON) blockers.push(`Quedan ajustes técnicos de cargo por ${Math.round(snapshot.totals.ajustesCargo)}.`)
  if (snapshot.totals.ajustesPago > EPSILON) blockers.push(`Quedan ajustes técnicos de pago por ${Math.round(snapshot.totals.ajustesPago)}.`)
  if (preview.members.length !== snapshot.members.length) blockers.push('3A y 3B no contienen la misma cantidad de socios.')

  const snapshotByRow = new Map(snapshot.members.map((member) => [member.row, member]))
  const members: MigrationDryRunMember[] = []
  for (const member of preview.members) {
    const memberSnapshot = snapshotByRow.get(member.row)
    if (!memberSnapshot) {
      blockers.push(`${member.nombre}: falta snapshot 3B.`)
      continue
    }
    members.push(buildMemberPlan(preview, member, memberSnapshot, documents, blockers, warnings))
  }

  const duplicateIds = new Map<string, number>()
  for (const item of documents) {
    const key = `${item.collection}/${item.id}`
    duplicateIds.set(key, (duplicateIds.get(key) ?? 0) + 1)
  }
  for (const [key, count] of duplicateIds) {
    if (count > 1) blockers.push(`ID determinístico duplicado (${count}×): ${key}.`)
  }

  const collectionCounts: Record<MigrationDryRunCollection, number> = {
    socios: 0,
    obligaciones: 0,
    pagos: 0,
    aplicaciones_pago: 0,
    excepciones_cobro: 0,
    categoria_historial: 0,
  }
  documents.forEach((item) => { collectionCounts[item.collection] += 1 })

  const debt2026 = members.reduce((sum, member) => sum + member.deuda2026Plan, 0)
  const debt2025 = members.reduce((sum, member) => sum + member.deuda2025Plan, 0)
  if (Math.abs(debt2026 - snapshot.totals.deudaObjetivoMigracion) > EPSILON) {
    blockers.push(`El plan completo 3C produce deuda 2026 de ${Math.round(debt2026)} y 3B exige ${Math.round(snapshot.totals.deudaObjetivoMigracion)}.`)
  }
  if (Math.abs(debt2025 - preview.totalDeuda2025) > EPSILON) {
    blockers.push(`El plan completo 3C produce deuda 2025 de ${Math.round(debt2025)} y la hoja registra ${Math.round(preview.totalDeuda2025)}.`)
  }

  const obligationDocs = documents.filter((item) => item.collection === 'obligaciones')
  const obligations2025 = obligationDocs.filter((item) => item.data.periodo === '2025-LEGACY').length
  const obligationsExempt = obligationDocs.filter((item) => item.data.estado === 'EXENTA').length
  const paymentDocs = documents.filter((item) => item.collection === 'pagos')
  const importePagos = paymentDocs.reduce((sum, item) => sum + Number(item.data.importe ?? 0), 0)
  const historicalRehydrated = documents
    .filter((item) => item.collection === 'obligaciones' && item.data.origen === 'MIGRACION_2026_HISTORICO')
    .reduce((sum, item) => sum + Number(item.data.importe ?? 0), 0)

  const fingerprintSource = documents
    .map((item) => `${item.collection}/${item.id}:${stableStringify(item.data)}`)
    .sort()
    .join('|')
  const fingerprint = `m26-${simpleHash(fingerprintSource)}-${documents.length}`

  return {
    planVersion: PLAN_VERSION,
    status: blockers.length === 0 ? 'LISTO' : 'BLOQUEADO',
    fingerprint,
    sourceSpreadsheetId: preview.spreadsheetId,
    sourceSheet: preview.sheetName,
    blockers: [...new Set(blockers)],
    warnings,
    totals: {
      socios: collectionCounts.socios,
      obligaciones2026: collectionCounts.obligaciones - obligations2025,
      obligaciones2025: obligations2025,
      obligacionesExentas: obligationsExempt,
      pagos: collectionCounts.pagos,
      aplicaciones: collectionCounts.aplicaciones_pago,
      excepciones: collectionCounts.excepciones_cobro,
      cambiosCategoria: collectionCounts.categoria_historial,
      documentos: documents.length,
      lotesEstimados: Math.ceil(documents.length / WRITE_BATCH_SAFE_SIZE),
      deuda2026: debt2026,
      deuda2025: debt2025,
      deudaTotal: debt2026 + debt2025,
      importePagos,
      pagosHistoricosRehidratados: historicalRehydrated,
    },
    collectionCounts,
    members,
    documents,
  }
}
