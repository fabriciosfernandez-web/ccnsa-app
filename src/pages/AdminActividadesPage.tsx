import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AdminPageHeader } from '../components/AdminPageHeader'
import { useAuth } from '../auth/AuthProvider'
import {
  anularMovimientoActividad,
  createActividad,
  createMovimientoActividad,
  loadActividades,
  setActividadEstado,
  type Actividad,
  type ActividadActor,
  type ActividadEstado,
  type ActividadTipo,
  type ActividadesSnapshot,
  type MovimientoActividad,
  type MovimientoActividadTipo,
  type NuevaActividad,
  type NuevoMovimientoActividad,
} from '../data/actividades'
import './admin-actividades.css'

const TYPE_LABELS: Record<ActividadTipo, string> = {
  RETIRO: 'Retiro',
  SAN_JUAN: 'San Juan',
  CLUB_DAMAS: 'Club de Damas',
  ACADEMIA: 'Academia',
  OTRO: 'Otra actividad',
}

const STATE_LABELS: Record<ActividadEstado, string> = {
  PLANIFICADA: 'Planificada',
  ACTIVA: 'Activa',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
}

const MOVEMENT_CATEGORIES = [
  'Inscripciones',
  'Aportes',
  'Donaciones',
  'Alquiler',
  'Alimentos',
  'Transporte',
  'Materiales',
  'Servicios',
  'Otros',
]

function localIsoDate() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function money(value: number) {
  return `Gs. ${Math.round(value).toLocaleString('es-PY')}`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.'
}

function statusClass(status: ActividadEstado) {
  if (status === 'ACTIVA') return 'success'
  if (status === 'CANCELADA') return 'danger'
  return 'neutral'
}

function csvCell(value: string | number) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export function AdminActividadesPage() {
  const { user, profile } = useAuth()
  const today = useMemo(localIsoDate, [])
  const canWrite = profile?.role === 'ADMIN' || profile?.role === 'TESORERIA'
  const [snapshot, setSnapshot] = useState<ActividadesSnapshot>({ actividades: [], movimientos: [] })
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<'TODAS' | ActividadEstado>('TODAS')
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [showMovementForm, setShowMovementForm] = useState(false)
  const [voidTarget, setVoidTarget] = useState<MovimientoActividad | null>(null)
  const [voidReason, setVoidReason] = useState('')

  const actor = useMemo<ActividadActor | null>(() => {
    if (!user || !profile) return null
    return {
      uid: user.uid,
      nombre: profile.displayName,
      email: profile.email,
      rol: profile.role,
    }
  }, [user, profile])

  const refresh = useCallback(async (preferredId?: string) => {
    try {
      setLoading(true)
      setError('')
      const data = await loadActividades()
      setSnapshot(data)
      setSelectedId((current) => {
        const candidate = preferredId || current
        if (candidate && data.actividades.some((item) => item.id === candidate)) return candidate
        return data.actividades[0]?.id || ''
      })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selected = snapshot.actividades.find((item) => item.id === selectedId)
  const selectedMovements = useMemo(
    () => snapshot.movimientos.filter((item) => item.actividadId === selectedId),
    [snapshot.movimientos, selectedId],
  )

  const filteredActivities = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('es')
    return snapshot.actividades.filter((item) => {
      if (stateFilter !== 'TODAS' && item.estado !== stateFilter) return false
      if (!needle) return true
      return `${item.nombre} ${TYPE_LABELS[item.tipo]} ${item.descripcion ?? ''}`.toLocaleLowerCase('es').includes(needle)
    })
  }, [snapshot.actividades, search, stateFilter])

  const selectedTotals = useMemo(() => {
    let ingresos = 0
    let egresos = 0
    for (const item of selectedMovements) {
      if (item.estado === 'ANULADO') continue
      if (item.tipo === 'INGRESO') ingresos += item.importe
      else egresos += item.importe
    }
    return { ingresos, egresos, resultado: ingresos - egresos }
  }, [selectedMovements])

  const globalTotals = useMemo(() => {
    let ingresos = 0
    let egresos = 0
    for (const item of snapshot.movimientos) {
      if (item.estado === 'ANULADO') continue
      if (item.tipo === 'INGRESO') ingresos += item.importe
      else egresos += item.importe
    }
    return {
      activas: snapshot.actividades.filter((item) => item.estado === 'ACTIVA').length,
      ingresos,
      egresos,
      resultado: ingresos - egresos,
    }
  }, [snapshot])

  async function submitActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!actor || !canWrite || busy) return
    const form = event.currentTarget
    const data = new FormData(form)
    const presupuestoRaw = String(data.get('presupuesto') || '').trim()
    const input: NuevaActividad = {
      nombre: String(data.get('nombre') || ''),
      tipo: String(data.get('tipo') || 'OTRO') as ActividadTipo,
      fechaInicio: String(data.get('fechaInicio') || ''),
      fechaFin: String(data.get('fechaFin') || '') || undefined,
      estado: String(data.get('estado') || 'PLANIFICADA') as ActividadEstado,
      descripcion: String(data.get('descripcion') || ''),
      presupuesto: presupuestoRaw ? Number(presupuestoRaw) : undefined,
    }

    try {
      setBusy(true)
      setError('')
      setSuccess('')
      const id = await createActividad(input, actor)
      setShowActivityForm(false)
      setSuccess('Actividad creada y registrada en Auditoría.')
      await refresh(id)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!actor || !canWrite || !selected || busy) return
    const form = event.currentTarget
    const data = new FormData(form)
    const input: NuevoMovimientoActividad = {
      tipo: String(data.get('tipo') || 'INGRESO') as MovimientoActividadTipo,
      fecha: String(data.get('fecha') || ''),
      concepto: String(data.get('concepto') || ''),
      categoria: String(data.get('categoria') || 'Otros'),
      importe: Number(data.get('importe') || 0),
      medioPago: String(data.get('medioPago') || ''),
      referencia: String(data.get('referencia') || ''),
    }

    try {
      setBusy(true)
      setError('')
      setSuccess('')
      await createMovimientoActividad(selected.id, input, actor)
      setShowMovementForm(false)
      setSuccess('Movimiento registrado. Su impacto ya quedó integrado al balance general de Finanzas.')
      await refresh(selected.id)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(next: ActividadEstado) {
    if (!actor || !canWrite || !selected || busy || next === selected.estado) return
    try {
      setBusy(true)
      setError('')
      setSuccess('')
      await setActividadEstado(selected.id, next, actor)
      setSuccess(`Estado actualizado a ${STATE_LABELS[next]}.`)
      await refresh(selected.id)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function confirmVoid() {
    if (!actor || !canWrite || !voidTarget || busy) return
    try {
      setBusy(true)
      setError('')
      setSuccess('')
      await anularMovimientoActividad(voidTarget.id, voidReason, actor)
      setVoidTarget(null)
      setVoidReason('')
      setSuccess('Movimiento anulado tanto en la actividad como en el balance general.')
      await refresh(selectedId)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  function exportSelected() {
    if (!selected) return
    const rows: (string | number)[][] = [
      ['CENTRO CULTURAL CCNSA'],
      ['Estado de actividad', selected.nombre],
      ['Tipo', TYPE_LABELS[selected.tipo]],
      ['Estado', STATE_LABELS[selected.estado]],
      ['Inicio', selected.fechaInicio],
      ['Fin', selected.fechaFin ?? ''],
      ['Presupuesto', selected.presupuesto ?? ''],
      [],
      ['RESUMEN'],
      ['Ingresos', selectedTotals.ingresos],
      ['Egresos', selectedTotals.egresos],
      ['Resultado', selectedTotals.resultado],
      [],
      ['MOVIMIENTOS'],
      ['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Importe', 'Estado', 'Medio', 'Referencia', 'Motivo de anulación'],
      ...selectedMovements.map((item) => [
        item.fecha,
        item.tipo,
        item.concepto,
        item.categoria,
        item.importe,
        item.estado,
        item.medioPago ?? '',
        item.referencia ?? '',
        item.anulacionMotivo ?? '',
      ]),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map((value) => csvCell(value)).join(';')).join('\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ccnsa-actividad-${selected.nombre.toLocaleLowerCase('es').replace(/[^a-z0-9]+/gi, '-')}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="page-stack legacy-page-stack activities-page">
      <AdminPageHeader
        eyebrow="Gestión de iniciativas"
        title="Actividades"
        description="Subcontabilidad por actividad integrada al balance general. Cada ingreso o egreso se registra una sola vez y mantiene trazabilidad hasta Finanzas y Auditoría."
        actions={canWrite ? <button className="button primary" type="button" onClick={() => setShowActivityForm(true)}>Nueva actividad</button> : undefined}
      />

      {error && <div className="notice error"><strong>Actividades.</strong> {error}</div>}
      {success && <div className="notice socios-success">{success}</div>}

      <div className="metric-grid legacy-metric-grid activities-global-metrics">
        <article className="metric-card legacy-metric-card"><span>Actividades activas</span><strong>{loading ? '—' : globalTotals.activas}</strong><small>{snapshot.actividades.length} actividad(es) registrada(s).</small></article>
        <article className="metric-card legacy-metric-card"><span>Ingresos de actividades</span><strong>{loading ? '—' : money(globalTotals.ingresos)}</strong><small>Consolidados en Finanzas sin duplicación.</small></article>
        <article className="metric-card legacy-metric-card"><span>Egresos de actividades</span><strong>{loading ? '—' : money(globalTotals.egresos)}</strong><small>Salidas vigentes asociadas a actividades.</small></article>
        <article className="metric-card legacy-metric-card"><span>Resultado acumulado</span><strong>{loading ? '—' : money(globalTotals.resultado)}</strong><small>Ingresos menos egresos de todas las actividades.</small></article>
      </div>

      <div className="activities-layout">
        <aside className="panel legacy-panel activities-list-panel">
          <div className="panel-heading-row">
            <div><p className="legacy-kicker">Portafolio</p><h3>Actividades</h3></div>
            <span className="status-badge neutral">{filteredActivities.length}</span>
          </div>
          <div className="activities-list-filters">
            <input aria-label="Buscar actividad" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar actividad…" />
            <select aria-label="Filtrar por estado" value={stateFilter} onChange={(event) => setStateFilter(event.target.value as 'TODAS' | ActividadEstado)}>
              <option value="TODAS">Todos los estados</option>
              <option value="PLANIFICADA">Planificadas</option>
              <option value="ACTIVA">Activas</option>
              <option value="CERRADA">Cerradas</option>
              <option value="CANCELADA">Canceladas</option>
            </select>
          </div>
          <div className="activities-list">
            {loading ? <p className="muted">Cargando actividades…</p> : filteredActivities.length === 0 ? <p className="muted">No hay actividades que coincidan con los filtros.</p> : filteredActivities.map((item) => (
              <button key={item.id} className={`activity-list-row ${item.id === selectedId ? 'selected' : ''}`} type="button" onClick={() => setSelectedId(item.id)}>
                <span className="activity-list-copy"><strong>{item.nombre}</strong><small>{TYPE_LABELS[item.tipo]} · {item.fechaInicio}</small></span>
                <span className={`status-badge ${statusClass(item.estado)}`}>{STATE_LABELS[item.estado]}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="activities-detail-stack">
          {!selected ? (
            <article className="panel legacy-panel activities-empty">
              <h3>{loading ? 'Cargando…' : 'Todavía no hay actividades'}</h3>
              <p>{loading ? 'Estamos preparando el módulo.' : 'Creá una actividad para comenzar a llevar su subcontabilidad.'}</p>
            </article>
          ) : (
            <>
              <article className="panel legacy-panel activity-summary-panel">
                <div className="activity-summary-main">
                  <div>
                    <div className="activity-title-line"><h3>{selected.nombre}</h3><span className={`status-badge ${statusClass(selected.estado)}`}>{STATE_LABELS[selected.estado]}</span></div>
                    <p>{TYPE_LABELS[selected.tipo]} · {selected.fechaInicio}{selected.fechaFin ? ` → ${selected.fechaFin}` : ''}</p>
                    {selected.descripcion && <p className="activity-description">{selected.descripcion}</p>}
                  </div>
                  <div className="activity-summary-actions">
                    <button className="button secondary" type="button" onClick={exportSelected}>Exportar CSV</button>
                    {canWrite && selected.estado !== 'CERRADA' && selected.estado !== 'CANCELADA' && <button className="button primary" type="button" onClick={() => setShowMovementForm(true)}>Registrar movimiento</button>}
                  </div>
                </div>
                {canWrite && selected.estado !== 'CERRADA' && selected.estado !== 'CANCELADA' && (
                  <label className="activity-state-control">Estado<select value={selected.estado} disabled={busy} onChange={(event) => void changeStatus(event.target.value as ActividadEstado)}><option value="PLANIFICADA">Planificada</option><option value="ACTIVA">Activa</option><option value="CERRADA">Cerrada</option><option value="CANCELADA">Cancelada</option></select></label>
                )}
              </article>

              <div className="metric-grid legacy-metric-grid activity-metrics">
                <article className="metric-card legacy-metric-card"><span>Ingresos</span><strong>{money(selectedTotals.ingresos)}</strong><small>Movimientos vigentes de entrada.</small></article>
                <article className="metric-card legacy-metric-card"><span>Egresos</span><strong>{money(selectedTotals.egresos)}</strong><small>Movimientos vigentes de salida.</small></article>
                <article className="metric-card legacy-metric-card"><span>Resultado</span><strong>{money(selectedTotals.resultado)}</strong><small>{selected.presupuesto !== undefined ? `Presupuesto referencial ${money(selected.presupuesto)}.` : 'Sin presupuesto referencial cargado.'}</small></article>
              </div>

              <article className="panel legacy-panel activities-ledger-panel">
                <div className="panel-heading-row">
                  <div><p className="legacy-kicker">Subcontabilidad</p><h3>Movimientos de la actividad</h3><p className="muted">Los movimientos vigentes ya forman parte del balance general de Finanzas.</p></div>
                  <span className="status-badge neutral">{selectedMovements.length}</span>
                </div>
                {selectedMovements.length === 0 ? (
                  <div className="activities-empty-state"><strong>Sin movimientos todavía</strong><span>Registrá el primer ingreso o egreso cuando corresponda.</span></div>
                ) : (
                  <div className="legacy-table-wrap activities-table-wrap">
                    <table className="legacy-table activities-table">
                      <thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Categoría</th><th>Importe</th><th>Estado</th><th>Referencia</th><th /></tr></thead>
                      <tbody>{selectedMovements.map((item) => (
                        <tr key={item.id} className={item.estado === 'ANULADO' ? 'activity-voided-row' : ''}>
                          <td>{item.fecha}</td>
                          <td><span className={`activity-type ${item.tipo.toLocaleLowerCase('es')}`}>{item.tipo}</span></td>
                          <td><strong>{item.concepto}</strong>{item.anulacionMotivo && <small className="activity-void-reason">{item.anulacionMotivo}</small>}</td>
                          <td>{item.categoria}</td>
                          <td className="activity-money">{money(item.importe)}</td>
                          <td><span className={`status-badge ${item.estado === 'REGISTRADO' ? 'success' : 'neutral'}`}>{item.estado}</span></td>
                          <td>{item.referencia || '—'}</td>
                          <td>{canWrite && item.estado === 'REGISTRADO' && <button className="button secondary activity-inline-button" type="button" onClick={() => { setVoidTarget(item); setVoidReason('') }}>Anular</button>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </article>
            </>
          )}
        </div>
      </div>

      {showActivityForm && (
        <div className="activity-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setShowActivityForm(false) }}>
          <section className="activity-modal" role="dialog" aria-modal="true" aria-labelledby="new-activity-title">
            <div className="activity-modal-header"><div><p className="legacy-kicker">Nueva iniciativa</p><h3 id="new-activity-title">Crear actividad</h3></div><button className="activity-modal-close" type="button" onClick={() => setShowActivityForm(false)} disabled={busy} aria-label="Cerrar">×</button></div>
            <form className="activity-form" onSubmit={submitActivity}>
              <label className="activity-wide">Nombre<input name="nombre" required placeholder="Ej.: Retiro de Adviento 2026" /></label>
              <label>Tipo<select name="tipo" defaultValue="RETIRO"><option value="RETIRO">Retiro</option><option value="SAN_JUAN">San Juan</option><option value="CLUB_DAMAS">Club de Damas</option><option value="ACADEMIA">Academia</option><option value="OTRO">Otra actividad</option></select></label>
              <label>Estado inicial<select name="estado" defaultValue="PLANIFICADA"><option value="PLANIFICADA">Planificada</option><option value="ACTIVA">Activa</option></select></label>
              <label>Inicio<input name="fechaInicio" type="date" defaultValue={today} required /></label>
              <label>Fin previsto<input name="fechaFin" type="date" /></label>
              <label className="activity-wide">Presupuesto referencial<input name="presupuesto" type="number" min="0" placeholder="Opcional" /></label>
              <label className="activity-wide">Descripción<textarea name="descripcion" rows={3} placeholder="Objetivo o alcance de la actividad" /></label>
              <div className="activity-modal-actions activity-wide"><button className="button secondary" type="button" onClick={() => setShowActivityForm(false)} disabled={busy}>Cancelar</button><button className="button primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Crear actividad'}</button></div>
            </form>
          </section>
        </div>
      )}

      {showMovementForm && selected && (
        <div className="activity-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setShowMovementForm(false) }}>
          <section className="activity-modal" role="dialog" aria-modal="true" aria-labelledby="new-movement-title">
            <div className="activity-modal-header"><div><p className="legacy-kicker">{selected.nombre}</p><h3 id="new-movement-title">Registrar movimiento</h3></div><button className="activity-modal-close" type="button" onClick={() => setShowMovementForm(false)} disabled={busy} aria-label="Cerrar">×</button></div>
            <div className="notice activities-integration-note">Se crea simultáneamente el movimiento contable en Finanzas. No debe volver a cargarse allí manualmente.</div>
            <form className="activity-form" onSubmit={submitMovement}>
              <label>Tipo<select name="tipo" defaultValue="INGRESO"><option value="INGRESO">Ingreso</option><option value="EGRESO">Egreso</option></select></label>
              <label>Fecha<input name="fecha" type="date" defaultValue={today} required /></label>
              <label className="activity-wide">Concepto<input name="concepto" required placeholder="Ej.: Inscripciones" /></label>
              <label>Categoría<select name="categoria" defaultValue="Inscripciones">{MOVEMENT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
              <label>Importe<input name="importe" type="number" min="1" required /></label>
              <label>Medio<select name="medioPago" defaultValue="TRANSFERENCIA"><option value="TRANSFERENCIA">Transferencia</option><option value="EFECTIVO">Efectivo</option><option value="OTRO">Otro</option></select></label>
              <label>Referencia<input name="referencia" placeholder="Opcional" /></label>
              <div className="activity-modal-actions activity-wide"><button className="button secondary" type="button" onClick={() => setShowMovementForm(false)} disabled={busy}>Cancelar</button><button className="button primary" type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Registrar movimiento'}</button></div>
            </form>
          </section>
        </div>
      )}

      {voidTarget && (
        <div className="activity-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setVoidTarget(null) }}>
          <section className="activity-modal activity-void-modal" role="dialog" aria-modal="true" aria-labelledby="void-movement-title">
            <div className="activity-modal-header"><div><p className="legacy-kicker">Corrección auditable</p><h3 id="void-movement-title">Anular movimiento</h3></div><button className="activity-modal-close" type="button" onClick={() => setVoidTarget(null)} disabled={busy} aria-label="Cerrar">×</button></div>
            <p>Se anulará <strong>{voidTarget.concepto}</strong> por {money(voidTarget.importe)} tanto en la actividad como en Finanzas. El registro original permanecerá visible.</p>
            <label className="activity-void-reason-field">Motivo<textarea rows={3} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Motivo de la corrección" /></label>
            <div className="activity-modal-actions"><button className="button secondary" type="button" onClick={() => setVoidTarget(null)} disabled={busy}>Cancelar</button><button className="button primary" type="button" onClick={() => void confirmVoid()} disabled={busy || voidReason.trim().length < 5}>{busy ? 'Anulando…' : 'Confirmar anulación'}</button></div>
          </section>
        </div>
      )}
    </section>
  )
}
