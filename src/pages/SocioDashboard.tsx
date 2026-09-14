import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { loadEstadoCuenta, type EstadoCuenta } from '../data/socios'

const money = (value: number) => `Gs. ${Math.round(value).toLocaleString('es-PY')}`

function statusClass(status: string) {
  return status === 'PAGADA' ? 'success' : 'neutral'
}

export function SocioDashboard() {
  const { profile } = useAuth()
  const [account, setAccount] = useState<EstadoCuenta | null>(null)
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
        setAccount(await loadEstadoCuenta(profile.socioId))
      } catch {
        setError('No fue posible cargar tu estado de cuenta.')
      } finally {
        setLoading(false)
      }
    }

    void loadAccount()
  }, [profile?.socioId])

  const ultimoPago = account?.pagos[0]
  const saldoPendiente = account?.saldoPendiente ?? 0
  const saldoFavor = account?.saldoFavor ?? 0
  const badgeText = saldoPendiente > 0 ? 'Con saldo' : saldoFavor > 0 ? 'Saldo a favor' : 'Al día'
  const badgeClass = saldoPendiente === 0 ? 'success' : 'neutral'

  return (
    <section className="page-stack legacy-page-stack">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Portal del socio</p>
          <h2>Hola, {profile?.displayName}</h2>
          <p className="muted">Consultá tu estado de cuenta, últimos movimientos y avisos del Centro.</p>
        </div>
        <span className={`status-badge ${badgeClass}`}>{badgeText}</span>
      </header>

      {error && <div className="notice error">{error}</div>}
      {loading ? (
        <div className="screen-message">Cargando estado de cuenta…</div>
      ) : (
        <>
          <div className="metric-grid legacy-metric-grid">
            <article className="metric-card legacy-metric-card">
              <span>Saldo pendiente</span>
              <strong>{money(saldoPendiente)}</strong>
              <small>Obligaciones todavía no cubiertas.</small>
            </article>
            <article className="metric-card legacy-metric-card">
              <span>Saldo a favor</span>
              <strong>{money(saldoFavor)}</strong>
              <small>Disponible para futuras cuotas u obligaciones.</small>
            </article>
            <article className="metric-card legacy-metric-card">
              <span>Último pago</span>
              <strong>{ultimoPago ? money(ultimoPago.importe) : '—'}</strong>
              <small>{ultimoPago ? ultimoPago.fecha : 'Sin pagos registrados.'}</small>
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
                      <th>Aplicado</th>
                      <th>Pendiente</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!account || account.obligaciones.length === 0 ? (
                      <tr><td colSpan={6}>Sin obligaciones registradas.</td></tr>
                    ) : account.obligaciones.map((item) => (
                      <tr key={item.id}>
                        <td>{item.periodo}</td>
                        <td>{item.concepto}</td>
                        <td>{money(item.importe)}</td>
                        <td>{money(item.importeAplicado)}</td>
                        <td>{money(item.saldoPendiente)}</td>
                        <td><span className={`status-badge ${statusClass(item.estadoCalculado)}`}>{item.estadoCalculado}</span></td>
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
