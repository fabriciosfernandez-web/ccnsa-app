import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export function SocioDashboard() {
  const { profile } = useAuth()

  return (
    <section className="page-stack legacy-page-stack">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Portal del socio</p>
          <h2>Hola, {profile?.displayName}</h2>
          <p className="muted">Consultá tu estado de cuenta, últimos movimientos y avisos del Centro.</p>
        </div>
        <span className="status-badge success">Al día</span>
      </header>

      <div className="metric-grid legacy-metric-grid">
        <article className="metric-card legacy-metric-card">
          <span>Saldo pendiente</span>
          <strong>—</strong>
          <small>Se calculará desde obligaciones menos pagos aplicados.</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Último pago</span>
          <strong>—</strong>
          <small>Sin datos reales todavía.</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Próximo vencimiento</span>
          <strong>—</strong>
          <small>Se mostrará automáticamente al conectar Firestore.</small>
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
                <tr>
                  <td>Septiembre 2026</td>
                  <td>Cuota social</td>
                  <td>—</td>
                  <td><span className="status-badge neutral">Pendiente de datos</span></td>
                </tr>
                <tr>
                  <td>Agosto 2026</td>
                  <td>Cuota social</td>
                  <td>—</td>
                  <td><span className="status-badge success">Pagado</span></td>
                </tr>
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
    </section>
  )
}
