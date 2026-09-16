export type LegacyPaymentPeriod2026 =
  | '2026-01'
  | '2026-02'
  | '2026-03'
  | '2026-04'
  | '2026-05'
  | '2026-06'
  | '2026-07'
  | '2026-08'
  | '2026-09'

export type LegacyColorMeaning =
  | { kind: 'PAGO'; periodoCobro: LegacyPaymentPeriod2026; confidence: 'ALTA' | 'MEDIA' }
  | { kind: 'EXONERACION'; confidence: 'ALTA' }
  | { kind: 'DESCONOCIDO'; confidence: 'BAJA' }

/**
 * Adaptador EXCLUSIVO de migración para la planilla legacy `Lista de miembros 2026`.
 *
 * Estos colores no forman parte del modelo operativo futuro. Se dedujeron conciliando
 * los importes de las cuotas coloreadas con `Ingresos > Aporte socios/miembros` por mes.
 */
const LEGACY_COLOR_MAP_2026: Record<string, LegacyColorMeaning> = {
  '#00FF00': { kind: 'PAGO', periodoCobro: '2026-01', confidence: 'ALTA' },
  '#FF9900': { kind: 'PAGO', periodoCobro: '2026-02', confidence: 'ALTA' },
  '#FFFF00': { kind: 'PAGO', periodoCobro: '2026-03', confidence: 'ALTA' },
  '#9900FF': { kind: 'PAGO', periodoCobro: '2026-04', confidence: 'ALTA' },
  '#0000FF': { kind: 'PAGO', periodoCobro: '2026-05', confidence: 'ALTA' },
  '#00FFFF': { kind: 'PAGO', periodoCobro: '2026-06', confidence: 'ALTA' },
  '#666666': { kind: 'PAGO', periodoCobro: '2026-07', confidence: 'ALTA' },
  '#34A853': { kind: 'PAGO', periodoCobro: '2026-08', confidence: 'ALTA' },
  '#00B050': { kind: 'PAGO', periodoCobro: '2026-08', confidence: 'ALTA' },
  '#BF9000': { kind: 'PAGO', periodoCobro: '2026-09', confidence: 'MEDIA' },
  '#FF0000': { kind: 'EXONERACION', confidence: 'ALTA' },
}

export function normalizeLegacyColor2026(color: string) {
  const normalized = color.trim().toUpperCase()
  if (normalized === 'THEME:7' || normalized === 'TEMA:ACCENT4') return '#34A853'
  return normalized
}

export function interpretLegacyColor2026(color: string): LegacyColorMeaning {
  return LEGACY_COLOR_MAP_2026[normalizeLegacyColor2026(color)] ?? {
    kind: 'DESCONOCIDO',
    confidence: 'BAJA',
  }
}

export function legacyExonerationReason2026(obligationMonth: number) {
  if (obligationMonth === 7) return 'Asistencia al retiro de silencio anual 2026'
  return 'Exoneración indicada por color rojo en la planilla legacy; motivo a revisar'
}
