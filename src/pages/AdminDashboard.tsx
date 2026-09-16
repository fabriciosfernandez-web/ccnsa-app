import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export function AdminDashboard() {
  const { profile } = useAuth()

  return (
    <section className="page-stack legacy-page-stack">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Gestión interna</p>
          <h2>Panel de {profile?.role === 'CONSULTA' ? 'consulta' : 'administración'}</h2>
          <p className="muted">La misma identidad visual del portal, con herramientas de gestión separadas por rol.</p>
        </div>
        <span className="status-badge neutral">Entorno de desarrollo</span>
      </header>

      <div className="metric-grid legacy-metric-grid">
        <article className="metric-card legacy-metric-card">
          <span>Socios</span>
          <strong>—</strong>
          <small>Se incorporarán después de conciliar la base 2026.</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Cobranza del mes</span>
          <strong>—</strong>
          <small>Calculada desde pagos y movimientos registrados.</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Alertas</span>
          <strong>0</strong>
          <small>Sin datos productivos en esta fase.</small>
        </article>
      </div>

      <div className="card-grid legacy-card-grid">
        <article className="panel legacy-panel feature-card">
          <p className="legacy-kicker">Módulo</p>
          <h3>Socios y cuotas</h3>
          <p>Alta, estado, categoría, obligaciones periódicas, saldos y pagos aplicados.</p>
          <Link className="button primary inline-button" to="/admin/socios">Abrir módulo</Link>
        </article>
        <article className="panel legacy-panel feature-card">
          <p className="legacy-kicker">Módulo</p>
          <h3>Finanzas</h3>
          <p>Ingresos, egresos, balance mensual y trazabilidad sin duplicar cobros de socios.</p>
          <Link className="button primary inline-button" to="/admin/finanzas">Abrir módulo</Link>
        </article>
        <article className="panel legacy-panel feature-card">
          <p className="legacy-kicker">Módulo</p>
          <h3>Actividades</h3>
          <p>Retiros, San Juan, Club de Damas y otras actividades con su propia contabilidad.</p>
        </article>
      </div>
    </section>
  )
}
