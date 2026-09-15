import {
  GoogleAuthProvider,
  reauthenticateWithPopup,
  type User,
} from 'firebase/auth'
import {
  extractSpreadsheetId,
  type MigrationMemberPreview,
  type MigrationPreview,
  type MigrationTariffConfig,
} from './migration2026'
import { interpretLegacyColor2026, type LegacyColorMeaning } from './legacyMigration2026Colors'

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
  deudaObjetivoMigracion: number
  ajusteValidadoBaja: number
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
    deudaObjetivoMigracion: number
    deudaReconstruida: number
    ajustesValidadosBaja: number
    pagosElegibles: number
    cargosNormales: number
    exonerado: number
    ajustesCargo: number
    ajustesPago: number
  }
}

type SheetValue = string | number | boolean | null | undefined

interface ValuesRange {
  values?: SheetValue[][]
}

interface BatchGetResponse {
  valueRanges?: ValuesRange[]
}

interface RgbColor {
  red?: number
  green?: number
  blue?: number
}

interface CellData {
  effectiveFormat?: {
    backgroundColor?: RgbColor
    backgroundColorStyle?: {
      rgbColor?: RgbColor
      themeColor?: string
    }
  }
}

interface SpreadsheetGridResponse {
  sheets?: Array<{
    data?: Array<{
      rowData?: Array<{ values?: CellData[] }>
    }>
  }>
}

interface LegacyMonthPreview {
  month: number
  periodo: string
  amount: number | null
  color: string
  legacyMeaning: LegacyColorMeaning
}

interface LegacyAdjustmentPreview {
  month: number
  amount: number
  cell: string
}

interface LegacyMemberInput {
  member: MigrationMemberPreview
  formula: string
  meses: LegacyMonthPreview[]
  ajustesExcluidos: LegacyAdjustmentPreview[]
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

function asNumber(value: SheetValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[^0-9,-]/g, '').replace(/\./g, '').replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function colorComponent(value?: number) {
  return Math.max(0, Math.min(255, Math.round((value ?? 0) * 255)))
}

function rgbToHex(rgb?: RgbColor) {
  if (!rgb) return 'SIN_COLOR'
  const parts = [rgb.red, rgb.green, rgb.blue].map((value) =>
    colorComponent(value).toString(16).padStart(2, '0'),
  )
  return `#${parts.join('').toUpperCase()}`
}

function cellColor(cell?: CellData) {
  const style = cell?.effectiveFormat?.backgroundColorStyle
  if (style?.rgbColor) return rgbToHex(style.rgbColor)
  if (style?.themeColor) return `TEMA:${style.themeColor}`
  return rgbToHex(cell?.effectiveFormat?.backgroundColor)
}

async function jsonRequest<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json() as { error?: { message?: string } }
      detail = payload.error?.message ?? ''
    } catch {
      // HTTP fallback below.
    }
    throw new Error(detail || `Google Sheets API respondió ${response.status}.`)
  }
  return response.json() as Promise<T>
}

async function getSheetsAccessToken(user: User) {
  const provider = new GoogleAuthProvider()
  provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly')
  const result = await reauthenticateWithPopup(user, provider)
  const credential = GoogleAuthProvider.credentialFromResult(result)
  if (!credential?.accessToken) throw new Error('Google no devolvió un token de lectura de Sheets.')
  return credential.accessToken
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

function lastActiveMonth2026(member: MigrationMemberPreview) {
  if (member.estadoPropuesto !== 'INACTIVO' || !member.fechaBaja) return null
  const match = member.fechaBaja.match(/^2026-(\d{2})-/)
  if (!match) return null
  const month = Number(match[1])
  return month >= 1 && month <= 12 ? month : null
}

function obligationState(importe: number, paid: number, exenta = false): SnapshotObligationState {
  if (exenta) return 'EXENTA'
  if (paid <= EPSILON) return 'PENDIENTE'
  if (paid + EPSILON >= importe) return 'PAGADA'
  return 'PARCIAL'
}

function historicalMonthlyCharge(
  monthPreview: LegacyMonthPreview | undefined,
  defaultRate: number,
  tariffs: MigrationTariffConfig,
) {
  if (!monthPreview || monthPreview.legacyMeaning.kind !== 'PAGO') return defaultRate
  const amount = monthPreview.amount ?? 0
  if (tariffs.aporteSoltero !== null && Math.abs(amount - tariffs.aporteSoltero) <= EPSILON) return tariffs.aporteSoltero
  if (tariffs.aporteCasado !== null && Math.abs(amount - tariffs.aporteCasado) <= EPSILON) return tariffs.aporteCasado
  return defaultRate
}

function extractFormulaAdjustments(formula: string, row: number, monthValues: SheetValue[]): LegacyAdjustmentPreview[] {
  const normalized = formula.replace(/\s+/g, '').toUpperCase()
  const marker = `-U${row}`
  const markerIndex = normalized.indexOf(marker)
  if (markerIndex < 0) return []
  const tail = normalized.slice(markerIndex + marker.length)
  const result: LegacyAdjustmentPreview[] = []
  const regex = /\+([I-T])(\d+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(tail)) !== null) {
    if (Number(match[2]) !== row) continue
    const month = MONTH_COLUMNS.indexOf(match[1] as typeof MONTH_COLUMNS[number]) + 1
    if (month <= 0) continue
    result.push({
      month,
      amount: asNumber(monthValues[month - 1]) ?? 0,
      cell: `${match[1]}${row}`,
    })
  }
  return result
}

function calculateValidatedExitAdjustment(
  member: MigrationMemberPreview,
  meses: LegacyMonthPreview[],
  monthlyRule: { rate: number; count: number } | null,
  startMonth: number,
) {
  const lastActiveMonth = lastActiveMonth2026(member)
  if (!monthlyRule || lastActiveMonth === null) return 0

  let payableRemaining = monthlyRule.count
  let month = startMonth
  let adjustment = 0
  while (payableRemaining > 0 && month <= 12) {
    const exenta = meses[month - 1]?.legacyMeaning.kind === 'EXONERACION'
    if (!exenta) {
      if (month > lastActiveMonth) adjustment += monthlyRule.rate
      payableRemaining -= 1
    }
    month += 1
  }
  return adjustment
}

function buildMemberSnapshot(input: LegacyMemberInput, tariffs: MigrationTariffConfig): MigrationMemberSnapshot2026 {
  const { member, formula, meses, ajustesExcluidos } = input
  const deudaFuente = member.deuda2026 ?? 0
  const cobradoHoja = member.sumatoriaHoja ?? 0
  const totalAjustesExcluidos = ajustesExcluidos.reduce((sum, item) => sum + item.amount, 0)
  const cobrosElegibles = Math.max(0, cobradoHoja - totalAjustesExcluidos)
  const obligaciones: MigrationSnapshotObligation[] = []
  const movimientos: MigrationSnapshotMovement[] = []
  const observaciones: string[] = []
  const excludedMonths = new Set(ajustesExcluidos.map((item) => item.month))
  const monthlyRule = formulaMonthlyRule(formula, tariffs)
  let unresolvedStructure = false
  let reviewMovementCount = 0

  let startMonth = joinMonth2026(member)
  if (ajustesExcluidos.length > 0) {
    startMonth = Math.max(startMonth, Math.max(...ajustesExcluidos.map((item) => item.month)) + 1)
  }

  const ajusteValidadoBaja = calculateValidatedExitAdjustment(member, meses, monthlyRule, startMonth)
  const deudaObjetivoMigracion = Math.max(0, deudaFuente - ajusteValidadoBaja)
  const cargosObjetivo = Math.max(0, deudaObjetivoMigracion + cobrosElegibles)
  const lastActiveMonth = lastActiveMonth2026(member)
  if (ajusteValidadoBaja > EPSILON) {
    observaciones.push(`Baja efectiva ${member.fechaBaja}: se excluyen Gs. ${Math.round(ajusteValidadoBaja).toLocaleString('es-PY')} de cuotas posteriores. Deuda objetivo: Gs. ${Math.round(deudaObjetivoMigracion).toLocaleString('es-PY')}.`)
  }

  const monthlyObligationByMonth = new Map<number, MigrationSnapshotObligation>()
  if (monthlyRule && monthlyRule.count > 0) {
    let payableRemaining = monthlyRule.count
    let month = startMonth
    while (payableRemaining > 0 && month <= 12) {
      if (lastActiveMonth !== null && month > lastActiveMonth) break

      const monthPreview = meses[month - 1]
      const exenta = monthPreview?.legacyMeaning.kind === 'EXONERACION'
      const key = `row-${member.row}-cuota-${monthPeriod(month)}`
      const importe = exenta
        ? monthlyRule.rate
        : historicalMonthlyCharge(monthPreview, monthlyRule.rate, tariffs)
      const sourceNote = importe !== monthlyRule.rate
        ? `Importe histórico preservado desde la celda porque coincide con una tarifa vigente en 2026; la fórmula usa ${monthlyRule.reference}.`
        : `Tarifa inferida de ${monthlyRule.reference} en la fórmula de Deuda 2026.`
      const obligation: MigrationSnapshotObligation = {
        key,
        kind: 'CUOTA_MENSUAL',
        concepto: `Cuota social ${MONTH_LABELS[month - 1]} 2026`,
        periodo: monthPeriod(month),
        importe,
        estado: exenta ? 'EXENTA' : 'PENDIENTE',
        sourceCell: `${MONTH_COLUMNS[month - 1]}${member.row}`,
        sourceNote,
      }
      obligaciones.push(obligation)
      monthlyObligationByMonth.set(month, obligation)
      if (exenta) {
        movimientos.push({
          kind: 'EXONERACION',
          importe,
          periodoObligacion: obligation.periodo,
          targetKey: key,
          sourceCell: obligation.sourceCell,
          confidence: 'ALTA',
          note: month === 7
            ? 'Exoneración por asistencia al retiro de silencio anual 2026.'
            : 'Exoneración roja fuera de julio; requiere revisión.',
        })
        if (month !== 7) {
          unresolvedStructure = true
          observaciones.push(`Exoneración roja detectada fuera de julio (${obligation.periodo}).`)
        }
      } else {
        payableRemaining -= 1
      }
      month += 1
    }
    if (payableRemaining > 0 && lastActiveMonth === null) {
      unresolvedStructure = true
      observaciones.push(`No fue posible distribuir ${payableRemaining} cuota(s) pagable(s) dentro de 2026.`)
    }

    for (const monthPreview of meses) {
      if (monthPreview.legacyMeaning.kind !== 'EXONERACION' || monthlyObligationByMonth.has(monthPreview.month)) continue
      if (lastActiveMonth !== null && monthPreview.month > lastActiveMonth) continue
      const key = `row-${member.row}-cuota-${monthPreview.periodo}`
      const obligation: MigrationSnapshotObligation = {
        key,
        kind: 'CUOTA_MENSUAL',
        concepto: `Cuota social ${MONTH_LABELS[monthPreview.month - 1]} 2026`,
        periodo: monthPreview.periodo,
        importe: monthlyRule.rate,
        estado: 'EXENTA',
        sourceCell: `${MONTH_COLUMNS[monthPreview.month - 1]}${member.row}`,
        sourceNote: 'Exoneración legacy conservada aunque quede fuera del tramo pagable inferido.',
      }
      obligaciones.push(obligation)
      monthlyObligationByMonth.set(monthPreview.month, obligation)
      movimientos.push({
        kind: 'EXONERACION',
        importe: monthlyRule.rate,
        periodoObligacion: obligation.periodo,
        targetKey: key,
        sourceCell: obligation.sourceCell,
        confidence: 'ALTA',
        note: monthPreview.month === 7
          ? 'Exoneración por asistencia al retiro de silencio anual 2026.'
          : 'Exoneración roja fuera de julio; requiere revisión.',
      })
      if (monthPreview.month !== 7) unresolvedStructure = true
    }
  } else if (formula && formula !== '0' && cargosObjetivo > EPSILON) {
    unresolvedStructure = true
    observaciones.push('No se pudo inferir la tarifa y cantidad de cuotas desde la fórmula legacy.')
  }

  if (includesFormulaReference(formula, 'Y6')) {
    obligaciones.push({
      key: `row-${member.row}-membresia-2026`,
      kind: 'MEMBRESIA',
      concepto: 'Membresía 2026',
      periodo: '2026-ANUAL',
      importe: tariffs.membresia ?? 35000,
      estado: 'PENDIENTE',
      sourceCell: `H${member.row}`,
    })
  }

  if (includesFormulaReference(formula, 'Z6')) {
    obligaciones.push({
      key: `row-${member.row}-ingreso`,
      kind: 'APORTE_INGRESO',
      concepto: 'Aporte de ingreso',
      periodo: member.fechaIngreso.slice(0, 7) || '2026',
      importe: tariffs.ingreso ?? 40000,
      estado: 'PENDIENTE',
      sourceCell: `G${member.row}`,
    })
  }

  for (const monthPreview of meses) {
    const amount = monthPreview.amount ?? 0
    if (amount <= EPSILON) continue
    if (lastActiveMonth !== null && monthPreview.month > lastActiveMonth) continue
    const cell = `${MONTH_COLUMNS[monthPreview.month - 1]}${member.row}`

    if (excludedMonths.has(monthPreview.month)) {
      movimientos.push({
        kind: 'EXCLUIDO',
        importe: amount,
        periodoObligacion: monthPreview.periodo,
        periodoCobro: monthPreview.legacyMeaning.kind === 'PAGO' ? monthPreview.legacyMeaning.periodoCobro : undefined,
        sourceCell: cell,
        confidence: 'ALTA',
        note: 'La fórmula de deuda vuelve a sumar esta celda; el importe queda fuera del saldo exigible reconstruido.',
      })
      continue
    }

    const obligation = monthlyObligationByMonth.get(monthPreview.month)
    if (monthPreview.legacyMeaning.kind === 'PAGO') {
      if (!obligation || obligation.estado === 'EXENTA') {
        movimientos.push({
          kind: 'AJUSTE_PAGO_LEGACY',
          importe: amount,
          periodoObligacion: monthPreview.periodo,
          periodoCobro: monthPreview.legacyMeaning.periodoCobro,
          sourceCell: cell,
          confidence: monthPreview.legacyMeaning.confidence,
          note: 'Cobro coloreado sin obligación mensual normal compatible.',
        })
        reviewMovementCount += 1
        continue
      }
      const applied = Math.min(obligation.importe, amount)
      movimientos.push({
        kind: 'PAGO',
        importe: applied,
        periodoObligacion: obligation.periodo,
        periodoCobro: monthPreview.legacyMeaning.periodoCobro,
        targetKey: obligation.key,
        sourceCell: cell,
        confidence: monthPreview.legacyMeaning.confidence,
        note: 'La columna identifica la cuota y el color identifica el mes de cobro. El importe se conserva tal como fue recibido.',
      })
      obligation.estado = obligationState(obligation.importe, applied)
      if (amount > applied + EPSILON) {
        movimientos.push({
          kind: 'AJUSTE_PAGO_LEGACY',
          importe: amount - applied,
          periodoObligacion: obligation.periodo,
          periodoCobro: monthPreview.legacyMeaning.periodoCobro,
          sourceCell: cell,
          confidence: 'BAJA',
          note: 'El importe de la celda excede la obligación nominal inferida y no coincide con una tarifa histórica completa.',
        })
        reviewMovementCount += 1
      }
    } else if (monthPreview.legacyMeaning.kind === 'DESCONOCIDO') {
      movimientos.push({
        kind: 'AJUSTE_PAGO_LEGACY',
        importe: amount,
        periodoObligacion: monthPreview.periodo,
        sourceCell: cell,
        confidence: 'BAJA',
        note: `Importe con color no interpretado (${monthPreview.color}).`,
      })
      reviewMovementCount += 1
    } else {
      movimientos.push({
        kind: 'AJUSTE_PAGO_LEGACY',
        importe: amount,
        periodoObligacion: monthPreview.periodo,
        sourceCell: cell,
        confidence: 'BAJA',
        note: 'Celda roja de exoneración contiene además un importe; revisar manualmente.',
      })
      reviewMovementCount += 1
    }
  }

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
      note: 'Pago confirmado por la columna legacy; no se conserva el mes exacto de cobro.',
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
      reviewMovementCount += 1
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
      sourceNote: 'Completa el total exigible implícito en la fórmula sin inventar meses o conceptos.',
    })
    observaciones.push(`Ajuste técnico de cargo: Gs. ${Math.round(ajusteCargoLegacy).toLocaleString('es-PY')}.`)
  } else if (ajusteCargoLegacy < 0) {
    unresolvedStructure = true
    observaciones.push(`Los cargos inferidos exceden el exigible legacy en Gs. ${Math.round(Math.abs(ajusteCargoLegacy)).toLocaleString('es-PY')}.`)
  }

  const recognizedReceipts = movimientos
    .filter((item) => item.kind === 'PAGO' || item.kind === 'AJUSTE_PAGO_LEGACY')
    .reduce((sum, item) => sum + item.importe, 0)
  let ajustePagoLegacy = cobrosElegibles - recognizedReceipts
  if (Math.abs(ajustePagoLegacy) <= EPSILON) ajustePagoLegacy = 0
  if (ajustePagoLegacy > 0) {
    movimientos.push({
      kind: 'AJUSTE_PAGO_LEGACY',
      importe: ajustePagoLegacy,
      confidence: 'BAJA',
      note: 'Cobro incluido en la sumatoria legacy que no puede asignarse a un concepto sin inventar información.',
    })
    observaciones.push(`Cobro legacy sin asignación determinística: Gs. ${Math.round(ajustePagoLegacy).toLocaleString('es-PY')}.`)
  } else if (ajustePagoLegacy < 0) {
    unresolvedStructure = true
    observaciones.push(`Los cobros identificados exceden los cobros elegibles en Gs. ${Math.round(Math.abs(ajustePagoLegacy)).toLocaleString('es-PY')}.`)
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
  const diferencia = deudaReconstruida - deudaObjetivoMigracion
  const unknownColorCount = meses.filter((item) =>
    (item.amount ?? 0) > EPSILON && item.legacyMeaning.kind === 'DESCONOCIDO',
  ).length

  if (unknownColorCount > 0) observaciones.push(`${unknownColorCount} celda(s) con importe tienen color no interpretado.`)
  if (Math.abs(diferencia) > EPSILON) observaciones.push(`Diferencia final contra deuda objetivo: Gs. ${Math.round(diferencia).toLocaleString('es-PY')}.`)
  if (ajustesExcluidos.length > 0) {
    observaciones.push(`${ajustesExcluidos.length} cobro(s) fueron excluidos por la propia fórmula de deuda (${ajustesExcluidos.map((item) => item.cell).join(', ')}).`)
  }

  const hasUnresolved = unresolvedStructure
    || unknownColorCount > 0
    || reviewMovementCount > 0
    || ajusteCargoLegacy < -EPSILON
    || ajustePagoLegacy < -EPSILON
    || Math.abs(diferencia) > EPSILON
  const hasTechnicalAdjustments = ajusteCargoLegacy > EPSILON
    || ajustePagoLegacy > EPSILON
    || ajustesExcluidos.length > 0
    || ajusteValidadoBaja > EPSILON
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
    deudaObjetivoMigracion,
    ajusteValidadoBaja,
    cobradoHoja,
    ajustesExcluidos: totalAjustesExcluidos,
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

export async function analyzeMigrationSnapshot2026(
  user: User,
  spreadsheetInput: string,
  preview: MigrationPreview,
  scannedToRow = 60,
): Promise<MigrationSnapshot2026> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetInput)
  const maxRow = Math.max(10, Math.min(500, Math.floor(scannedToRow)))
  const accessToken = await getSheetsAccessToken(user)

  const valuesParams = new URLSearchParams()
  valuesParams.append('ranges', `'2026'!G1:W${maxRow}`)
  valuesParams.set('majorDimension', 'ROWS')
  valuesParams.set('valueRenderOption', 'UNFORMATTED_VALUE')
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${valuesParams}`
  const valuesResponse = await jsonRequest<BatchGetResponse>(valuesUrl, accessToken)
  const financialRows = valuesResponse.valueRanges?.[0]?.values ?? []

  const formulaParams = new URLSearchParams()
  formulaParams.append('ranges', `'2026'!V1:V${maxRow}`)
  formulaParams.set('majorDimension', 'ROWS')
  formulaParams.set('valueRenderOption', 'FORMULA')
  const formulaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${formulaParams}`
  const formulaResponse = await jsonRequest<BatchGetResponse>(formulaUrl, accessToken)
  const formulaRows = formulaResponse.valueRanges?.[0]?.values ?? []

  const gridParams = new URLSearchParams()
  gridParams.set('includeGridData', 'true')
  gridParams.append('ranges', `'2026'!I1:T${maxRow}`)
  const gridUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${gridParams}`
  const gridResponse = await jsonRequest<SpreadsheetGridResponse>(gridUrl, accessToken)
  const formatRows = gridResponse.sheets?.[0]?.data?.[0]?.rowData ?? []

  const inputs: LegacyMemberInput[] = preview.members.map((member) => {
    const rowIndex = member.row - 1
    const financial = financialRows[rowIndex] ?? []
    const monthValues = financial.slice(2, 14)
    const formatValues = formatRows[rowIndex]?.values ?? []
    const meses = Array.from({ length: 12 }, (_, index): LegacyMonthPreview => {
      const color = cellColor(formatValues[index])
      return {
        month: index + 1,
        periodo: monthPeriod(index + 1),
        amount: asNumber(monthValues[index]),
        color,
        legacyMeaning: interpretLegacyColor2026(color),
      }
    })
    const formula = String(formulaRows[rowIndex]?.[0] ?? '')
    return {
      member,
      formula,
      meses,
      ajustesExcluidos: extractFormulaAdjustments(formula, member.row, monthValues),
    }
  })

  const members = inputs.map((input) => buildMemberSnapshot(input, preview.tariffs))
  return {
    members,
    totals: {
      miembros: members.length,
      limpios: members.filter((item) => item.estado === 'LIMPIO').length,
      conciliadosConAjustes: members.filter((item) => item.estado === 'CONCILIADO_CON_AJUSTES').length,
      revisar: members.filter((item) => item.estado === 'REVISAR').length,
      deudaFuente: members.reduce((sum, item) => sum + item.deudaFuente, 0),
      deudaObjetivoMigracion: members.reduce((sum, item) => sum + item.deudaObjetivoMigracion, 0),
      deudaReconstruida: members.reduce((sum, item) => sum + item.deudaReconstruida, 0),
      ajustesValidadosBaja: members.reduce((sum, item) => sum + item.ajusteValidadoBaja, 0),
      pagosElegibles: members.reduce((sum, item) => sum + item.totalPagosElegibles, 0),
      cargosNormales: members.reduce((sum, item) => sum + item.totalCargosNormales, 0),
      exonerado: members.reduce((sum, item) => sum + item.totalExonerado, 0),
      ajustesCargo: members.reduce((sum, item) => sum + Math.max(0, item.ajusteCargoLegacy), 0),
      ajustesPago: members.reduce((sum, item) => sum + Math.max(0, item.ajustePagoLegacy), 0),
    },
  }
}
