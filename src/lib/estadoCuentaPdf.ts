import type { EstadoCuenta, ObligacionCalculada, PagoCalculado } from '../data/socios'

type PdfFont = 'F1' | 'F2'

interface PdfTextLine {
  x: number
  y: number
  text: string
  size: number
  font: PdfFont
  color?: string
}

interface PdfRule {
  x1: number
  x2: number
  y: number
  width?: number
  color?: string
}

interface PdfRect {
  x: number
  y: number
  width: number
  height: number
  fill?: string
  stroke?: string
  strokeWidth?: number
}

interface PdfPage {
  lines: PdfTextLine[]
  rules: PdfRule[]
  rects: PdfRect[]
}

export interface EstadoCuentaPdfInput {
  socioNombre: string
  socioId?: string
  account: EstadoCuenta
  generatedAt?: Date
}

const NAVY = '0.055 0.145 0.205'
const NAVY_SOFT = '0.105 0.245 0.325'
const GOLD = '0.765 0.640 0.355'
const TEXT = '0.075 0.125 0.165'
const MUTED = '0.365 0.430 0.475'
const BORDER = '0.820 0.850 0.870'
const SURFACE = '0.955 0.968 0.976'
const SURFACE_ALT = '0.980 0.985 0.989'
const WHITE = '1 1 1'
const SUCCESS = '0.105 0.455 0.270'
const WARNING = '0.650 0.420 0.060'
const DANGER = '0.680 0.175 0.170'
const INFO = '0.120 0.355 0.570'

const money = (value: number) => `Gs. ${Math.round(value).toLocaleString('es-PY')}`

function pdfText(value: string) {
  let out = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (char === '\\' || char === '(' || char === ')') {
      out += `\\${char}`
    } else if (code >= 32 && code <= 126) {
      out += char
    } else if (code <= 255) {
      out += `\\${code.toString(8).padStart(3, '0')}`
    } else {
      out += '?'
    }
  }
  return out
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}

function statusLabel(item: ObligacionCalculada) {
  if (item.estadoCalculado === 'EXENTA') return 'EXENTA'
  if (item.estadoCalculado === 'ANULADA') return 'ANULADA'
  if (item.estadoCalculado === 'PAGADA') return 'PAGADA'
  if (item.estadoCalculado === 'PARCIAL') return 'PARCIAL'
  return 'PENDIENTE'
}

function statusColor(item: ObligacionCalculada) {
  if (item.estadoCalculado === 'PAGADA') return SUCCESS
  if (item.estadoCalculado === 'EXENTA') return INFO
  if (item.estadoCalculado === 'ANULADA') return DANGER
  return WARNING
}

function pagoDetalle(item: PagoCalculado) {
  const reference = item.referencia ? ` · Ref. ${item.referencia}` : ''
  return `${item.medioPago || 'Sin medio'}${reference}`
}

function yearFromPeriod(periodo: string) {
  const match = periodo.match(/^(\d{4})/)
  return match ? Number(match[1]) : undefined
}

function buildPages(input: EstadoCuentaPdfInput) {
  const pages: PdfPage[] = []
  const generatedAt = input.generatedAt ?? new Date()
  const currentYear = generatedAt.getFullYear()
  let page: PdfPage = { lines: [], rules: [], rects: [] }
  let y = 718

  const addBrandHeader = () => {
    page.rects.push({ x: 0, y: 752, width: 595, height: 90, fill: NAVY })
    page.rects.push({ x: 44, y: 774, width: 42, height: 42, fill: NAVY_SOFT, stroke: GOLD, strokeWidth: 0.9 })
    page.lines.push({ x: 54, y: 789, text: 'CC', size: 15, font: 'F2', color: GOLD })
    page.lines.push({ x: 101, y: 802, text: 'CENTRO CULTURAL', size: 7.5, font: 'F2', color: '0.74 0.80 0.84' })
    page.lines.push({ x: 101, y: 783, text: 'CCNSA', size: 15, font: 'F2', color: WHITE })
    page.lines.push({ x: 101, y: 769, text: 'Comité de Finanzas', size: 7.5, font: 'F1', color: '0.82 0.86 0.89' })
    page.lines.push({ x: 444, y: 794, text: 'ESTADO DE CUENTA', size: 9, font: 'F2', color: WHITE })
    page.lines.push({ x: 444, y: 778, text: truncate(input.socioNombre, 22), size: 7.5, font: 'F1', color: '0.84 0.88 0.91' })
  }

  const addPage = () => {
    page = { lines: [], rules: [], rects: [] }
    pages.push(page)
    addBrandHeader()
    y = 718
  }

  const ensure = (space: number) => {
    if (y - space < 62) addPage()
  }

  const line = (text: string, options?: { x?: number; size?: number; bold?: boolean; gap?: number; color?: string }) => {
    ensure((options?.gap ?? 16) + 2)
    page.lines.push({
      x: options?.x ?? 44,
      y,
      text,
      size: options?.size ?? 9,
      font: options?.bold ? 'F2' : 'F1',
      color: options?.color ?? TEXT,
    })
    y -= options?.gap ?? 16
  }

  const rule = (color = BORDER) => {
    ensure(12)
    page.rules.push({ x1: 44, x2: 551, y: y + 4, color })
    y -= 10
  }

  const sectionTitle = (title: string, subtitle?: string) => {
    ensure(subtitle ? 44 : 29)
    page.lines.push({ x: 44, y, text: title, size: 10.5, font: 'F2', color: NAVY })
    y -= 14
    if (subtitle) {
      page.lines.push({ x: 44, y, text: subtitle, size: 7.4, font: 'F1', color: MUTED })
      y -= 18
    } else {
      y -= 8
    }
  }

  const obligationHeader = () => {
    page.rects.push({ x: 44, y: y - 4, width: 507, height: 19, fill: NAVY })
    const headerY = y + 2
    page.lines.push({ x: 51, y: headerY, text: 'Periodo', size: 7.1, font: 'F2', color: WHITE })
    page.lines.push({ x: 108, y: headerY, text: 'Concepto', size: 7.1, font: 'F2', color: WHITE })
    page.lines.push({ x: 304, y: headerY, text: 'Importe', size: 7.1, font: 'F2', color: WHITE })
    page.lines.push({ x: 375, y: headerY, text: 'Aplicado', size: 7.1, font: 'F2', color: WHITE })
    page.lines.push({ x: 446, y: headerY, text: 'Pendiente', size: 7.1, font: 'F2', color: WHITE })
    page.lines.push({ x: 515, y: headerY, text: 'Estado', size: 7.1, font: 'F2', color: WHITE })
    y -= 19
  }

  const paymentHeader = () => {
    page.rects.push({ x: 44, y: y - 4, width: 507, height: 19, fill: NAVY })
    const headerY = y + 2
    page.lines.push({ x: 51, y: headerY, text: 'Fecha', size: 7.1, font: 'F2', color: WHITE })
    page.lines.push({ x: 112, y: headerY, text: 'Importe', size: 7.1, font: 'F2', color: WHITE })
    page.lines.push({ x: 196, y: headerY, text: 'Aplicado', size: 7.1, font: 'F2', color: WHITE })
    page.lines.push({ x: 280, y: headerY, text: 'A favor', size: 7.1, font: 'F2', color: WHITE })
    page.lines.push({ x: 361, y: headerY, text: 'Medio / referencia', size: 7.1, font: 'F2', color: WHITE })
    y -= 19
  }

  const addObligationTotals = () => {
    const vigentes = input.account.obligaciones.filter((item) => item.estadoCalculado !== 'ANULADA' && item.estadoCalculado !== 'EXENTA')
    const totalImporte = vigentes.reduce((sum, item) => sum + item.importe, 0)
    const totalAplicado = vigentes.reduce((sum, item) => sum + item.importeAplicado, 0)
    const totalPendiente = vigentes.reduce((sum, item) => sum + item.saldoPendiente, 0)
    const excluidas = input.account.obligaciones.length - vigentes.length

    if (y - 42 < 62) {
      addPage()
      sectionTitle('Obligaciones (totales)')
    }

    page.rects.push({ x: 44, y: y - 5, width: 507, height: 23, fill: SURFACE, stroke: BORDER, strokeWidth: 0.6 })
    page.lines.push({ x: 108, y: y + 2, text: 'TOTALES VIGENTES', size: 7.1, font: 'F2', color: NAVY })
    page.lines.push({ x: 304, y: y + 2, text: truncate(money(totalImporte), 13), size: 7.1, font: 'F2', color: NAVY })
    page.lines.push({ x: 375, y: y + 2, text: truncate(money(totalAplicado), 13), size: 7.1, font: 'F2', color: NAVY })
    page.lines.push({ x: 446, y: y + 2, text: truncate(money(totalPendiente), 13), size: 7.1, font: 'F2', color: totalPendiente > 0 ? WARNING : SUCCESS })
    y -= 26

    if (excluidas > 0) {
      page.lines.push({
        x: 44,
        y,
        text: `Nota: ${excluidas} obligación${excluidas === 1 ? '' : 'es'} EXENTA/ANULADA${excluidas === 1 ? '' : 'S'} se muestra${excluidas === 1 ? '' : 'n'} como referencia y no integra${excluidas === 1 ? '' : 'n'} estos totales.`,
        size: 6.4,
        font: 'F1',
        color: MUTED,
      })
      y -= 16
    }
  }

  const addPaymentTotals = (activePayments: PagoCalculado[]) => {
    const totalImporte = activePayments.reduce((sum, item) => sum + item.importe, 0)
    const totalAplicado = activePayments.reduce((sum, item) => sum + item.importeAplicado, 0)
    const totalFavor = activePayments.reduce((sum, item) => sum + item.saldoDisponible, 0)

    if (y - 56 < 62) {
      addPage()
      sectionTitle('Pagos (totales)')
    }

    page.rects.push({ x: 44, y: y - 5, width: 507, height: 23, fill: SURFACE, stroke: BORDER, strokeWidth: 0.6 })
    page.lines.push({ x: 51, y: y + 2, text: 'TOTALES', size: 7.1, font: 'F2', color: NAVY })
    page.lines.push({ x: 112, y: y + 2, text: truncate(money(totalImporte), 14), size: 7.1, font: 'F2', color: NAVY })
    page.lines.push({ x: 196, y: y + 2, text: truncate(money(totalAplicado), 14), size: 7.1, font: 'F2', color: NAVY })
    page.lines.push({ x: 280, y: y + 2, text: truncate(money(totalFavor), 14), size: 7.1, font: 'F2', color: totalFavor > 0 ? SUCCESS : NAVY })
    y -= 29

    page.lines.push({
      x: 44,
      y,
      text: `Conciliación: pendiente ${money(input.account.saldoPendiente)} - saldo a favor ${money(input.account.saldoFavor)} = saldo neto ${money(input.account.saldoNeto)}.`,
      size: 7,
      font: 'F2',
      color: input.account.saldoNeto > 0 ? WARNING : input.account.saldoNeto < 0 ? SUCCESS : NAVY,
    })
    y -= 17
  }

  addPage()

  line('Estado de cuenta del socio', { size: 17, bold: true, gap: 23, color: NAVY })
  line(input.socioNombre, { size: 11.5, bold: true, gap: 16 })
  line(`Emitido: ${new Intl.DateTimeFormat('es-PY', { dateStyle: 'long', timeStyle: 'short' }).format(generatedAt)}`, { size: 7.7, gap: 20, color: MUTED })

  const deuda2025 = input.account.obligaciones
    .filter((item) => yearFromPeriod(item.periodo) === 2025)
    .reduce((sum, item) => sum + item.saldoPendiente, 0)
  const deudaActual = input.account.obligaciones
    .filter((item) => yearFromPeriod(item.periodo) === currentYear)
    .reduce((sum, item) => sum + item.saldoPendiente, 0)

  sectionTitle('Resumen de cuenta')
  const cards = [
    ['Pendiente total', money(input.account.saldoPendiente)],
    [`Pendiente ${currentYear}`, money(deudaActual)],
    ['Saldo a favor', money(input.account.saldoFavor)],
    ['Saldo neto', money(input.account.saldoNeto)],
  ] as const
  const cardWidth = 119.25
  const cardGap = 10
  const cardY = y - 46
  cards.forEach(([label, value], index) => {
    const x = 44 + index * (cardWidth + cardGap)
    page.rects.push({ x, y: cardY, width: cardWidth, height: 48, fill: SURFACE, stroke: BORDER, strokeWidth: 0.5 })
    page.lines.push({ x: x + 10, y: cardY + 31, text: label, size: 6.7, font: 'F2', color: MUTED })
    page.lines.push({ x: x + 10, y: cardY + 14, text: truncate(value, 18), size: 10.3, font: 'F2', color: NAVY })
  })
  y = cardY - 15
  if (deuda2025 > 0) line(`Deuda 2025: ${money(deuda2025)}`, { size: 8, bold: true, gap: 14, color: WARNING })
  line(`Total cargos: ${money(input.account.totalCargos)}   ·   Total pagos: ${money(input.account.totalPagos)}`, { size: 7.8, gap: 18, color: MUTED })
  rule()

  sectionTitle('Obligaciones', 'Cuotas, membresías y demás cargos registrados en la cuenta.')
  obligationHeader()

  if (input.account.obligaciones.length === 0) {
    line('Sin obligaciones registradas.', { size: 8, color: MUTED })
  } else {
    input.account.obligaciones.forEach((item, index) => {
      if (y - 20 < 62) {
        addPage()
        sectionTitle('Obligaciones (continuación)')
        obligationHeader()
      }
      if (index % 2 === 1) page.rects.push({ x: 44, y: y - 4, width: 507, height: 18, fill: SURFACE_ALT })
      page.lines.push({ x: 51, y, text: truncate(item.periodo || '—', 10), size: 7, font: 'F1', color: TEXT })
      page.lines.push({ x: 108, y, text: truncate(item.concepto || 'Obligación', 31), size: 7, font: 'F1', color: TEXT })
      page.lines.push({ x: 304, y, text: truncate(money(item.importe), 13), size: 7, font: 'F1', color: TEXT })
      page.lines.push({ x: 375, y, text: truncate(money(item.importeAplicado), 13), size: 7, font: 'F1', color: TEXT })
      page.lines.push({ x: 446, y, text: truncate(money(item.saldoPendiente), 13), size: 7, font: 'F1', color: TEXT })
      page.lines.push({ x: 515, y, text: statusLabel(item), size: 6.4, font: 'F2', color: statusColor(item) })
      page.rules.push({ x1: 44, x2: 551, y: y - 5, width: 0.25, color: BORDER })
      y -= 18
    })
    addObligationTotals()
  }

  y -= 10
  rule()
  sectionTitle('Pagos', 'Detalle de pagos vigentes, aplicaciones y referencias disponibles.')
  paymentHeader()

  const activePayments = input.account.pagos.filter((item) => item.estado !== 'ANULADO')
  if (activePayments.length === 0) {
    line('Sin pagos registrados.', { size: 8, color: MUTED })
  } else {
    activePayments.forEach((item, index) => {
      if (y - 20 < 62) {
        addPage()
        sectionTitle('Pagos (continuación)')
        paymentHeader()
      }
      if (index % 2 === 1) page.rects.push({ x: 44, y: y - 4, width: 507, height: 18, fill: SURFACE_ALT })
      page.lines.push({ x: 51, y, text: truncate(item.fecha || '—', 11), size: 7, font: 'F1', color: TEXT })
      page.lines.push({ x: 112, y, text: truncate(money(item.importe), 14), size: 7, font: 'F1', color: TEXT })
      page.lines.push({ x: 196, y, text: truncate(money(item.importeAplicado), 14), size: 7, font: 'F1', color: TEXT })
      page.lines.push({ x: 280, y, text: truncate(money(item.saldoDisponible), 14), size: 7, font: 'F1', color: item.saldoDisponible > 0 ? SUCCESS : TEXT })
      page.lines.push({ x: 361, y, text: truncate(pagoDetalle(item), 32), size: 7, font: 'F1', color: TEXT })
      page.rules.push({ x1: 44, x2: 551, y: y - 5, width: 0.25, color: BORDER })
      y -= 18
    })
    addPaymentTotals(activePayments)
  }

  pages.forEach((targetPage, index) => {
    targetPage.rules.push({ x1: 44, x2: 551, y: 47, width: 0.5, color: BORDER })
    targetPage.lines.push({ x: 44, y: 31, text: 'Comité de Finanzas · Centro Cultural CCNSA', size: 6.8, font: 'F2', color: NAVY })
    targetPage.lines.push({ x: 44, y: 19, text: 'Ante cualquier diferencia, solicite la revisión de comprobantes y aplicaciones de pago al Comité de Finanzas.', size: 6.2, font: 'F1', color: MUTED })
    targetPage.lines.push({ x: 500, y: 31, text: `Pág. ${index + 1}/${pages.length}`, size: 6.2, font: 'F1', color: MUTED })
  })

  return pages
}

function renderPage(page: PdfPage) {
  const commands: string[] = []
  for (const rect of page.rects) {
    if (rect.fill) commands.push(`${rect.fill} rg`)
    if (rect.stroke) commands.push(`${rect.stroke} RG`)
    if (rect.strokeWidth) commands.push(`${rect.strokeWidth} w`)
    commands.push(`${rect.x} ${rect.y} ${rect.width} ${rect.height} re`)
    commands.push(rect.fill && rect.stroke ? 'B' : rect.fill ? 'f' : 'S')
  }
  for (const rule of page.rules) {
    commands.push(`${rule.color ?? BORDER} RG`)
    commands.push(`${rule.width ?? 0.6} w`)
    commands.push(`${rule.x1} ${rule.y} m ${rule.x2} ${rule.y} l S`)
  }
  for (const item of page.lines) {
    commands.push(`${item.color ?? TEXT} rg`)
    commands.push('BT')
    commands.push(`/${item.font} ${item.size} Tf`)
    commands.push(`${item.x} ${item.y} Td`)
    commands.push(`(${pdfText(item.text)}) Tj`)
    commands.push('ET')
  }
  return commands.join('\n')
}

function buildPdfBytes(pages: PdfPage[]) {
  const objects: string[] = []
  const pageIds: number[] = []
  const pageContentIds: number[] = []

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'

  let nextId = 5
  for (const page of pages) {
    const pageId = nextId++
    const contentId = nextId++
    pageIds.push(pageId)
    pageContentIds.push(contentId)
    const content = renderPage(page)
    objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  }

  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  pages.forEach((_page, index) => {
    objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageContentIds[index]} 0 R >>`
  })

  const maxId = objects.length - 1
  let pdf = '%PDF-1.4\n%CCNSA\n'
  const offsets: number[] = new Array(maxId + 1).fill(0)
  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = pdf.length
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${maxId + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let id = 1; id <= maxId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return new TextEncoder().encode(pdf)
}

export function downloadEstadoCuentaPdf(input: EstadoCuentaPdfInput) {
  const pages = buildPages(input)
  const bytes = buildPdfBytes(pages)
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  const safeName = input.socioNombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'socio'
  anchor.download = `ccnsa-estado-cuenta-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`
  anchor.click()
  URL.revokeObjectURL(url)
}
