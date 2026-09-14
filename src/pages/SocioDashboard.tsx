import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { listObligaciones, listPagos, type Obligacion, type Pago } from '../data/socios'

const money = (value: number) => `Gs. ${Math.round(value).toLocaleString('es-PY')}`

export function SocioDashboard() {
  const { profile } = useAuth()
  const [obligaciones, setObligaciones] = useState<Obligacion[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadAccount() {
      if (!profile?.socioId) {
        setError('Tu perfil todavía no está vinculado a una ficha de socio.')
        setLoading(false)
        return
      }

      try {
        setError('')
        const [charges, payments] = await Promise.all([
          listObligaciones(profile.socioId),
          listPagos(profile.socioId),
        ])
        setObligaciones(charges)
        setPagos(payments)
      } catch {
        setError('No fue posible cargar tu estado de cuenta.')
      } finally {
        setLoading(false)
      }
    }

    void loadAccount()
  }, [profile?.socioId])

  const totalCargos = useMemo(
    () => obligaciones.filter((item) => item.estado !== 'ANULADO').reduce((sum, item) => sum + item.importe, 0),
    [obligaciones],
  )
  const totalPagos = useMemo(() => pagos.reduce((sum, item) => sum + item.importe, 0), [pagos])
  const saldo = Math.max(0, totalCargos - totalPagos)
  const ultimoPago = pagos[0]

  return (
    <section className="page-stack legacy-page-stack">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Portal del socio</p>
          <h2>Hola, {profile?.displayName}</h2>
          <p className="muted">Consultá tu estado de cuenta, últimos movimientos y avisos del Centro.</p>
        </div>
        <span className={`status-badge ${saldo === 0 ? 'success' : 'neutral'}`}>
          {saldo === 0 ? 'Al día' : 'Con saldo'}
        </span>
      </header>

      {error && <div className="notice error">{error}</div>}
      {loading ? (
        <div className="screen-message">Cargando estado de cuenta…</div>
      ) : (
        <>
          <div className="metric-grid legacy-metric-grid">
            <article className="metric-card legacy-metric-card">
              <span>Saldo pendiente</span>
              <strong>{money(saldo)}</strong>
              <small>Cargos registrados menos pagos.</small>
            </article>
            <article className="metric-card legacy-metric-card">
              <span>Último pago</span>
              <strong>{ultimoPago ? money(ultimoPago.importe) : '—'}</strong>
              <small>{ultimoPago ? ultimoPago.fecha : 'Sin pagos registrados.'}</small>
            </article>
            <article className="metric-card legacy-metric-card">
              <span>Cargos registrados</span>
              <strong>{money(totalCargos)}</strong>
              <small>{obligaciones.length} obligación(es).</small>
            </article>
          </div>

          <div className="legacy-two-column">
            <article className="panel legacy-panel">
              <div className="panel-heading-row">
                <div>
                  <p className="legacy-kicker">Estado de cuenta</p>
                  <h3>Resumen de cuotas</h3>
                </div>
                <button className="button secondary inline-button" type="button" disabled>
                  Descargar estado
                </button>
              </div>
              <div className="legacy-table-wrap">
                <table className="legacy-table">
                  <thead>
                    <tr>
                      <th>Periodo</th>
                      <th>Concepto</th>
                      <th>Importe</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obligaciones.length === 0 ? (
                      <tr><td colSpan={4}>Sin obligaciones registradas.</td></tr>
                    ) : obligaciones.map((item) => (
                      <tr key={item.id}>
                        <td>{item.periodo}</td>
                        <td>{item.concepto}</td>
                        <td>{money(item.importe)}</td>
                        <td><span className="status-badge neutral">{item.estado}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel legacy-panel legacy-notice-panel">
              <p className="legacy-kicker">Avisos</p>
              <h3>Centro de notificaciones</h3>
              <p>Cuando haya un nuevo estado de cuenta, un pago registrado o un vencimiento, vas a verlo acá.</p>
              <Link className="button primary legacy-primary-button inline-button" to="/socio/notificaciones">
                Ver notificaciones
              </Link>
            </article>
          </div>
        </>
      )}
    </section>
  )
}
