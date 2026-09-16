import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  anularMovimientoFinanciero,
  createEgreso,
  createIngresoManual,
  loadFinanzas,
  type FinanzasSnapshot,
  type MovimientoFinancieroTipo,
  type MovimientoEstado,
  type NuevoMovimientoFinanciero,
} from '../data/finanzas'
import './admin-finanzas.css'

const money = (value: number) => `Gs. ${Math.round(value).toLocaleString('es-PY')}`

function localIsoDate() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.'
}

function csvCell(value: string | number) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function formatAuditDate(value?: { toDate: () => Date }) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(value.toDate())
}

const INGRESO_CATEGORIES = [
  ['DONACION', 'Donación'],
  ['ACADEMIA', 'Academia'],
  ['CLUB_DAMAS', 'Club de Damas'],
  ['ACTIVIDAD', 'Actividad'],
  ['OTRO', 'Otro ingreso'],
] as const

const EGRESO_CATEGORIES = [
  ['ALQUILER', 'Alquiler'],
  ['SERVICIOS', 'Servicios'],
  ['ACTIVIDAD', 'Actividad'],
  ['MANTENIMIENTO', 'Mantenimiento'],
  ['ADMINISTRATIVO', 'Administrativo'],
  ['OTRO', 'Otro egreso'],
] as const

const AUDIT_LABELS: Record<string, string> = {
  INGRESO_CREATED: 'Ingreso registrado',
  EGRESO_CREATED: 'Egreso registrado',
  INGRESO_VOIDED: 'Ingreso anulado',
  EGRESO_VOIDED: 'Egreso anulado',
}

interface FinanceMovement {
  id: string
  recordId: string
  fecha: string
  tipo: 'INGRESO' | 'EGRESO'
  origen: string
  concepto: string
  categoria: string
  importe: number
  referencia: string
  estado: MovimientoEstado
  anulacionMotivo?: string
  anulable: boolean
}

function movementFromForm(form: HTMLFormElement): NuevoMovimientoFinanciero {
  const data = new FormData(form)
  return {
    fecha: String(data.get('fecha') || ''),
    concepto: String(data.get('concepto') || ''),
    categoria: String(data.get('categoria') || ''),
    importe: Number(data.get('importe') || 0),
    medioPago: String(data.get('medioPago') || ''),
    referencia: String(data.get('referencia') || ''),
  }
}

export function AdminFinanzasPage() {
  const { user, profile } = useAuth()
  const today = useMemo(localIsoDate, [])
  const [periodo, setPeriodo] = useState(today.slice(0, 7))
  const [snapshot, setSnapshot] = useState<FinanzasSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'INGRESO' | 'EGRESO' | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [tipoFilter, setTipoFilter] = useState<'TODOS' | 'INGRESO' | 'EGRESO'>('TODOS')
  const [categoryFilter, setCategoryFilter] = useState('TODAS')
  const [search, setSearch] = useState('')
  const [showVoided, setShowVoided] = useState(false)
  const [annulTarget, setAnnulTarget] = useState<FinanceMovement | null>(null)
  const [annulReason, setAnnulReason] = useState('')
  const [annulling, setAnnulling] = useState(false)

  const canWrite = profile?.role === 'ADMIN' || profile?.role === 'TESORERIA'

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      setSnapshot(await loadFinanzas(periodo))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [periodo])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function submitIngreso(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !canWrite || saving) return
    const form = event.currentTarget
    const movement = movementFromForm(form)
    try {
      setSaving('INGRESO')
      setError('')
      setSuccess('')
      await createIngresoManual(movement, user.uid)
      form.reset()
      setSuccess('Ingreso registrado. El movimiento quedó trazado en audit_log.')
      await refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(null)
    }
  }

  async function submitEgreso(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !canWrite || saving) return
    const form = event.currentTarget
    const movement = movementFromForm(form)
    try {
      setSaving('EGRESO')
      setError('')
      setSuccess('')
      await createEgreso(movement, user.uid)
      form.reset()
      setSuccess('Egreso registrado. El movimiento quedó trazado en audit_log.')
      await refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(null)
    }
  }

  const movements = useMemo<FinanceMovement[]>(() => {
    if (!snapshot) return []
    return [
      ...snapshot.cobrosSocios.map((item) => ({
        id: `pago-${item.id}`,
        recordId: item.id,
        fecha: item.fecha,
        tipo: 'INGRESO' as const,
        origen: 'Cobro de socio',
        concepto: item.socioNombre,
        categoria: 'SOCIOS',
        importe: item.importe,
        referencia: item.referencia ?? '',
        estado: 'REGISTRADO' as const,
        anulable: false,
      })),
      ...snapshot.ingresosManuales.map((item) => ({
        id: `ingreso-${item.id}`,
        recordId: item.id,
        fecha: item.fecha,
        tipo: 'INGRESO' as const,
        origen: 'Ingreso manual',
        concepto: item.concepto,
        categoria: item.categoria,
        importe: item.importe,
        referencia: item.referencia ?? '',
        estado: item.estado,
        anulacionMotivo: item.anulacionMotivo,
        anulable: true,
      })),
      ...snapshot.egresos.map((item) => ({
        id: `egreso-${item.id}`,
        recordId: item.id,
        fecha: item.fecha,
        tipo: 'EGRESO' as const,
        origen: 'Egreso',
        concepto: item.concepto,
        categoria: item.categoria,
        importe: item.importe,
        referencia: item.referencia ?? '',
        estado: item.estado,
        anulacionMotivo: item.anulacionMotivo,
        anulable: true,
      })),
    ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))
  }, [snapshot])

  const categories = useMemo(
    () => [...new Set(movements.map((item) => item.categoria))].sort((a, b) => a.localeCompare(b, 'es')),
    [movements],
  )

  const filteredMovements = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('es')
    return movements.filter((item) => {
      if (!showVoided && item.estado === 'ANULADO') return false
      if (tipoFilter !== 'TODOS' && item.tipo !== tipoFilter) return false
      if (categoryFilter !== 'TODAS' && item.categoria !== categoryFilter) return false
      if (needle) {
        const haystack = `${item.concepto} ${item.origen} ${item.categoria} ${item.referencia}`.toLocaleLowerCase('es')
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [movements, showVoided, tipoFilter, categoryFilter, search])

  const categorySummary = useMemo(() => {
    const totals = new Map<string, { ingresos: number; egresos: number }>()
    for (const item of movements) {
      if (item.estado === 'ANULADO') continue
      const current = totals.get(item.categoria) ?? { ingresos: 0, egresos: 0 }
      if (item.tipo === 'INGRESO') current.ingresos += item.importe
      else current.egresos += item.importe
      totals.set(item.categoria, current)
    }
    return [...totals.entries()]
      .map(([categoria, values]) => ({ categoria, ...values, neto: values.ingresos - values.egresos }))
      .sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto) || a.categoria.localeCompare(b.categoria, 'es'))
  }, [movements])

  async function confirmAnnulment() {
    if (!user || !canWrite || !annulTarget || annulling) return
    try {
      setAnnulling(true)
      setError('')
      setSuccess('')
      await anularMovimientoFinanciero(
        annulTarget.tipo as MovimientoFinancieroTipo,
        annulTarget.recordId,
        annulReason,
        user.uid,
      )
      setSuccess(`${annulTarget.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'} anulado. El registro se conserva y el motivo quedó auditado.`)
      setAnnulTarget(null)
      setAnnulReason('')
      await refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setAnnulling(false)
    }
  }

  function exportCsv() {
    if (!snapshot) return
    const lines: (string | number)[][] = [
      ['CENTRO CULTURAL CCNSA'],
      ['Balance financiero mensual', periodo],
      ['Generado', new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())],
      [],
      ['RESUMEN'],
      ['Cobros de socios', snapshot.totales.cobrosSocios],
      ['Otros ingresos', snapshot.totales.otrosIngresos],
      ['Ingresos totales', snapshot.totales.ingresosTotales],
      ['Egresos', snapshot.totales.egresosTotales],
      ['Resultado', snapshot.totales.resultado],
      [],
      ['RESUMEN POR CATEGORIA'],
      ['Categoría', 'Ingresos', 'Egresos', 'Neto'],
      ...categorySummary.map((item) => [item.categoria, item.ingresos, item.egresos, item.neto]),
      [],
      ['LIBRO DEL PERIODO'],
      ['Fecha', 'Tipo', 'Origen', 'Concepto', 'Categoría', 'Importe', 'Estado', 'Referencia', 'Motivo de anulación'],
      ...movements.map((item) => [
        item.fecha,
        item.tipo,
        item.origen,
        item.concepto,
        item.categoria,
        item.importe,
        item.estado,
        item.referencia,
        item.anulacionMotivo ?? '',
      ]),
      [],
      ['AUDITORIA FINANCIERA'],
      ['Fecha movimiento', 'Acción', 'Entidad', 'ID', 'Importe', 'Actor UID', 'Motivo'],
      ...snapshot.audit.map((item) => [
        item.fechaMovimiento ?? '',
        AUDIT_LABELS[item.action] ?? item.action,
        item.entity,
        item.entityId,
        item.importe ?? '',
        item.actorUid,
        item.motivo ?? '',
      ]),
    ]
    const csv = `\uFEFF${lines.map((row) => row.map((value) => csvCell(value ?? '')).join(';')).join('\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ccnsa-balance-${periodo}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="page-stack legacy-page-stack finance-page">
      <header className="legacy-page-header finance-print-header">
        <div>
          <p className="legacy-kicker">Fase 4B · Finanzas</p>
          <h2>Ingresos, egresos y balance</h2>
          <p className="muted">Libro financiero auditable con anulaciones controladas, filtros y consolidación por categoría.</p>
        </div>
        <div className="finance-header-actions finance-no-print">
          <label className="finance-period">
            Periodo
            <input type="month" value={periodo} onChange={(event) => setPeriodo(event.target.value)} />
          </label>
          <button className="button secondary" type="button" onClick={exportCsv} disabled={!snapshot || loading}>
            Exportar balance CSV
          </button>
          <button className="button secondary" type="button" onClick={() => window.print()} disabled={!snapshot || loading}>
            Imprimir / PDF
          </button>
        </div>
      </header>

      <div className="notice socios-success finance-safety finance-no-print">
        <strong>Control anti-duplicación:</strong> una cuota o aporte cobrado a un socio ya existe en <code>pagos</code> y entra automáticamente al balance. No debe cargarse otra vez como ingreso manual.
      </div>

      {error && <div className="notice error finance-no-print"><strong>Finanzas.</strong> {error}</div>}
      {success && <div className="notice socios-success finance-no-print">{success}</div>}

      <div className="metric-grid legacy-metric-grid finance-metrics">
        <article className="metric-card legacy-metric-card"><span>Cobros de socios</span><strong>{snapshot ? money(snapshot.totales.cobrosSocios) : '—'}</strong><small>Derivados de pagos; no son ingresos manuales.</small></article>
        <article className="metric-card legacy-metric-card"><span>Otros ingresos</span><strong>{snapshot ? money(snapshot.totales.otrosIngresos) : '—'}</strong><small>Donaciones, Academia, actividades y otros conceptos.</small></article>
        <article className="metric-card legacy-metric-card"><span>Egresos</span><strong>{snapshot ? money(snapshot.totales.egresosTotales) : '—'}</strong><small>Movimientos de salida registrados en el periodo.</small></article>
        <article className="metric-card legacy-metric-card"><span>Resultado</span><strong>{snapshot ? money(snapshot.totales.resultado) : '—'}</strong><small>Ingresos totales menos egresos.</small></article>
      </div>

      {canWrite ? (
        <div className="finance-entry-grid finance-no-print">
          <form className="panel legacy-panel finance-form" onSubmit={submitIngreso}>
            <div><p className="legacy-kicker">Entrada</p><h3>Registrar otro ingreso</h3><p className="muted">Únicamente para ingresos que no provienen de un pago de socio.</p></div>
            <div className="finance-fields">
              <label>Fecha<input name="fecha" type="date" defaultValue={today} required /></label>
              <label>Importe<input name="importe" type="number" min="1" step="1" required /></label>
              <label className="finance-wide">Concepto<input name="concepto" placeholder="Ej.: Donación para actividad" required /></label>
              <label>Categoría<select name="categoria" defaultValue="DONACION">{INGRESO_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Medio<select name="medioPago" defaultValue="TRANSFERENCIA"><option>TRANSFERENCIA</option><option>EFECTIVO</option><option>OTRO</option></select></label>
              <label className="finance-wide">Referencia<input name="referencia" placeholder="Opcional" /></label>
            </div>
            <button className="button primary" type="submit" disabled={Boolean(saving)}>{saving === 'INGRESO' ? 'Registrando…' : 'Registrar ingreso'}</button>
          </form>

          <form className="panel legacy-panel finance-form" onSubmit={submitEgreso}>
            <div><p className="legacy-kicker">Salida</p><h3>Registrar egreso</h3><p className="muted">El egreso queda registrado junto con su actor y una entrada de auditoría.</p></div>
            <div className="finance-fields">
              <label>Fecha<input name="fecha" type="date" defaultValue={today} required /></label>
              <label>Importe<input name="importe" type="number" min="1" step="1" required /></label>
              <label className="finance-wide">Concepto<input name="concepto" placeholder="Ej.: Alquiler del mes" required /></label>
              <label>Categoría<select name="categoria" defaultValue="ALQUILER">{EGRESO_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Medio<select name="medioPago" defaultValue="TRANSFERENCIA"><option>TRANSFERENCIA</option><option>EFECTIVO</option><option>OTRO</option></select></label>
              <label className="finance-wide">Referencia<input name="referencia" placeholder="Opcional" /></label>
            </div>
            <button className="button primary" type="submit" disabled={Boolean(saving)}>{saving === 'EGRESO' ? 'Registrando…' : 'Registrar egreso'}</button>
          </form>
        </div>
      ) : (
        <div className="cuotas-info-box finance-no-print"><strong>Modo consulta.</strong> Tu rol puede revisar y exportar las finanzas, pero no registrar ni anular movimientos.</div>
      )}

      {annulTarget && (
        <article className="panel legacy-panel finance-annul-panel finance-no-print">
          <div>
            <p className="legacy-kicker">Corrección controlada</p>
            <h3>Anular {annulTarget.tipo === 'INGRESO' ? 'ingreso' : 'egreso'}: {annulTarget.concepto}</h3>
            <p className="muted">No se elimina el documento. Quedará en estado ANULADO y el motivo se guardará en audit_log. Si necesitás corregir datos, anulá este movimiento y registrá uno nuevo.</p>
          </div>
          <label>Motivo de anulación<textarea value={annulReason} onChange={(event) => setAnnulReason(event.target.value)} rows={3} placeholder="Ej.: carga duplicada / importe incorrecto" /></label>
          <div className="finance-annul-actions">
            <button className="button secondary" type="button" onClick={() => { setAnnulTarget(null); setAnnulReason('') }} disabled={annulling}>Cancelar</button>
            <button className="button primary" type="button" onClick={() => void confirmAnnulment()} disabled={annulling || annulReason.trim().length < 5}>{annulling ? 'Anulando…' : 'Confirmar anulación'}</button>
          </div>
        </article>
      )}

      <article className="panel legacy-panel finance-category-panel">
        <div className="panel-heading-row"><div><p className="legacy-kicker">Composición</p><h3>Resumen por categoría</h3></div><span className="status-badge neutral">{categorySummary.length} categoría(s)</span></div>
        <div className="legacy-table-wrap">
          <table className="legacy-table"><thead><tr><th>Categoría</th><th>Ingresos</th><th>Egresos</th><th>Neto</th></tr></thead><tbody>
            {categorySummary.length === 0 ? <tr><td colSpan={4}>Sin movimientos para el periodo.</td></tr> : categorySummary.map((item) => <tr key={item.categoria}><td>{item.categoria}</td><td>{money(item.ingresos)}</td><td>{money(item.egresos)}</td><td>{money(item.neto)}</td></tr>)}
          </tbody></table>
        </div>
      </article>

      <article className="panel legacy-panel finance-table-panel">
        <div className="panel-heading-row"><div><p className="legacy-kicker">Libro del periodo</p><h3>Movimientos consolidados</h3></div><span className="status-badge neutral">{filteredMovements.length} de {movements.length}</span></div>
        <div className="finance-filters finance-no-print">
          <label>Tipo<select value={tipoFilter} onChange={(event) => setTipoFilter(event.target.value as typeof tipoFilter)}><option value="TODOS">Todos</option><option value="INGRESO">Ingresos</option><option value="EGRESO">Egresos</option></select></label>
          <label>Categoría<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="TODAS">Todas</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label className="finance-search">Buscar<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Concepto, referencia…" /></label>
          <label className="finance-check"><input type="checkbox" checked={showVoided} onChange={(event) => setShowVoided(event.target.checked)} /> Mostrar anulados</label>
        </div>
        <div className="legacy-table-wrap">
          <table className="legacy-table">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Origen</th><th>Concepto</th><th>Categoría</th><th>Importe</th><th>Estado</th><th>Referencia</th>{canWrite && <th className="finance-no-print">Acción</th>}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={canWrite ? 9 : 8}>Cargando movimientos…</td></tr> : filteredMovements.length === 0 ? <tr><td colSpan={canWrite ? 9 : 8}>No hay movimientos que coincidan con los filtros.</td></tr> : filteredMovements.map((item) => (
                <tr key={item.id} className={item.estado === 'ANULADO' ? 'finance-voided-row' : ''}>
                  <td>{item.fecha}</td>
                  <td><span className={`status-badge ${item.tipo === 'INGRESO' ? 'success' : 'neutral'}`}>{item.tipo}</span></td>
                  <td>{item.origen}</td><td>{item.concepto}</td><td>{item.categoria}</td><td>{money(item.importe)}</td>
                  <td><span className={`status-badge ${item.estado === 'ANULADO' ? 'danger' : 'success'}`}>{item.estado}</span>{item.anulacionMotivo && <small className="finance-void-reason">{item.anulacionMotivo}</small>}</td>
                  <td>{item.referencia || '—'}</td>
                  {canWrite && <td className="finance-no-print">{item.anulable && item.estado === 'REGISTRADO' ? <button className="button secondary inline-button" type="button" onClick={() => { setAnnulTarget(item); setAnnulReason('') }}>Anular</button> : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel legacy-panel finance-audit-panel">
        <div className="panel-heading-row"><div><p className="legacy-kicker">Trazabilidad</p><h3>Auditoría financiera</h3></div><span className="status-badge neutral">{snapshot?.audit.length ?? 0} evento(s)</span></div>
        <div className="legacy-table-wrap"><table className="legacy-table"><thead><tr><th>Registrado</th><th>Acción</th><th>Movimiento</th><th>Importe</th><th>Actor</th><th>Motivo</th></tr></thead><tbody>
          {!snapshot || snapshot.audit.length === 0 ? <tr><td colSpan={6}>Sin eventos financieros auditables en este periodo.</td></tr> : snapshot.audit.map((item) => <tr key={item.id}><td>{formatAuditDate(item.createdAt)}</td><td>{AUDIT_LABELS[item.action] ?? item.action}</td><td>{item.concepto || item.entityId}</td><td>{item.importe === undefined ? '—' : money(item.importe)}</td><td className="finance-uid">{item.actorUid || '—'}</td><td>{item.motivo || '—'}</td></tr>)}
        </tbody></table></div>
      </article>
    </section>
  )
}
