import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  createEgreso,
  createIngresoManual,
  loadFinanzas,
  type FinanzasSnapshot,
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
    try {
      setSaving('INGRESO')
      setError('')
      setSuccess('')
      await createIngresoManual(movementFromForm(event.currentTarget), user.uid)
      event.currentTarget.reset()
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
    try {
      setSaving('EGRESO')
      setError('')
      setSuccess('')
      await createEgreso(movementFromForm(event.currentTarget), user.uid)
      event.currentTarget.reset()
      setSuccess('Egreso registrado. El movimiento quedó trazado en audit_log.')
      await refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(null)
    }
  }

  const movements = useMemo(() => {
    if (!snapshot) return []
    return [
      ...snapshot.cobrosSocios.map((item) => ({
        id: `pago-${item.id}`,
        fecha: item.fecha,
        tipo: 'INGRESO' as const,
        origen: 'Cobro de socio',
        concepto: item.socioNombre,
        categoria: 'SOCIOS',
        importe: item.importe,
        referencia: item.referencia ?? '',
      })),
      ...snapshot.ingresosManuales.map((item) => ({
        id: `ingreso-${item.id}`,
        fecha: item.fecha,
        tipo: 'INGRESO' as const,
        origen: 'Ingreso manual',
        concepto: item.concepto,
        categoria: item.categoria,
        importe: item.importe,
        referencia: item.referencia ?? '',
      })),
      ...snapshot.egresos.map((item) => ({
        id: `egreso-${item.id}`,
        fecha: item.fecha,
        tipo: 'EGRESO' as const,
        origen: 'Egreso',
        concepto: item.concepto,
        categoria: item.categoria,
        importe: item.importe,
        referencia: item.referencia ?? '',
      })),
    ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))
  }, [snapshot])

  function exportCsv() {
    if (!snapshot) return
    const lines = [
      ['Balance CCNSA', periodo],
      ['Cobros de socios', snapshot.totales.cobrosSocios],
      ['Otros ingresos', snapshot.totales.otrosIngresos],
      ['Ingresos totales', snapshot.totales.ingresosTotales],
      ['Egresos', snapshot.totales.egresosTotales],
      ['Resultado', snapshot.totales.resultado],
      [],
      ['Fecha', 'Tipo', 'Origen', 'Concepto', 'Categoría', 'Importe', 'Referencia'],
      ...movements.map((item) => [
        item.fecha,
        item.tipo,
        item.origen,
        item.concepto,
        item.categoria,
        item.importe,
        item.referencia,
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
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Fase 4A · Finanzas</p>
          <h2>Ingresos, egresos y balance</h2>
          <p className="muted">Los cobros de socios se toman directamente de pagos para evitar contabilizarlos dos veces.</p>
        </div>
        <div className="finance-header-actions">
          <label className="finance-period">
            Periodo
            <input type="month" value={periodo} onChange={(event) => setPeriodo(event.target.value)} />
          </label>
          <button className="button secondary" type="button" onClick={exportCsv} disabled={!snapshot || loading}>
            Exportar CSV
          </button>
        </div>
      </header>

      <div className="notice socios-success finance-safety">
        <strong>Control anti-duplicación:</strong> una cuota o aporte cobrado a un socio ya existe en <code>pagos</code> y entra automáticamente al balance. No debe cargarse otra vez como ingreso manual.
      </div>

      {error && <div className="notice error"><strong>Finanzas.</strong> {error}</div>}
      {success && <div className="notice socios-success">{success}</div>}

      <div className="metric-grid legacy-metric-grid finance-metrics">
        <article className="metric-card legacy-metric-card">
          <span>Cobros de socios</span>
          <strong>{snapshot ? money(snapshot.totales.cobrosSocios) : '—'}</strong>
          <small>Derivados de pagos; no son ingresos manuales.</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Otros ingresos</span>
          <strong>{snapshot ? money(snapshot.totales.otrosIngresos) : '—'}</strong>
          <small>Donaciones, Academia, actividades y otros conceptos.</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Egresos</span>
          <strong>{snapshot ? money(snapshot.totales.egresosTotales) : '—'}</strong>
          <small>Movimientos de salida registrados en el periodo.</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Resultado</span>
          <strong>{snapshot ? money(snapshot.totales.resultado) : '—'}</strong>
          <small>Ingresos totales menos egresos.</small>
        </article>
      </div>

      {canWrite ? (
        <div className="finance-entry-grid">
          <form className="panel legacy-panel finance-form" onSubmit={submitIngreso}>
            <div>
              <p className="legacy-kicker">Entrada</p>
              <h3>Registrar otro ingreso</h3>
              <p className="muted">Usá este formulario únicamente para ingresos que no provienen de un pago de socio.</p>
            </div>
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
            <div>
              <p className="legacy-kicker">Salida</p>
              <h3>Registrar egreso</h3>
              <p className="muted">El egreso queda registrado junto con su actor y una entrada de auditoría.</p>
            </div>
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
        <div className="cuotas-info-box"><strong>Modo consulta.</strong> Tu rol puede revisar y exportar las finanzas, pero no registrar movimientos.</div>
      )}

      <article className="panel legacy-panel finance-table-panel">
        <div className="panel-heading-row">
          <div>
            <p className="legacy-kicker">Libro del periodo</p>
            <h3>Movimientos consolidados</h3>
          </div>
          <span className="status-badge neutral">{movements.length} movimiento(s)</span>
        </div>
        <div className="legacy-table-wrap">
          <table className="legacy-table">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Origen</th><th>Concepto</th><th>Categoría</th><th>Importe</th><th>Referencia</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}>Cargando movimientos…</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={7}>No hay movimientos registrados para {periodo}.</td></tr>
              ) : movements.map((item) => (
                <tr key={item.id}>
                  <td>{item.fecha}</td>
                  <td><span className={`status-badge ${item.tipo === 'INGRESO' ? 'success' : 'neutral'}`}>{item.tipo}</span></td>
                  <td>{item.origen}</td>
                  <td>{item.concepto}</td>
                  <td>{item.categoria}</td>
                  <td>{money(item.importe)}</td>
                  <td>{item.referencia || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}
