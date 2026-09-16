import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { AdminPageHeader } from '../components/AdminPageHeader'

export function AdminDashboard() {
  const { profile } = useAuth()

  return (
    <section className="page-stack legacy-page-stack">
      <AdminPageHeader
        eyebrow="Gestión institucional"
        title={profile?.role === 'CONSULTA' ? 'Panel de consulta' : 'Panel de gestión'}
        description="Acceso central a socios, cobranza, finanzas, configuración y trazabilidad. Cada módulo conserva responsabilidades y permisos separados por rol."
        meta={<span className="status-badge neutral">Rol · {profile?.role}</span>}
      />

      <div className="metric-grid legacy-metric-grid">
        <article className="metric-card legacy-metric-card">
          <span>Socios</span>
          <strong>—</strong>
          <small>El indicador productivo se activará al completar la migración.</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Cobranza del mes</span>
          <strong>—</strong>
          <small>Calculada desde los pagos efectivamente registrados.</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Controles</span>
          <strong>Auditables</strong>
          <small>Las acciones sensibles se registran en el módulo de Auditoría.</small>
        </article>
      </div>

      <div className="card-grid legacy-card-grid">
        <article className="panel legacy-panel feature-card">
          <p className="legacy-kicker">Gestión</p>
          <h3>Socios y cuotas</h3>
          <p>Altas, estado, categoría, obligaciones, pagos aplicados y saldos de cada socio.</p>
          <Link className="button primary inline-button" to="/admin/socios">Abrir módulo</Link>
        </article>
        <article className="panel legacy-panel feature-card">
          <p className="legacy-kicker">Gestión</p>
          <h3>Finanzas</h3>
          <p>Ingresos, egresos, balance mensual y correcciones mediante anulaciones controladas.</p>
          <Link className="button primary inline-button" to="/admin/finanzas">Abrir módulo</Link>
        </article>
        <article className="panel legacy-panel feature-card">
          <p className="legacy-kicker">Control</p>
          <h3>Auditoría</h3>
          <p>Consulta centralizada de acciones, usuarios responsables, fechas, importes y motivos.</p>
          <Link className="button secondary inline-button" to="/admin/auditoria">Ver auditoría</Link>
        </article>
        <article className="panel legacy-panel feature-card">
          <p className="legacy-kicker">Configuración</p>
          <h3>Tarifas y reglas</h3>
          <p>Parámetros de cuotas, anualidad, aportes de ingreso, excepciones y vigencias.</p>
          <Link className="button secondary inline-button" to="/admin/cuotas">Abrir configuración</Link>
        </article>
        <article className="panel legacy-panel feature-card">
          <p className="legacy-kicker">Próximo módulo</p>
          <h3>Actividades</h3>
          <p>Retiros, San Juan, Club de Damas y otras actividades con subcontabilidad propia.</p>
        </article>
      </div>
    </section>
  )
}
