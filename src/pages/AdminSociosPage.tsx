import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  createObligacion,
  createPago,
  createSocio,
  listSocios,
  loadEstadoCuenta,
  type EstadoCuenta,
  type Socio,
} from '../data/socios'
import { conciliarRegistrosPrevios } from '../data/reconciliacion'
import './admin-socios.css'

const money = (value: number) => `Gs. ${Math.round(value).toLocaleString('es-PY')}`
const today = new Date().toISOString().slice(0, 10)
const currentPeriod = new Date().toISOString().slice(0, 7)

function devErrorMessage(prefix: string, error: unknown) {
  if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
    if (error instanceof Error) return `${prefix} ${error.message}`
  }
  return prefix
}

function statusClass(status: string) {
  return status === 'PAGADA' || status === 'ACTIVO' ? 'success' : 'neutral'
}

export function AdminSociosPage() {
  const { user, profile } = useAuth()
  const canWrite = profile?.role === 'ADMIN' || profile?.role === 'TESORERIA'
  const [socios, setSocios] = useState<Socio[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [account, setAccount] = useState<EstadoCuenta | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [reconciling, setReconciling] = useState(false)

  const selected = socios.find((socio) => socio.id === selectedId)
  const needsReconciliation = Boolean(
    canWrite
      && account
      && account.saldoPendiente > 0
      && account.saldoFavor > 0,
  )

  async function loadSocios(preferredId?: string) {
    try {
      const data = await listSocios()
      setSocios(data)
      const nextId = preferredId || selectedId || data[0]?.id || ''
      setSelectedId(nextId)
    } catch (caught) {
      setError(devErrorMessage('No fue posible cargar los socios.', caught))
    }
  }

  async function loadAccount(socioId: string) {
    if (!socioId) {
      setAccount(null)
      return
    }
    try {
      setAccount(await loadEstadoCuenta(socioId))
    } catch (caught) {
      setError(devErrorMessage('No fue posible cargar el estado de cuenta.', caught))
    }
  }

  useEffect(() => { void loadSocios() }, [])
  useEffect(() => { void loadAccount(selectedId) }, [selectedId])

  async function addSocio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || profile?.role !== 'ADMIN') return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const nombre = String(form.get('nombre') || '').trim()
    if (!nombre) return
    try {
      setError('')
      setMessage('')
      const id = await createSocio({
        nombre,
        email: String(form.get('email') || '').trim() || undefined,
        categoria: form.get('categoria') === 'CASADO' ? 'CASADO' : 'SOLTERO',
        estado: 'ACTIVO',
        fechaIngreso: today,
      }, user.uid)
      formElement.reset()
      setMessage('Socio de prueba creado.')
      await loadSocios(id)
    } catch (caught) {
      console.error('Error creating socio', caught)
      setError(devErrorMessage('No se pudo crear el socio.', caught))
    }
  }

  async function addCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !selected || !canWrite) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const importe = Number(form.get('importe') || 0)
    if (importe <= 0) return
    try {
      setError('')
      setMessage('')
      const result = await createObligacion({
        socioId: selected.id,
        concepto: String(form.get('concepto') || 'Cuota social'),
        periodo: String(form.get('periodo') || currentPeriod),
        importe,
        fechaVencimiento: String(form.get('fechaVencimiento') || '') || undefined,
      }, user.uid)
      formElement.reset()
      setMessage(result.importeAplicado > 0
        ? `Obligación registrada. Se aplicaron automáticamente ${money(result.importeAplicado)} de saldo a favor.`
        : 'Obligación registrada.')
      await loadAccount(selected.id)
    } catch (caught) {
      console.error('Error creating obligation', caught)
      setError(devErrorMessage('No se pudo registrar la obligación.', caught))
    }
  }

  async function addPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !selected || !canWrite) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const importe = Number(form.get('importe') || 0)
    if (importe <= 0) return
    try {
      setError('')
      setMessage('')
      const result = await createPago({
        socioId: selected.id,
        importe,
        fecha: String(form.get('fecha') || today),
        medioPago: String(form.get('medioPago') || 'TRANSFERENCIA'),
        referencia: String(form.get('referencia') || '').trim() || undefined,
      }, user.uid)
      formElement.reset()
      setMessage(result.saldoDisponible > 0
        ? `Pago registrado. ${money(result.importeAplicado)} se imputaron a obligaciones y ${money(result.saldoDisponible)} quedaron como saldo a favor.`
        : `Pago registrado e imputado por ${money(result.importeAplicado)}.`)
      await loadAccount(selected.id)
    } catch (caught) {
      console.error('Error creating payment', caught)
      setError(devErrorMessage('No se pudo registrar el pago.', caught))
    }
  }

  async function reconcilePreviousRecords() {
    if (!user || !selected || !canWrite || !needsReconciliation) return
    try {
      setReconciling(true)
      setError('')
      setMessage('')
      const result = await conciliarRegistrosPrevios(selected.id, user.uid)
      setMessage(result.cantidadAplicaciones > 0
        ? `Conciliación completada. Se imputaron ${money(result.importeConciliado)} en ${result.cantidadAplicaciones} aplicación(es).`
        : 'No se encontraron registros pendientes de conciliación.')
      await loadAccount(selected.id)
    } catch (caught) {
      console.error('Error reconciling previous records', caught)
      setError(devErrorMessage('No se pudo conciliar el estado de cuenta.', caught))
    } finally {
      setReconciling(false)
    }
  }

  return (
    <section className="page-stack legacy-page-stack">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Gestión interna</p>
          <h2>Socios y cuotas</h2>
          <p className="muted">Fase 2 de prueba: pagos parciales, imputación automática y saldos a favor. No cargues datos reales todavía.</p>
        </div>
        <span className="status-badge neutral">Entorno de desarrollo</span>
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice socios-success">{message}</div>}

      <div className="socios-layout">
        <aside className="panel socios-list-panel">
          <div className="panel-heading-row"><h3>Socios</h3><span className="status-badge neutral">{socios.length}</span></div>
          <div className="socios-list">
            {socios.map((socio) => (
              <button key={socio.id} type="button" className={`socio-row ${socio.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(socio.id)}>
                <span><strong>{socio.nombre}</strong><small>{socio.categoria}</small></span>
                <span className={`status-badge ${statusClass(socio.estado)}`}>{socio.estado}</span>
              </button>
            ))}
          </div>
          {profile?.role === 'ADMIN' && (
            <form className="socios-form" onSubmit={addSocio}>
              <h4>Nuevo socio de prueba</h4>
              <input name="nombre" placeholder="Nombre" required />
              <input name="email" type="email" placeholder="Correo opcional" />
              <select name="categoria" defaultValue="SOLTERO"><option value="SOLTERO">Individual</option><option value="CASADO">Matrimonio</option></select>
              <button className="button primary" type="submit">Crear socio</button>
            </form>
          )}
        </aside>

        <div className="socios-detail-stack">
          {!selected ? (
            <article className="panel"><h3>Sin socios todavía</h3><p>Creá un registro ficticio para iniciar las pruebas.</p></article>
          ) : (
            <>
              <div className="metric-grid legacy-metric-grid">
                <article className="metric-card legacy-metric-card"><span>Socio</span><strong className="socios-name">{selected.nombre}</strong><small>{selected.email || 'Sin correo'}</small></article>
                <article className="metric-card legacy-metric-card"><span>Saldo pendiente</span><strong>{money(account?.saldoPendiente ?? 0)}</strong><small>Obligaciones todavía no cubiertas.</small></article>
                <article className="metric-card legacy-metric-card"><span>Saldo a favor</span><strong>{money(account?.saldoFavor ?? 0)}</strong><small>Pagos disponibles para futuras obligaciones.</small></article>
              </div>

              {needsReconciliation && (
                <article className="panel">
                  <div className="panel-heading-row">
                    <div>
                      <h3>Conciliación pendiente</h3>
                      <p className="muted">Hay obligaciones y pagos previos sin aplicación entre sí. Podés conciliarlos por antigüedad sin modificar los registros originales.</p>
                    </div>
                    <button className="button secondary inline-button" type="button" onClick={() => void reconcilePreviousRecords()} disabled={reconciling}>
                      {reconciling ? 'Conciliando…' : 'Conciliar registros previos'}
                    </button>
                  </div>
                </article>
              )}

              <div className="socios-action-grid">
                <form className="panel socios-form" onSubmit={addCharge}>
                  <h3>Registrar obligación</h3>
                  <input name="concepto" defaultValue="Cuota social" required disabled={!canWrite} />
                  <input name="periodo" type="month" defaultValue={currentPeriod} required disabled={!canWrite} />
                  <input name="fechaVencimiento" type="date" disabled={!canWrite} />
                  <input name="importe" type="number" min="1" placeholder="Importe" required disabled={!canWrite} />
                  <button className="button primary" type="submit" disabled={!canWrite}>Registrar</button>
                  <small className="muted">Si existe saldo a favor, se aplica automáticamente.</small>
                </form>
                <form className="panel socios-form" onSubmit={addPayment}>
                  <h3>Registrar pago</h3>
                  <input name="importe" type="number" min="1" placeholder="Importe" required disabled={!canWrite} />
                  <input name="fecha" type="date" defaultValue={today} required disabled={!canWrite} />
                  <select name="medioPago" defaultValue="TRANSFERENCIA" disabled={!canWrite}>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="OTRO">Otro</option>
                  </select>
                  <input name="referencia" placeholder="Referencia opcional" disabled={!canWrite} />
                  <button className="button primary" type="submit" disabled={!canWrite}>Registrar</button>
                  <small className="muted">Se imputa primero a las obligaciones pendientes más antiguas.</small>
                </form>
              </div>

              <div className="socios-ledger-grid">
                <article className="panel">
                  <h3>Obligaciones</h3>
                  <div className="legacy-table-wrap"><table className="legacy-table">
                    <thead><tr><th>Periodo</th><th>Concepto</th><th>Importe</th><th>Aplicado</th><th>Pendiente</th><th>Estado</th></tr></thead>
                    <tbody>{!account || account.obligaciones.length === 0
                      ? <tr><td colSpan={6}>Sin registros.</td></tr>
                      : account.obligaciones.map((item) => <tr key={item.id}>
                        <td>{item.periodo}</td><td>{item.concepto}</td><td>{money(item.importe)}</td><td>{money(item.importeAplicado)}</td><td>{money(item.saldoPendiente)}</td><td><span className={`status-badge ${statusClass(item.estadoCalculado)}`}>{item.estadoCalculado}</span></td>
                      </tr>)}</tbody>
                  </table></div>
                </article>
                <article className="panel">
                  <h3>Pagos</h3>
                  <div className="legacy-table-wrap"><table className="legacy-table">
                    <thead><tr><th>Fecha</th><th>Importe</th><th>Aplicado</th><th>Disponible</th><th>Medio</th><th>Referencia</th></tr></thead>
                    <tbody>{!account || account.pagos.length === 0
                      ? <tr><td colSpan={6}>Sin registros.</td></tr>
                      : account.pagos.map((item) => <tr key={item.id}>
                        <td>{item.fecha}</td><td>{money(item.importe)}</td><td>{money(item.importeAplicado)}</td><td>{money(item.saldoDisponible)}</td><td>{item.medioPago || '—'}</td><td>{item.referencia || '—'}</td>
                      </tr>)}</tbody>
                  </table></div>
                </article>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
