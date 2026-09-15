import {
  GoogleAuthProvider,
  reauthenticateWithPopup,
  type User,
} from 'firebase/auth'
import { getLegacyMemberOverride2026 } from './legacyMigration2026Overrides'

export type CategoriaPropuesta = 'SOLTERO' | 'CASADO' | 'REVISAR'
export type EstadoMigracionPropuesto = 'ACTIVO' | 'INACTIVO'

export interface MigrationMemberPreview {
  row: number
  nombre: string
  rango: string
  numero: string
  fechaIngreso: string
  estadoPropuesto: EstadoMigracionPropuesto
  fechaBaja?: string
  categoriaPropuesta: CategoriaPropuesta
  aporteIngreso: number | null
  membresia: number | null
  cobradoMensual: number
  sumatoriaHoja: number | null
  deuda2026: number | null
  deuda2025: number | null
  mesesConImporte: number
  observaciones: string[]
}

export interface MigrationColorStat {
  color: string
  total: number
  conValor: number
  vacias: number
}

export interface MigrationTariffConfig {
  aporteSoltero: number | null
  aporteCasado: number | null
  membresia: number | null
  ingreso: number | null
}

export interface MigrationPreview {
  spreadsheetId: string
  title: string
  sheetName: string
  scannedToRow: number
  members: MigrationMemberPreview[]
  colorStats: MigrationColorStat[]
  tariffs: MigrationTariffConfig
  totalCobradoMensual: number
  totalDeuda2026: number
  totalDeuda2025: number
  sumatoriaMismatches: number
  estados: {
    activos: number
    inactivos: number
  }
  categorias: {
    soltero: number
    casado: number
    revisar: number
  }
}

type SheetValue = string | number | boolean | null | undefined

interface ValuesRange {
  range?: string
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

interface GridRowData {
  values?: CellData[]
}

interface SpreadsheetGridResponse {
  properties?: {
    title?: string
  }
  sheets?: Array<{
    properties?: {
      title?: string
    }
    data?: Array<{
      rowData?: GridRowData[]
    }>
  }>
}

const MONTH_START_OFFSET = 2 // I dentro del rango G:Z
const MONTH_COUNT = 12
const SUMATORIA_OFFSET = 14 // U dentro del rango G:Z
const DEUDA_2026_OFFSET = 15 // V
const DEUDA_2025_OFFSET = 16 // W

export function extractSpreadsheetId(input: string) {
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (urlMatch?.[1]) return urlMatch[1]
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed
  throw new Error('Pegá una URL válida de Google Sheets o el ID de la planilla.')
}

function asText(value: SheetValue) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function asNumber(value: SheetValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[^0-9,-]/g, '').replace(/\./g, '').replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDateCell(value: SheetValue) {
  if (typeof value === 'number') {
    // Google Sheets serial date: epoch 1899-12-30.
    const millis = Math.round((value - 25569) * 86400 * 1000)
    const date = new Date(millis)
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  }
  return asText(value)
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
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json() as { error?: { message?: string } }
      detail = payload.error?.message ?? ''
    } catch {
      // Keep the HTTP fallback below.
    }
    throw new Error(detail || `Google Sheets API respondió ${response.status}.`)
  }

  return response.json() as Promise<T>
}

async function getSheetsAccessToken(user: User) {
  const provider = new GoogleAuthProvider()
  provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly')
  provider.setCustomParameters({ prompt: 'consent' })

  const result = await reauthenticateWithPopup(user, provider)
  const credential = GoogleAuthProvider.credentialFromResult(result)
  if (!credential?.accessToken) {
    throw new Error('Google no devolvió un token de lectura de Sheets. Iniciá sesión con una cuenta Google con acceso a la planilla.')
  }
  return credential.accessToken
}

function inferCategory(
  monthValues: SheetValue[],
  aporteSoltero: number | null,
  aporteCasado: number | null,
): { categoria: CategoriaPropuesta; observacion?: string } {
  const amounts = monthValues
    .map(asNumber)
    .filter((value): value is number => value !== null && value > 0)

  if (amounts.length === 0 || aporteSoltero === null || aporteCasado === null) {
    return { categoria: 'REVISAR', observacion: 'Sin base suficiente para inferir categoría.' }
  }

  const solteroMatches = amounts.filter((value) => value === aporteSoltero).length
  const casadoMatches = amounts.filter((value) => value === aporteCasado).length

  if (solteroMatches > 0 && casadoMatches === 0) return { categoria: 'SOLTERO' }
  if (casadoMatches > 0 && solteroMatches === 0) return { categoria: 'CASADO' }
  if (solteroMatches > 0 && casadoMatches > 0) {
    return { categoria: 'REVISAR', observacion: 'Tiene importes compatibles con ambas categorías; podría existir un cambio histórico.' }
  }
  return { categoria: 'REVISAR', observacion: 'Los importes mensuales no coinciden con las tarifas base detectadas.' }
}

function getTariffConfig(rowsGtoZ: SheetValue[][]): MigrationTariffConfig {
  // En la hoja actual, la tabla auxiliar está en Y:Z.
  return {
    aporteSoltero: asNumber(rowsGtoZ[2]?.[18]), // Y3
    aporteCasado: asNumber(rowsGtoZ[2]?.[19]), // Z3
    membresia: asNumber(rowsGtoZ[5]?.[18]), // Y6
    ingreso: asNumber(rowsGtoZ[5]?.[19]), // Z6
  }
}

function isPlausibleMemberRow(identity: SheetValue[]) {
  const fechaIngreso = asText(identity[0])
  const rango = asText(identity[1])
  const numero = asText(identity[2])
  const nombre = asText(identity[3])
  return Boolean(nombre && (fechaIngreso || rango || numero))
}

export async function analyzeMigration2026(
  user: User,
  spreadsheetInput: string,
  scannedToRow = 60,
): Promise<MigrationPreview> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetInput)
  const maxRow = Math.max(10, Math.min(500, Math.floor(scannedToRow)))
  const accessToken = await getSheetsAccessToken(user)

  const valuesParams = new URLSearchParams()
  valuesParams.append('ranges', `'2026'!A1:D${maxRow}`)
  valuesParams.append('ranges', `'2026'!G1:Z${maxRow}`)
  valuesParams.set('majorDimension', 'ROWS')
  valuesParams.set('valueRenderOption', 'UNFORMATTED_VALUE')

  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${valuesParams}`
  const valuesResponse = await jsonRequest<BatchGetResponse>(valuesUrl, accessToken)
  const rowsAtoD = valuesResponse.valueRanges?.[0]?.values ?? []
  const rowsGtoZ = valuesResponse.valueRanges?.[1]?.values ?? []

  const gridParams = new URLSearchParams()
  gridParams.set('includeGridData', 'true')
  gridParams.append('ranges', `'2026'!I1:T${maxRow}`)
  const gridUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${gridParams}`
  const gridResponse = await jsonRequest<SpreadsheetGridResponse>(gridUrl, accessToken)
  const formatRows = gridResponse.sheets?.[0]?.data?.[0]?.rowData ?? []

  const tariffs = getTariffConfig(rowsGtoZ)
  const colorMap = new Map<string, MigrationColorStat>()
  const members: MigrationMemberPreview[] = []

  for (let index = 1; index < maxRow; index += 1) {
    const identity = rowsAtoD[index] ?? []
    if (!isPlausibleMemberRow(identity)) continue

    const financial = rowsGtoZ[index] ?? []
    const nombre = asText(identity[3])
    const fechaIngreso = formatDateCell(identity[0])
    const override = getLegacyMemberOverride2026(nombre)

    const monthValues = financial.slice(MONTH_START_OFFSET, MONTH_START_OFFSET + MONTH_COUNT)
    const monthNumbers = monthValues.map(asNumber)
    const cobradoMensual = monthNumbers.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    const mesesConImporte = monthNumbers.filter((value) => value !== null && value > 0).length
    const sumatoriaHoja = asNumber(financial[SUMATORIA_OFFSET])
    const observaciones: string[] = []
    const category = inferCategory(monthValues, tariffs.aporteSoltero, tariffs.aporteCasado)
    if (category.observacion) observaciones.push(category.observacion)
    if (override?.estado === 'INACTIVO') {
      observaciones.push(`${override.motivo ?? 'Socio inactivo.'} No deben generarse cargos posteriores a la fecha de baja.`)
    }

    if (sumatoriaHoja !== null && Math.abs(sumatoriaHoja - cobradoMensual) > 0.5) {
      observaciones.push(`Sumatoria anual difiere en Gs. ${Math.round(sumatoriaHoja - cobradoMensual).toLocaleString('es-PY')}.`)
    }

    const formatValues = formatRows[index]?.values ?? []
    for (let monthIndex = 0; monthIndex < MONTH_COUNT; monthIndex += 1) {
      const color = cellColor(formatValues[monthIndex])
      const current = colorMap.get(color) ?? { color, total: 0, conValor: 0, vacias: 0 }
      current.total += 1
      const value = monthValues[monthIndex]
      if (value !== null && value !== undefined && asText(value) !== '') current.conValor += 1
      else current.vacias += 1
      colorMap.set(color, current)
    }

    members.push({
      row: index + 1,
      nombre,
      rango: asText(identity[1]),
      numero: asText(identity[2]),
      fechaIngreso,
      estadoPropuesto: override?.estado ?? 'ACTIVO',
      fechaBaja: override?.fechaBaja,
      categoriaPropuesta: category.categoria,
      aporteIngreso: asNumber(financial[0]),
      membresia: asNumber(financial[1]),
      cobradoMensual,
      sumatoriaHoja,
      deuda2026: asNumber(financial[DEUDA_2026_OFFSET]),
      deuda2025: asNumber(financial[DEUDA_2025_OFFSET]),
      mesesConImporte,
      observaciones,
    })
  }

  const categorias = members.reduce(
    (counts, member) => {
      if (member.categoriaPropuesta === 'SOLTERO') counts.soltero += 1
      else if (member.categoriaPropuesta === 'CASADO') counts.casado += 1
      else counts.revisar += 1
      return counts
    },
    { soltero: 0, casado: 0, revisar: 0 },
  )
  const estados = {
    activos: members.filter((member) => member.estadoPropuesto === 'ACTIVO').length,
    inactivos: members.filter((member) => member.estadoPropuesto === 'INACTIVO').length,
  }

  return {
    spreadsheetId,
    title: gridResponse.properties?.title ?? 'Google Sheet',
    sheetName: gridResponse.sheets?.[0]?.properties?.title ?? '2026',
    scannedToRow: maxRow,
    members,
    colorStats: [...colorMap.values()].sort((a, b) => b.total - a.total),
    tariffs,
    totalCobradoMensual: members.reduce((sum, member) => sum + member.cobradoMensual, 0),
    totalDeuda2026: members.reduce((sum, member) => sum + (member.deuda2026 ?? 0), 0),
    totalDeuda2025: members.reduce((sum, member) => sum + (member.deuda2025 ?? 0), 0),
    sumatoriaMismatches: members.filter((member) =>
      member.sumatoriaHoja !== null && Math.abs(member.sumatoriaHoja - member.cobradoMensual) > 0.5,
    ).length,
    estados,
    categorias,
  }
}
