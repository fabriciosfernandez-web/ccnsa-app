export type LegacyMemberCategory2026 = 'SOLTERO' | 'CASADO'
export type LegacyMemberStatus2026 = 'ACTIVO' | 'INACTIVO'

export interface LegacyMemberColorMeaning2026 {
  categoria?: LegacyMemberCategory2026
  estado?: LegacyMemberStatus2026
  label: string
}

// Convención transitoria definida en la hoja productiva para la migración 2026.
// No debe reutilizarse como lógica operativa del sistema nuevo.
const MEMBER_COLOR_MAP_2026: Record<string, LegacyMemberColorMeaning2026> = {
  '#93C47D': { categoria: 'CASADO', estado: 'ACTIVO', label: 'Casado' },
  '#FFFF00': { categoria: 'SOLTERO', estado: 'ACTIVO', label: 'Soltero' },
  '#FF0000': { estado: 'INACTIVO', label: 'Inactivo / salió' },
}

export function interpretLegacyMemberColor2026(color: string): LegacyMemberColorMeaning2026 | undefined {
  return MEMBER_COLOR_MAP_2026[color.trim().toUpperCase()]
}
