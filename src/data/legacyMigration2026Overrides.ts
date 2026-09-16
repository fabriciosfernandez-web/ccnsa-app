export interface LegacyMemberOverride2026 {
  estado: 'ACTIVO' | 'INACTIVO'
  fechaBaja?: string
  motivo?: string
  exoneracionTotal?: boolean
  motivoExoneracion?: string
}

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

const MEMBER_OVERRIDES_2026: Record<string, LegacyMemberOverride2026> = {
  [normalizeName('Fabrizio Ivan López Parzajuk')]: {
    estado: 'INACTIVO',
    fechaBaja: '2026-06-30',
    motivo: 'Renuncia presentada y aceptada el 30/06/2026.',
  },
  [normalizeName('Carlo Camelli')]: {
    estado: 'ACTIVO',
    exoneracionTotal: true,
    motivoExoneracion: 'Exoneración total de cargos por condición religiosa.',
  },
}

export function getLegacyMemberOverride2026(nombre: string): LegacyMemberOverride2026 | undefined {
  return MEMBER_OVERRIDES_2026[normalizeName(nombre)]
}
