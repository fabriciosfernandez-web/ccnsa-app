import type {
  MigrationMemberPreview,
  MigrationPreview,
  MigrationTariffConfig,
} from './migration2026'

export type SnapshotObligationKind = 'CUOTA_MENSUAL' | 'MEMBRESIA' | 'APORTE_INGRESO' | 'AJUSTE_LEGACY'
export type SnapshotObligationState = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'EXENTA' | 'REVISAR'
export type SnapshotMovementKind = 'PAGO' | 'EXONERACION' | 'EXCLUIDO' | 'AJUSTE_PAGO_LEGACY'

export interface MigrationSnapshotObligation {
  key: string
  kind: SnapshotObligationKind
  concepto: string
  periodo: string
  importe: number
  estado: SnapshotObligationState
  sourceCell?: string
  sourceNote?: string
}

export interface MigrationSnapshotMovement {
  kind: SnapshotMovementKind
  importe: number
  periodoObligacion?: string
  periodoCobro?: string
  targetKey?: string
  sourceCell?: string
  confidence: 'ALTA' | 'MEDIA' | 'BAJA'
  note?: string
}

export interface MigrationMemberSnapshot2026 {
  row: number
  nombre: string
  numero: string
  formulaDeuda2026: string
  deudaFuente: number
  cobradoHoja: number
  ajustesExcluidos: number
  cobrosElegibles: number
  cargosObjetivo: number
  obligaciones: MigrationSnapshotObligation[]
  movimientos: MigrationSnapshotMovement[]
  totalCargosNormales: number
  totalPagosElegibles: number
  totalExonerado: number
  deudaReconstruida: number
  diferencia: number
  ajusteCargoLegacy: number
  ajustePagoLegacy: number
  unknownColorCount: number
  estado: 'LIMPIO' | 'CONCILIADO_CON_AJUSTES' | 'REVISAR'
  observaciones: string[]
}

export interface MigrationSnapshot2026 {
  members: MigrationMemberSnapshot2026[]
  totals: {
    miembros: number
    limpios: number
    conciliadosConAjustes: number
    revisar: number
    deudaFuente: number
    deudaReconstruida: number
    pagosElegibles: number
    cargosNormales: number
    exonerado: number
    ajustesCargo: number
    ajustesPago: number
  }
}

const EPSILON = 0.5
const MONTH_COLUMNS = ['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'] as const
const MONTH_LABELS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

function monthPeriod(month: number) {
  return `2026-${String(month).padStart(2, '0')}`
}

function formulaMonthlyRule(formula: string, tariffs: MigrationTariffConfig) {
  const normalized = formula.replace(/\s+/g, '').toUpperCase()
  const match = normalized.match(/(Y3|Z3|Y4)\*(\d+)/)
  if (!match) return null
  const rate = match[1] === 'Y3'
    ? tariffs.aporteSoltero
    : match[1] === 'Z3'
      ? tariffs.aporteCasado
      : 18500
  if (rate === null) return null
  return { rate, count: Number(match[2]), reference: match[1] }
}

function includesFormulaReference(formula: string, cell: string) {
  return formula.replace(/\s+/g, '').toUpperCase().includes(cell.toUpperCase())
}

function joinMonth2026(member: MigrationMemberPreview) {
  const match = member.fechaIngreso.match(/^2026-(\d{2})/)
  if (!match) return 1
  const month = Number(match[1])
  return month >= 1 && month <= 12 ? month : 1
}

function excludedMonths(member: MigrationMemberPreview) {
  return new Set(member.ajustesExcluidos.map((item) => item.month))
}

function findMonth(member: MigrationMemberPreview, month: number) {
  return member.meses.find((item) => item.month === month)
}

function isRedExemption(member: MigrationMemberPreview, month: number) {
  return findMonth(member, month)?.legacyMeaning.kind === 'EXONERACION'
}

function obligationState(importe: number, paid: number, exenta = false): SnapshotObligationState {
  if (exenta) return 'EXENTA'
  if (paid <= EPSILON) return 'PENDIENTE'
  if (paid + EPSILON >= importe) return 'PAGADA'
  return 'PARCIAL'
}

function buildMemberSnapshot(member: MigrationMemberPreview, tariffs: MigrationTariffConfig): MigrationMemberSnapshot2026 {
  const formula = member.deuda2026Formula || ''
  const deudaFuente = member.deuda2026 ?? 0
  const cobradoHoja = member.sumatoriaHoja ?? 0
  const ajustesExcluidos = member.totalAjustesExcluidos
  const cobrosElegibles = Math.max(0, cobradoHoja - ajustesExcluidos)
  const cargosObjetivo = Math.max(0, deudaFuente + cobrosElegibles)
  const obligaciones: MigrationSnapshotObligation[] = []
  const movimientos: MigrationSnapshotMovement[] = []
  const observaciones: string[] = []
  const excluded = excludedMonths(member)
  const monthlyRule = formulaMonthlyRule(formula, tariffs)

  let startMonth = joinMonth2026(member)
  if (member.ajustesExcluidos.length > 0) {
    startMonth = Math.max(startMonth, Math.max(...member.ajustesExcluidos.map((item) => item.month)) + 1)
  }

  const monthlyObligationByMonth = new Map<number, MigrationSnapshotObligation>()
  if (monthlyRule && monthlyRule.count > 0) {
    let payableRemaining = monthlyRule.count
    let month = startMonth
    while (payableRemaining > 0 && month <= 12) {
      const exenta = isRedExemption(member, month)
      const key = `row-${member.row}-cuota-${monthPeriod(month)}`
      const obligation: MigrationSnapshotObligation = {
        key,
        kind: 'CUOTA_MENSUAL',
        concepto: `Cuota social ${MONTH_LABELS[month - 1]} 2026`,
        periodo: monthPeriod(month),
        importe: monthlyRule.rate,
        estado: exenta ? 'EXENTA' : 'PENDIENTE',
        sourceCell: `${MONTH_COLUMNS[month - 1]}${member.row}`,
        sourceNote: `Tarifa inferida de ${monthlyRule.reference} en la fórmula de deuda.`,
      }
      obligaciones.push(obligation)
      monthlyObligationByMonth.set(month, obligation)
      if (exenta) {
        movimientos.push({
          kind: 'EXONERACION',
          importe: monthlyRule.rate,
          periodoObligacion: obligation.periodo,
          targetKey: key,
          sourceCell: obligation.sourceCell,
          confidence: 'ALTA',
          note: month === 7
            ? 'Exoneración por asistencia al retiro de silencio anual 2026.'
            : 'Exoneración indicada por color rojo; revisar motivo.',
        })
      } else {
        payableRemaining -= 1
      }
      month += 1
    }
    if (payableRemaining > 0) {
      observaciones.push(`La fórmula exige ${monthlyRule.count} cuota(s) pagables y el calendario 2026 no alcanzó para distribuir ${payableRemaining}.`)
    }

    // Si existe una exoneración roja fuera del horizonte generado, conservarla como obligación EXENTA.
    for (const monthPreview of member.meses) {
      if (monthPreview.legacyMeaning.kind !== 'EXONERACION' || monthlyObligationByMonth.has(monthPreview.month)) continue
      const key = `row-${member.row}-cuota-${monthPreview.periodo}`
      const obligation: MigrationSnapshotObligation = {
        key,
        kind: 'CUOTA_MENSUAL',
        concepto: `Cuota social ${MONTH_LABELS[monthPreview.month - 1]} 2026`,
        periodo: monthPreview.periodo,
        importe: monthlyRule.rate,
        estado: 'EXENTA',
        sourceCell: `${MONTH_COLUMNS[monthPreview.month - 1]}${member.row}`,
        sourceNote: 'Exoneración legacy conservada fuera del tramo pagable inferido.',
      }
      obligaciones.push(obligation)
      monthlyObligationByMonth.set(monthPreview.month, obligation)
      movimientos.push({
        kind: 'EXONERACION',
        importe: monthlyRule.rate,
        periodoObligacion: monthPreview.periodo,
        targetKey: key,
        sourceCell: obligation.sourceCell,
        confidence: 'ALTA',
        note: monthPreview.month === 7
          ? 'Exoneración por asistencia al retiro de silencio anual 2026.'
          : 'Exoneración indicada por color rojo; revisar motivo.',
      })
    }
  } else if (formula && formula !== '0' && cargosObjetivo > EPSILON) {
    observaciones.push('No se pudo inferir una regla mensual Y3/Z3/Y4 desde la fórmula de deuda.')
  }

  if (includesFormulaReference(formula, 'Y6')) {
    const amount = tariffs.membresia ?? 35000
    obligaciones.push({
      key: `row-${member.row}-membresia-2026`,
      kind: 'MEMBRESIA',
      concepto: 'Membresía 2026',
      periodo: '2026-ANUAL',
      importe: amount,
      estado: 'PENDIENTE',
      sourceCell: `H${member.row}`,
    })
  }

  if (includesFormulaReference(formula, 'Z6')) {
    const amount = tariffs.ingreso ?? 40000
    obligaciones.push({
      key: `row-${member.row}-ingreso`,
      kind: 'APORTE_INGRESO',
      concepto: 'Aporte de ingreso',
      periodo: member.fechaIngreso.slice(0, 7) || '2026',
      importe: amount,
      estado: 'PENDIENTE',
      sourceCell: `G${member.row}`,
    })
  }

  // Aplicaciones mensuales: la columna identifica la obligación y el color el mes de cobro.
  for (const monthPreview of member.meses) {
    if ((monthPreview.amount ?? 0) <= EPSILON) continue
    const cell = `${MONTH_COLUMNS[monthPreview.month - 1]}${member.row}`
    if (excluded.has(monthPreview.month)) {
      movimientos.push({
        kind: 'EXCLUIDO',
        importe: monthPreview.amount ?? 0,
        periodoObligacion: monthPreview.periodo,
        periodoCobro: monthPreview.legacyMeaning.kind === 'PAGO' ? monthPreview.legacyMeaning.periodoCobro : undefined,
        sourceCell: cell,
        confidence: 'ALTA',
        note: 'La propia fórmula de Deuda 2026 suma nuevamente esta celda; no forma parte del saldo exigible reconstruido.',
      })
      continue
    }

    const obligation = monthlyObligationByMonth.get(monthPreview.month)
    if (monthPreview.legacyMeaning.kind === 'PAGO') {
      if (!obligation || obligation.estado === 'EXENTA') {
        movimientos.push({
          kind: 'AJUSTE_PAGO_LEGACY',
          importe: monthPreview.amount ?? 0,
          periodoObligacion: monthPreview.periodo,
          periodoCobro: monthPreview.legacyMeaning.periodoCobro,
          sourceCell: cell,
          confidence: monthPreview.legacyMeaning.confidence,
          note: 'Cobro coloreado sin obligación mensual normal compatible; requiere conciliación.',
        })
        continue
      }
      const applied = Math.min(obligation.importe, monthPreview.amount ?? 0)
      movimientos.push({
        kind: 'PAGO',
        importe: applied,
        periodoObligacion: obligation.periodo,
        periodoCobro: monthPreview.legacyMeaning.periodoCobro,
        targetKey: obligation.key,
        sourceCell: cell,
        confidence: monthPreview.legacyMeaning.confidence,
        note: 'Pago histórico: mes de obligación por columna y mes de cobro por color.',
      })
      obligation.estado = obligationState(obligation.importe, applied)
      if ((monthPreview.amount ?? 0) > applied + EPSILON) {
        movimientos.push({
          kind: 'AJUSTE_PAGO_LEGACY',
          importe: (monthPreview.amount ?? 0) - applied,
          periodoObligacion: obligation.periodo,
          periodoCobro: monthPreview.legacyMeaning.periodoCobro,
          sourceCell: cell,
          confidence: 'BAJA',
          note: 'El valor de la celda excede el importe nominal de la obligación inferida.',
        })
      }
    }
  }

  // Membresía y aporte de ingreso están pagados en columnas propias, pero la hoja no conserva su mes exacto de cobro.
  const directMappings: Array<{ kind: SnapshotObligationKind; amount: number | null; cell: string }> = [
    { kind: 'MEMBRESIA', amount: member.membresia, cell: `H${member.row}` },
    { kind: 'APORTE_INGRESO', amount: member.aporteIngreso, cell: `G${member.row}` },
  ]
  for (const mapping of directMappings) {
    const obligation = obligaciones.find((item) => item.kind === mapping.kind)
    if (!obligation || (mapping.amount ?? 0) <= EPSILON) continue
    const applied = Math.min(obligation.importe, mapping.amount ?? 0)
    movimientos.push({
      kind: 'PAGO',
      importe: applied,
      periodoObligacion: obligation.periodo,
      targetKey: obligation.key,
      sourceCell: mapping.cell,
      confidence: 'MEDIA',
      note: 'Pago confirmado por importe en la columna legacy; la fuente no conserva el mes exacto de cobro.',
    })
    obligation.estado = obligationState(obligation.importe, applied)
    if ((mapping.amount ?? 0) > applied + EPSILON) {
      movimientos.push({
        kind: 'AJUSTE_PAGO_LEGACY',
        importe: (mapping.amount ?? 0) - applied,
        sourceCell: mapping.cell,
        confidence: 'BAJA',
        note: 'El importe legacy excede el cargo nominal inferido.',
      })
    }
  }

  const normalChargesBeforeAdjustment = obligaciones
    .filter((item) => item.estado !== 'EXENTA')
    .reduce((sum, item) => sum + item.importe, 0)
  let ajusteCargoLegacy = cargosObjetivo - normalChargesBeforeAdjustment
  if (Math.abs(ajusteCargoLegacy) <= EPSILON) ajusteCargoLegacy = 0
  if (ajusteCargoLegacy > 0) {
    obligaciones.push({
      key: `row-${member.row}-ajuste-cargo`,
      kind: 'AJUSTE_LEGACY',
      concepto: 'Ajuste técnico de migración 2026',
      periodo: '2026-LEGACY',
      importe: ajusteCargoLegacy,
      estado: 'REVISAR',
      sourceCell: `V${member.row}`,
      sourceNote: 'Completa el total exigible implícito en la fórmula legacy sin inventar meses o conceptos.',
    })
    observaciones.push(`Se requiere un ajuste técnico de cargo de Gs. ${Math.round(ajusteCargoLegacy).toLocaleString('es-PY')}.`)
  } else if (ajusteCargoLegacy < 0) {
    observaciones.push(`Las obligaciones inferidas exceden el total exigible legacy en Gs. ${Math.round(Math.abs(ajusteCargoLegacy)).toLocaleString('es-PY')}.`)
  }

  const structuredPayments = movimientos
    .filter((item) => item.kind === 'PAGO')
    .reduce((sum, item) => sum + item.importe, 0)
  let ajustePagoLegacy = cobrosElegibles - structuredPayments
  if (Math.abs(ajustePagoLegacy) <= EPSILON) ajustePagoLegacy = 0
  if (ajustePagoLegacy > 0) {
    movimientos.push({
      kind: 'AJUSTE_PAGO_LEGACY',
      importe: ajustePagoLegacy,
      confidence: 'BAJA',
      note: 'Cobro elegible contenido en la sumatoria legacy que no pudo asignarse de forma determinística a un concepto sin inventar información.',
    })
    observaciones.push(`Quedan Gs. ${Math.round(ajustePagoLegacy).toLocaleString('es-PY')} de cobros legacy sin asignación determinística.`)
  } else if (ajustePagoLegacy < 0) {
    observaciones.push(`Los pagos estructurados exceden los cobros elegibles legacy en Gs. ${Math.round(Math.abs(ajustePagoLegacy)).toLocaleString('es-PY')}.`)
  }

  const totalCargosNormales = obligaciones
    .filter((item) => item.estado !== 'EXENTA')
    .reduce((sum, item) => sum + item.importe, 0)
  const totalPagosElegibles = movimientos
    .filter((item) => item.kind === 'PAGO' || item.kind === 'AJUSTE_PAGO_LEGACY')
    .reduce((sum, item) => sum + item.importe, 0)
  const totalExonerado = obligaciones
    .filter((item) => item.estado === 'EXENTA')
    .reduce((sum, item) => sum + item.importe, 0)
  const deudaReconstruida = totalCargosNormales - totalPagosElegibles
  const diferencia = deudaReconstruida - deudaFuente
  const unknownColorCount = member.meses.filter((item) =>
    (item.amount ?? 0) > EPSILON && item.legacyMeaning.kind === 'DESCONOCIDO',
  ).length

  if (unknownColorCount > 0) observaciones.push(`${unknownColorCount} celda(s) con importe tienen color legacy no interpretado.`)
  if (Math.abs(diferencia) > EPSILON) observaciones.push(`La deuda reconstruida difiere de la fuente en Gs. ${Math.round(diferencia).toLocaleString('es-PY')}.`)

  const hasNegativeAdjustment = ajusteCargoLegacy < -EPSILON || ajustePagoLegacy < -EPSILON
  const hasUnresolved = unknownColorCount > 0 || hasNegativeAdjustment || Math.abs(diferencia) > EPSILON
  const hasTechnicalAdjustments = ajusteCargoLegacy > EPSILON || ajustePagoLegacy > EPSILON
  const estado: MigrationMemberSnapshot2026['estado'] = hasUnresolved
    ? 'REVISAR'
    : hasTechnicalAdjustments
      ? 'CONCILIADO_CON_AJUSTES'
      : 'LIMPIO'

  return {
    row: member.row,
    nombre: member.nombre,
    numero: member.numero,
    formulaDeuda2026: formula,
    deudaFuente,
    cobradoHoja,
    ajustesExcluidos,
    cobrosElegibles,
    cargosObjetivo,
    obligaciones,
    movimientos,
    totalCargosNormales,
    totalPagosElegibles,
    totalExonerado,
    deudaReconstruida,
    diferencia,
    ajusteCargoLegacy,
    ajustePagoLegacy,
    unknownColorCount,
    estado,
    observaciones,
  }
}

export function buildMigrationSnapshot2026(preview: MigrationPreview): MigrationSnapshot2026 {
  const members = preview.members.map((member) => buildMemberSnapshot(member, preview.tariffs))
  return {
    members,
    totals: {
      miembros: members.length,
      limpios: members.filter((item) => item.estado === 'LIMPIO').length,
      conciliadosConAjustes: members.filter((item) => item.estado === 'CONCILIADO_CON_AJUSTES').length,
      revisar: members.filter((item) => item.estado === 'REVISAR').length,
      deudaFuente: members.reduce((sum, item) => sum + item.deudaFuente, 0),
      deudaReconstruida: members.reduce((sum, item) => sum + item.deudaReconstruida, 0),
      pagosElegibles: members.reduce((sum, item) => sum + item.totalPagosElegibles, 0),
      cargosNormales: members.reduce((sum, item) => sum + item.totalCargosNormales, 0),
      exonerado: members.reduce((sum, item) => sum + item.totalExonerado, 0),
      ajustesCargo: members.reduce((sum, item) => sum + Math.max(0, item.ajusteCargoLegacy), 0),
      ajustesPago: members.reduce((sum, item) => sum + Math.max(0, item.ajustePagoLegacy), 0),
    },
  }
}
