import type { EstadoCuenta, ObligacionCalculada, PagoCalculado } from '../data/socios'

type PdfFont = 'F1' | 'F2'

interface PdfTextLine {
  x: number
  y: number
  text: string
  size: number
  font: PdfFont
}

interface PdfRule {
  x1: number
  x2: number
  y: number
  width?: number
}

interface PdfPage {
  lines: PdfTextLine[]
  rules: PdfRule[]
}

export interface EstadoCuentaPdfInput {
  socioNombre: string
  socioId?: string
  account: EstadoCuenta
  generatedAt?: Date
}

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
  let page: PdfPage = { lines: [], rules: [] }
  let y = 792

  const addPage = () => {
    page = { lines: [], rules: [] }
    pages.push(page)
    y = 792
    page.lines.push({ x: 44, y, text: 'CENTRO CULTURAL CCNSA', size: 9, font: 'F2' })
    page.lines.push({ x: 430, y, text: `Página ${pages.length}`, size: 8, font: 'F1' })
    y -= 19
    page.rules.push({ x1: 44, x2: 551, y: y + 6 })
  }

  const ensure = (space: number) => {
    if (y - space < 52) addPage()
  }

  const line = (text: string, options?: { x?: number; size?: number; bold?: boolean; gap?: number }) => {
    ensure((options?.gap ?? 16) + 2)
    page.lines.push({
      x: options?.x ?? 44,
      y,
      text,
      size: options?.size ?? 9,
      font: options?.bold ? 'F2' : 'F1',
    })
    y -= options?.gap ?? 16
  }

  const rule = () => {
    ensure(12)
    page.rules.push({ x1: 44, x2: 551, y: y + 4 })
    y -= 10
  }

  addPage()

  line('ESTADO DE CUENTA', { size: 18, bold: true, gap: 25 })
  line(input.socioNombre, { size: 12, bold: true, gap: 18 })
  if (input.socioId) line(`Socio ID: ${input.socioId}`, { size: 8, gap: 14 })
  line(`Emitido: ${new Intl.DateTimeFormat('es-PY', { dateStyle: 'long', timeStyle: 'short' }).format(input.generatedAt ?? new Date())}`, { size: 8, gap: 18 })
  rule()

  const currentYear = new Date().getFullYear()
  const deuda2025 = input.account.obligaciones
    .filter((item) => yearFromPeriod(item.periodo) === 2025)
    .reduce((sum, item) => sum + item.saldoPendiente, 0)
  const deudaActual = input.account.obligaciones
    .filter((item) => yearFromPeriod(item.periodo) === currentYear)
    .reduce((sum, item) => sum + item.saldoPendiente, 0)

  line('RESUMEN', { size: 11, bold: true, gap: 19 })
  line(`Saldo pendiente total: ${money(input.account.saldoPendiente)}`, { bold: true })
  line(`Saldo a favor: ${money(input.account.saldoFavor)}`)
  line(`Saldo neto: ${money(input.account.saldoNeto)}`)
  line(`Pendiente ${currentYear}: ${money(deudaActual)}`)
  if (deuda2025 > 0) line(`Deuda 2025: ${money(deuda2025)}`)
  line(`Total cargos: ${money(input.account.totalCargos)} · Total pagos: ${money(input.account.totalPagos)}`, { gap: 20 })
  rule()

  line('OBLIGACIONES', { size: 11, bold: true, gap: 19 })
  page.lines.push({ x: 44, y, text: 'Periodo', size: 7.5, font: 'F2' })
  page.lines.push({ x: 104, y, text: 'Concepto', size: 7.5, font: 'F2' })
  page.lines.push({ x: 302, y, text: 'Importe', size: 7.5, font: 'F2' })
  page.lines.push({ x: 374, y, text: 'Aplicado', size: 7.5, font: 'F2' })
  page.lines.push({ x: 447, y, text: 'Pendiente', size: 7.5, font: 'F2' })
  page.lines.push({ x: 518, y, text: 'Estado', size: 7.5, font: 'F2' })
  y -= 14
  page.rules.push({ x1: 44, x2: 551, y: y + 5 })

  if (input.account.obligaciones.length === 0) {
    line('Sin obligaciones registradas.', { size: 8 })
  } else {
    for (const item of input.account.obligaciones) {
      ensure(20)
      page.lines.push({ x: 44, y, text: truncate(item.periodo || '—', 10), size: 7.2, font: 'F1' })
      page.lines.push({ x: 104, y, text: truncate(item.concepto || 'Obligación', 32), size: 7.2, font: 'F1' })
      page.lines.push({ x: 302, y, text: truncate(money(item.importe), 14), size: 7.2, font: 'F1' })
      page.lines.push({ x: 374, y, text: truncate(money(item.importeAplicado), 14), size: 7.2, font: 'F1' })
      page.lines.push({ x: 447, y, text: truncate(money(item.saldoPendiente), 14), size: 7.2, font: 'F1' })
      page.lines.push({ x: 518, y, text: statusLabel(item), size: 6.8, font: 'F2' })
      y -= 15
    }
  }

  y -= 8
  rule()
  line('PAGOS', { size: 11, bold: true, gap: 19 })
  page.lines.push({ x: 44, y, text: 'Fecha', size: 7.5, font: 'F2' })
  page.lines.push({ x: 104, y, text: 'Importe', size: 7.5, font: 'F2' })
  page.lines.push({ x: 190, y, text: 'Aplicado', size: 7.5, font: 'F2' })
  page.lines.push({ x: 276, y, text: 'A favor', size: 7.5, font: 'F2' })
  page.lines.push({ x: 357, y, text: 'Medio / referencia', size: 7.5, font: 'F2' })
  y -= 14
  page.rules.push({ x1: 44, x2: 551, y: y + 5 })

  const activePayments = input.account.pagos.filter((item) => item.estado !== 'ANULADO')
  if (activePayments.length === 0) {
    line('Sin pagos registrados.', { size: 8 })
  } else {
    for (const item of activePayments) {
      ensure(20)
      page.lines.push({ x: 44, y, text: truncate(item.fecha || '—', 11), size: 7.2, font: 'F1' })
      page.lines.push({ x: 104, y, text: truncate(money(item.importe), 15), size: 7.2, font: 'F1' })
      page.lines.push({ x: 190, y, text: truncate(money(item.importeAplicado), 15), size: 7.2, font: 'F1' })
      page.lines.push({ x: 276, y, text: truncate(money(item.saldoDisponible), 15), size: 7.2, font: 'F1' })
      page.lines.push({ x: 357, y, text: truncate(pagoDetalle(item), 34), size: 7.2, font: 'F1' })
      y -= 15
    }
  }

  y -= 12
  line('Documento generado por el portal de socios de CCNSA. Los registros anulados no integran los saldos vigentes.', { size: 7.5, gap: 11 })
  line('Ante cualquier diferencia, contacte a Tesorería para la revisión de los comprobantes y aplicaciones de pago.', { size: 7.5, gap: 11 })

  return pages
}

function renderPage(page: PdfPage) {
  const commands: string[] = []
  commands.push('0.09 0.17 0.23 rg')
  for (const rule of page.rules) {
    commands.push('0.80 0.84 0.87 RG')
    commands.push(`${rule.width ?? 0.6} w`)
    commands.push(`${rule.x1} ${rule.y} m ${rule.x2} ${rule.y} l S`)
  }
  for (const item of page.lines) {
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
