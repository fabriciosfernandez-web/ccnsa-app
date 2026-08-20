import { useAuth } from '../auth/AuthProvider'

export function AdminDashboard() {
  const { profile } = useAuth()

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gestión interna</p>
          <h2>Panel de {profile?.role === 'CONSULTA' ? 'consulta' : 'administración'}</h2>
          <p className="muted">Base preparada para socios, obligaciones, pagos, ingresos, egresos y actividades.</p>
        </div>
      </header>

      <div className="metric-grid">
        <article className="metric-card">
          <span>Socios</span>
          <strong>—</strong>
          <small>Se incorporarán después de la conciliación de la base 2026.</small>
        </article>
        <article className="metric-card">
          <span>Cobranza del mes</span>
          <strong>—</strong>
          <small>Calculada desde movimientos registrados, no desde celdas manuales.</small>
        </article>
        <article className="metric-card">
          <span>Eventos pendientes</span>
          <strong>0</strong>
          <small>Sin datos productivos en esta fase.</small>
        </article>
      </div>

      <div className="card-grid">
        <article className="panel">
          <h3>Socios y cuotas</h3>
          <p>Alta, estado, categoría, obligaciones periódicas y pagos aplicados.</p>
        </article>
        <article className="panel">
          <h3>Finanzas</h3>
          <p>Ingresos y egresos normalizados con trazabilidad del movimiento.</p>
        </article>
        <article className="panel">
          <h3>Actividades</h3>
          <p>Eventos como retiros, San Juan, Club de Damas y otras actividades con su propia contabilidad.</p>
        </article>
      </div>
    </section>
  )
}
