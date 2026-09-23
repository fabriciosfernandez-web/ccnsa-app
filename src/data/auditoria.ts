import { collection, getDocs, type DocumentData, type Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

export interface AuditEvent {
  id: string
  action: string
  actionLabel: string
  entity: string
  entityId: string
  modulo: string
  actorUid: string
  actorNombre: string
  actorEmail?: string
  actorRol?: string
  createdAt?: Timestamp
  fechaMovimiento?: string
  concepto?: string
  categoria?: string
  socioId?: string
  periodo?: string
  importe?: number
  motivo?: string
  authMethod?: string
}

function requireDb() {
  if (!db) throw new Error('Firebase no está configurado.')
  return db
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asOptionalNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function moduleFrom(data: DocumentData, action: string, entity: string) {
  const key = `${action} ${entity}`.toUpperCase()
  if (/LOGIN|LOGOUT|AUTH_SESSION/.test(key)) return 'Accesos'
  if (/SNAPSHOT|AUDIT/.test(key)) return 'Auditoría'
  if (/MIGRATION|MIGRACION/.test(key)) return 'Migración'
  if (/USER_ACCESS|\bUSERS\b/.test(key)) return 'Usuarios y accesos'
  if (/ACTIVIDAD/.test(key)) return 'Actividades'
  if (/INGRESO|EGRESO|FINAN/.test(key)) return 'Finanzas'
  if (/TARIFA|REGLA|EXCEPCION|CUOTA|OBLIGACION|PAGO|APLICACION|CONCILI/.test(key)) return 'Cuotas y cobros'
  if (/SOCIO|CATEGORIA/.test(key)) return 'Socios'
  if (/NOTIF/.test(key)) return 'Notificaciones'
  return 'Sistema'
}

function humanizeAction(action: string) {
  const labels: Record<string, string> = {
    INGRESO_CREATED: 'Ingreso registrado',
    EGRESO_CREATED: 'Egreso registrado',
    INGRESO_VOIDED: 'Ingreso anulado',
    EGRESO_VOIDED: 'Egreso anulado',
    ACTIVIDAD_CREATED: 'Actividad creada',
    ACTIVIDAD_STATUS_CHANGED: 'Estado de actividad modificado',
    ACTIVIDAD_INGRESO_CREATED: 'Ingreso de actividad registrado',
    ACTIVIDAD_EGRESO_CREATED: 'Egreso de actividad registrado',
    ACTIVIDAD_MOVIMIENTO_VOIDED: 'Movimiento de actividad anulado',
    ACTIVIDAD_REGISTRATION_CONFIG_UPDATED: 'Configuración de inscripciones actualizada',
    ACTIVIDAD_REGISTRATION_ADMIN_UPDATED: 'Inscripción actualizada por administración',
    ACTIVIDAD_REGISTRATION_REQUESTED: 'Inscripción a actividad solicitada',
    ACTIVIDAD_REGISTRATION_CANCELLED: 'Inscripción a actividad cancelada',
    OBLIGACION_CREATED: 'Obligación creada',
    PAGO_CREATED: 'Pago registrado',
    TARIFA_CUOTA_CREATED: 'Tarifa de cuota creada',
    TARIFA_CUOTA_ACTIVATED: 'Tarifa de cuota activada',
    TARIFA_CUOTA_DEACTIVATED: 'Tarifa de cuota desactivada',
    CUOTAS_PERIODO_GENERATED: 'Cuotas del período generadas',
    REGLA_COBRO_CREATED: 'Regla de cobro creada',
    REGLA_COBRO_ACTIVATED: 'Regla de cobro activada',
    REGLA_COBRO_DEACTIVATED: 'Regla de cobro desactivada',
    EXCEPCION_COBRO_CREATED: 'Excepción de cobro creada',
    EXCEPCION_COBRO_ACTIVATED: 'Excepción de cobro activada',
    EXCEPCION_COBRO_DEACTIVATED: 'Excepción de cobro desactivada',
    SOCIO_CATEGORY_CHANGED: 'Categoría de socio modificada',
    SOCIO_CREATED: 'Socio creado',
    CUENTA_RECONCILIADA: 'Estado de cuenta conciliado',
    FIRESTORE_SNAPSHOT_EXPORTED: 'Snapshot de Firestore exportado',
    USER_ACCESS_CREATED: 'Acceso de usuario creado',
    USER_ACCESS_UPDATED: 'Acceso de usuario actualizado',
    LOGIN_SUCCESS: 'Inicio de sesión',
    LOGOUT: 'Cierre de sesión',
    MIGRATION_2026_COMPLETED: 'Migración 2026 completada',
  }
  if (labels[action]) return labels[action]
  return action
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export async function loadAuditEvents(): Promise<AuditEvent[]> {
  const database = requireDb()
  const [auditSnapshot, usersSnapshot] = await Promise.all([
    getDocs(collection(database, 'audit_log')),
    getDocs(collection(database, 'users')),
  ])

  const users = new Map<string, { nombre?: string; email?: string; rol?: string }>()
  for (const snapshot of usersSnapshot.docs) {
    const data = snapshot.data()
    users.set(snapshot.id, {
      nombre: asString(data.displayName) || asString(data.nombre) || undefined,
      email: asString(data.email) || undefined,
      rol: asString(data.role) || undefined,
    })
  }

  return auditSnapshot.docs
    .map((snapshot) => {
      const data = snapshot.data()
      const action = asString(data.action) || 'EVENT'
      const entity = asString(data.entity) || 'sistema'
      const actorUid = asString(data.actorUid)
      const currentUser = users.get(actorUid)
      const actorNombre = asString(data.actorNombre) || currentUser?.nombre || actorUid || 'Sistema'

      return {
        id: snapshot.id,
        action,
        actionLabel: humanizeAction(action),
        entity,
        entityId: asString(data.entityId),
        modulo: moduleFrom(data, action, entity),
        actorUid,
        actorNombre,
        actorEmail: asString(data.actorEmail) || currentUser?.email,
        actorRol: asString(data.actorRol) || currentUser?.rol,
        createdAt: data.createdAt as Timestamp | undefined,
        fechaMovimiento: asString(data.fechaMovimiento) || asString(data.fecha) || undefined,
        concepto: asString(data.concepto) || undefined,
        categoria: asString(data.categoria) || undefined,
        socioId: asString(data.socioId) || undefined,
        periodo: asString(data.periodo) || undefined,
        importe: asOptionalNumber(data.importe),
        motivo: asString(data.motivo) || asString(data.reason) || undefined,
        authMethod: asString(data.authMethod) || undefined,
      } satisfies AuditEvent
    })
    .sort((a, b) => {
      const aMillis = a.createdAt?.toMillis() ?? 0
      const bMillis = b.createdAt?.toMillis() ?? 0
      return bMillis - aMillis || b.id.localeCompare(a.id)
    })
}
