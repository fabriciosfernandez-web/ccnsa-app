import { useEffect, useMemo, useState } from 'react'
import { AdminPageHeader } from '../components/AdminPageHeader'
import { loadAuditEvents, type AuditEvent } from '../data/auditoria'
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
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'medium' }).format(value.toDate())
}

function csvCell(value: string | number) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export function AdminAuditoriaPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [moduleFilter, setModuleFilter] = useState('TODOS')
  const [roleFilter, setRoleFilter] = useState('TODOS')
  const [search, setSearch] = useState('')

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
        item.concepto,
        item.entity,
        item.entityId,
        item.socioId,
        item.periodo,
        item.motivo,
      ].filter(Boolean).join(' ').toLocaleLowerCase('es')
      return haystack.includes(needle)
    })
  }, [events, moduleFilter, roleFilter, search])

  const uniqueActors = useMemo(
    () => new Set(events.map((item) => item.actorUid).filter(Boolean)).size,
    [events],
  )

  const todayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return events.filter((item) => item.createdAt?.toDate().toISOString().slice(0, 10) === today).length
  }, [events])

  function exportCsv() {
    const rows: (string | number)[][] = [
      ['CENTRO CULTURAL CCNSA'],
      ['Registro de auditoría'],
      ['Generado', new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())],
      [],
      ['Fecha/hora', 'Módulo', 'Acción', 'Usuario', 'Rol', 'Email', 'UID', 'Entidad', 'ID entidad', 'Concepto', 'Importe', 'Motivo'],
      ...filtered.map((item) => [
        formatDate(item.createdAt),
        item.modulo,
        item.actionLabel,
        item.actorNombre,
        item.actorRol ?? '',
        item.actorEmail ?? '',
        item.actorUid,
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
    anchor.download = `ccnsa-auditoria-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="page-stack legacy-page-stack audit-page">
      <AdminPageHeader
        eyebrow="Control y trazabilidad"
        title="Auditoría"
        description="Registro centralizado de acciones administrativas y financieras. Los eventos son inmutables y conservan el usuario responsable de cada operación."
        actions={(
          <button className="button secondary" type="button" onClick={exportCsv} disabled={loading || filtered.length === 0}>
            Exportar auditoría CSV
          </button>
        )}
      />

      {error && <div className="notice error">{error}</div>}

      <div className="metric-grid legacy-metric-grid audit-metrics">
        <article className="metric-card legacy-metric-card"><span>Eventos registrados</span><strong>{events.length}</strong><small>Historial disponible en audit_log.</small></article>
        <article className="metric-card legacy-metric-card"><span>Usuarios con actividad</span><strong>{uniqueActors}</strong><small>Identificados por UID y snapshot de usuario.</small></article>
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
          <label>Rol<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="TODOS">Todos</option>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
          <label className="audit-search">Buscar<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Usuario, acción, concepto, motivo…" /></label>
        </div>

        <div className="legacy-table-wrap audit-table-wrap">
          <table className="legacy-table audit-table">
            <thead><tr><th>Fecha / hora</th><th>Módulo</th><th>Acción</th><th>Usuario</th><th>Rol</th><th>Detalle</th><th>Importe</th><th>Motivo</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}>Cargando registro de auditoría…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8}>No hay eventos que coincidan con los filtros.</td></tr>
              ) : filtered.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.createdAt)}</td>
                  <td><span className="audit-module">{item.modulo}</span></td>
                  <td><strong>{item.actionLabel}</strong><small className="audit-secondary">{item.action}</small></td>
                  <td className="audit-user"><strong>{item.actorNombre}</strong>{item.actorEmail && <small>{item.actorEmail}</small>}{item.actorUid && <small>UID: {item.actorUid}</small>}</td>
                  <td>{item.actorRol || '—'}</td>
                  <td><strong>{item.concepto || item.entityId || item.entity}</strong><small className="audit-secondary">{item.entity}{item.periodo ? ` · ${item.periodo}` : ''}</small></td>
                  <td>{money(item.importe)}</td>
                  <td>{item.motivo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}
