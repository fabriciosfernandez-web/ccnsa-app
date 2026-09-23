import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAuth, userRoleLabel } from '../auth/AuthProvider'
import { AdminPageHeader } from '../components/AdminPageHeader'
import { loadAuditEvents, type AuditEvent } from '../data/auditoria'
import { downloadManualFirestoreSnapshot } from '../data/exportacion'
import './admin-auditoria.css'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible cargar la auditoría.'
}

function money(value?: number) {
  if (value === undefined) return '—'
  return `Gs. ${Math.round(value).toLocaleString('es-PY')}`
}

function formatDate(value?: { toDate: () => Date }) {
  if (!value) return '—'
  const date = value.toDate()
  const day = new Intl.DateTimeFormat('es-PY', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
  const time = new Intl.DateTimeFormat('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
  return `${day} · ${time}`
}

function formatExactDate(value?: { toDate: () => Date }) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'medium', timeStyle: 'medium' }).format(value.toDate())
}

function localIsoDate(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function eventDetail(item: AuditEvent) {
  if (item.concepto) return item.concepto
  if (item.entity === 'ingresos') return 'Ingreso financiero'
  if (item.entity === 'egresos') return 'Egreso financiero'
  if (item.entity === 'pagos') return 'Pago de socio'
  if (item.entity === 'obligaciones') return 'Obligación'
  if (item.entity === 'socios') return 'Socio'
  if (item.entity === 'actividades') return 'Actividad'
  if (item.entity === 'movimientos_actividad') return 'Movimiento de actividad'
  if (item.entity === 'auth_session') return 'Sesión de usuario'
  return item.entity || 'Evento del sistema'
}

function csvCell(value: string | number) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export function AdminAuditoriaPage() {
  const { user, profile } = useAuth()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [moduleFilter, setModuleFilter] = useState('TODOS')
  const [roleFilter, setRoleFilter] = useState('TODOS')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [snapshotExporting, setSnapshotExporting] = useState(false)
  const [snapshotMessage, setSnapshotMessage] = useState('')

  useEffect(() => {
    let active = true
    void loadAuditEvents()
      .then((data) => {
        if (active) setEvents(data)
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const modules = useMemo(
    () => [...new Set(events.map((item) => item.modulo))].sort((a, b) => a.localeCompare(b, 'es')),
    [events],
  )

  const roles = useMemo(
    () => [...new Set(events.map((item) => item.actorRol).filter((value): value is string => Boolean(value)))].sort(),
    [events],
  )

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('es')
    return events.filter((item) => {
      if (moduleFilter !== 'TODOS' && item.modulo !== moduleFilter) return false
      if (roleFilter !== 'TODOS' && item.actorRol !== roleFilter) return false
      if (!needle) return true
      const haystack = [
        item.actionLabel,
        item.action,
        item.modulo,
        item.actorNombre,
        item.actorEmail,
        item.actorRol,
        userRoleLabel(item.actorRol),
        item.actorUid,
        item.concepto,
        item.entity,
        item.entityId,
        item.socioId,
        item.periodo,
        item.motivo,
        item.authMethod,
      ].filter(Boolean).join(' ').toLocaleLowerCase('es')
      return haystack.includes(needle)
    })
  }, [events, moduleFilter, roleFilter, search])

  const uniqueActors = useMemo(
    () => new Set(events.map((item) => item.actorUid).filter(Boolean)).size,
    [events],
  )

  const todayCount = useMemo(() => {
    const today = localIsoDate()
    return events.filter((item) => item.createdAt && localIsoDate(item.createdAt.toDate()) === today).length
  }, [events])

  async function exportManualSnapshot() {
    if (!user || profile?.role !== 'ADMIN' || snapshotExporting) return
    try {
      setSnapshotExporting(true)
      setSnapshotMessage('')
      const result = await downloadManualFirestoreSnapshot(user.uid)
      setSnapshotMessage(
        `Snapshot manual generado: ${result.documents} documento(s) en ${result.collections} colecciones.`,
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSnapshotExporting(false)
    }
  }

  function exportCsv() {
    const rows: (string | number)[][] = [
      ['CENTRO CULTURAL CCNSA'],
      ['Registro de auditoría'],
      ['Generado', new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())],
      [],
      ['Fecha/hora', 'Módulo', 'Acción', 'Usuario', 'Perfil / comité', 'Rol técnico', 'Email', 'UID', 'Método de acceso', 'Entidad', 'ID entidad', 'Concepto', 'Importe', 'Motivo'],
      ...filtered.map((item) => [
        formatExactDate(item.createdAt),
        item.modulo,
        item.actionLabel,
        item.actorNombre,
        userRoleLabel(item.actorRol),
        item.actorRol ?? '',
        item.actorEmail ?? '',
        item.actorUid,
        item.authMethod ?? '',
        item.entity,
        item.entityId,
        item.concepto ?? '',
        item.importe ?? '',
        item.motivo ?? '',
      ]),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map((value) => csvCell(value ?? '')).join(';')).join('\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ccnsa-auditoria-${localIsoDate()}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="page-stack legacy-page-stack audit-page">
      <AdminPageHeader
        eyebrow="Control y trazabilidad"
        title="Auditoría"
        description="Registro centralizado de accesos, acciones administrativas y financieras. Los eventos son inmutables y conservan el usuario responsable de cada operación."
        actions={(
          <>
            <button className="button secondary" type="button" onClick={exportCsv} disabled={loading || filtered.length === 0}>
              Exportar auditoría CSV
            </button>
            {profile?.role === 'ADMIN' && (
              <button className="button secondary" type="button" onClick={() => void exportManualSnapshot()} disabled={snapshotExporting}>
                {snapshotExporting ? 'Generando snapshot…' : 'Exportar snapshot JSON'}
              </button>
            )}
          </>
        )}
      />

      {error && <div className="notice error">{error}</div>}
      {snapshotMessage && <div className="notice socios-success">{snapshotMessage} Es una copia manual de contingencia; no reemplaza PITR ni backups administrados.</div>}

      <div className="metric-grid legacy-metric-grid audit-metrics">
        <article className="metric-card legacy-metric-card"><span>Eventos registrados</span><strong>{events.length}</strong><small>Historial auditable disponible.</small></article>
        <article className="metric-card legacy-metric-card"><span>Usuarios con actividad</span><strong>{uniqueActors}</strong><small>Actores identificados en el registro.</small></article>
        <article className="metric-card legacy-metric-card"><span>Eventos de hoy</span><strong>{todayCount}</strong><small>Según fecha y hora de registro.</small></article>
      </div>

      <article className="panel legacy-panel audit-panel">
        <div className="panel-heading-row">
          <div>
            <p className="legacy-kicker">Registro central</p>
            <h3>Eventos auditables</h3>
          </div>
          <span className="status-badge neutral">{filtered.length} de {events.length}</span>
        </div>

        <div className="audit-filters">
          <label>Módulo<select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}><option value="TODOS">Todos</option>{modules.map((module) => <option key={module} value={module}>{module}</option>)}</select></label>
          <label>Perfil / comité<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="TODOS">Todos</option>{roles.map((role) => <option key={role} value={role}>{userRoleLabel(role)}</option>)}</select></label>
          <label className="audit-search">Buscar<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Usuario, acción, concepto, motivo…" /></label>
        </div>

        <div className="legacy-table-wrap audit-table-wrap">
          <table className="legacy-table audit-table">
            <thead><tr><th>Fecha / hora</th><th>Módulo</th><th>Acción</th><th>Usuario</th><th>Detalle</th><th>Importe</th><th>Motivo</th><th aria-label="Más detalle" /></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}>Cargando registro de auditoría…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8}>No hay eventos que coincidan con los filtros.</td></tr>
              ) : filtered.map((item) => {
                const expanded = expandedId === item.id
                return (
                  <Fragment key={item.id}>
                    <tr className={expanded ? 'audit-row-expanded' : ''}>
                      <td className="audit-date">{formatDate(item.createdAt)}</td>
                      <td><span className="audit-module">{item.modulo}</span></td>
                      <td><strong>{item.actionLabel}</strong></td>
                      <td className="audit-user"><strong>{item.actorNombre}</strong><small>{userRoleLabel(item.actorRol)}</small></td>
                      <td><strong>{eventDetail(item)}</strong><small className="audit-secondary">{item.periodo ? `Periodo ${item.periodo}` : item.modulo}</small></td>
                      <td className="audit-amount">{money(item.importe)}</td>
                      <td className="audit-reason">{item.motivo || '—'}</td>
                      <td className="audit-expand-cell"><button className="audit-expand-button" type="button" aria-expanded={expanded} aria-label={expanded ? 'Ocultar detalle técnico' : 'Ver detalle técnico'} onClick={() => setExpandedId(expanded ? null : item.id)}>{expanded ? '−' : '+'}</button></td>
                    </tr>
                    {expanded && (
                      <tr className="audit-detail-row">
                        <td colSpan={8}>
                          <div className="audit-detail-grid">
                            <div><span>Fecha exacta</span><strong>{formatExactDate(item.createdAt)}</strong></div>
                            <div><span>Usuario</span><strong>{item.actorNombre}</strong><small>{item.actorEmail || 'Sin email registrado'}</small></div>
                            <div><span>Perfil visible</span><strong>{userRoleLabel(item.actorRol)}</strong><small>Rol técnico: {item.actorRol || '—'}</small></div>
                            <div><span>UID</span><code>{item.actorUid || '—'}</code></div>
                            <div><span>Acción técnica</span><code>{item.action}</code></div>
                            {item.authMethod && <div><span>Método de acceso</span><strong>{item.authMethod}</strong></div>}
                            <div><span>Entidad</span><strong>{item.entity || '—'}</strong><small>{item.entityId || 'Sin ID de entidad'}</small></div>
                            {item.periodo && <div><span>Período</span><strong>{item.periodo}</strong></div>}
                            {item.socioId && <div><span>Socio ID</span><code>{item.socioId}</code></div>}
                            {item.categoria && <div><span>Categoría</span><strong>{item.categoria}</strong></div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}
