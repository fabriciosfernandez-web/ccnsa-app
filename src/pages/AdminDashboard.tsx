import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { AdminPageHeader } from '../components/AdminPageHeader'
import { loadFinanzas, type FinanzasSnapshot } from '../data/finanzas'
import { listSocios, type Socio } from '../data/socios'

const currentPeriod = new Date().toISOString().slice(0, 7)
const money = (value: number) => `Gs. ${Math.round(value).toLocaleString('es-PY')}`

interface DashboardData {
  socios: Socio[]
  finanzas: FinanzasSnapshot
}

export function AdminDashboard() {
  const { profile } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([listSocios(), loadFinanzas(currentPeriod)])
      .then(([socios, finanzas]) => {
        if (active) setData({ socios, finanzas })
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'No fue posible cargar el resumen institucional.')
      })
    return () => { active = false }
  }, [])

  const sociosActivos = data?.socios.filter((item) => item.estado === 'ACTIVO').length ?? 0
  const finanzas = data?.finanzas.totales

  return (
    <section className="page-stack legacy-page-stack enterprise-dashboard">
      <AdminPageHeader
        eyebrow="Gestión institucional"
        title={profile?.role === 'CONSULTA' ? 'Panel de consulta' : 'Panel de gestión'}
        description="Vista ejecutiva de socios, cobranza y finanzas. Los indicadores reflejan exclusivamente los datos disponibles en este entorno."
        meta={(
          <>
            <span className="status-badge neutral">Periodo · {currentPeriod}</span>
            <span className="status-badge neutral">Rol · {profile?.role}</span>
          </>
        )}
        actions={<Link className="button primary" to="/admin/finanzas">Abrir Finanzas</Link>}
      />

      {error && <div className="notice error">{error}</div>}

      <div className="metric-grid legacy-metric-grid dashboard-kpis">
        <article className="metric-card legacy-metric-card">
          <span>Socios activos</span>
          <strong>{data ? sociosActivos : '—'}</strong>
          <small>{data ? `${data.socios.length} registro(s) disponibles en DEV.` : 'Cargando padrón…'}</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Cobranza del mes</span>
          <strong>{finanzas ? money(finanzas.cobrosSocios) : '—'}</strong>
          <small>Pagos de socios registrados en {currentPeriod}.</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Egresos del mes</span>
          <strong>{finanzas ? money(finanzas.egresosTotales) : '—'}</strong>
          <small>Salidas financieras vigentes del periodo.</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Resultado del mes</span>
          <strong>{finanzas ? money(finanzas.resultado) : '—'}</strong>
          <small>Ingresos totales menos egresos vigentes.</small>
        </article>
      </div>

      <div className="dashboard-grid">
        <article className="panel legacy-panel">
          <div className="panel-heading-row">
            <div>
              <p className="legacy-kicker">Espacio de trabajo</p>
              <h3>Módulos principales</h3>
              <p className="muted">Accesos operativos organizados por función, con permisos independientes por rol.</p>
            </div>
          </div>

          <div className="dashboard-module-list">
            <Link className="dashboard-module-row" to="/admin/socios">
              <span className="dashboard-module-icon" aria-hidden="true">S</span>
              <span className="dashboard-module-copy"><strong>Socios y cuotas</strong><small>Estado de cuenta, obligaciones, pagos, categorías y saldos.</small></span>
              <span className="dashboard-module-arrow" aria-hidden="true">›</span>
            </Link>
            <Link className="dashboard-module-row" to="/admin/finanzas">
              <span className="dashboard-module-icon" aria-hidden="true">F</span>
              <span className="dashboard-module-copy"><strong>Finanzas</strong><small>Ingresos, egresos, balance mensual, filtros y exportación.</small></span>
              <span className="dashboard-module-arrow" aria-hidden="true">›</span>
            </Link>
            <Link className="dashboard-module-row" to="/admin/auditoria">
              <span className="dashboard-module-icon" aria-hidden="true">A</span>
              <span className="dashboard-module-copy"><strong>Auditoría</strong><small>Trazabilidad central de acciones, actores, importes y motivos.</small></span>
              <span className="dashboard-module-arrow" aria-hidden="true">›</span>
            </Link>
            <Link className="dashboard-module-row" to="/admin/cuotas">
              <span className="dashboard-module-icon" aria-hidden="true">C</span>
              <span className="dashboard-module-copy"><strong>Tarifas y configuración</strong><small>Tarifas, generación mensual, reglas especiales y excepciones.</small></span>
              <span className="dashboard-module-arrow" aria-hidden="true">›</span>
            </Link>
          </div>
        </article>

        <div className="dashboard-side-stack">
          <article className="panel legacy-panel">
            <div className="panel-heading-row"><div><p className="legacy-kicker">Control</p><h3>Estado del sistema</h3></div></div>
            <div className="dashboard-status-list">
              <div className="dashboard-status-item"><span>Finanzas</span><span className="status-badge success">Operativo</span></div>
              <div className="dashboard-status-item"><span>Auditoría central</span><span className="status-badge success">Activa</span></div>
              <div className="dashboard-status-item"><span>Migración productiva</span><span className="status-badge neutral">Pendiente</span></div>
              <div className="dashboard-status-item"><span>Actividades</span><span className="status-badge neutral">Próximo módulo</span></div>
            </div>
          </article>

          <article className="panel legacy-panel">
            <p className="legacy-kicker">Siguiente etapa</p>
            <h3>Actividades</h3>
            <p>Retiros, San Juan, Club de Damas y otras iniciativas tendrán subcontabilidad propia, integrada al balance general sin duplicar movimientos.</p>
          </article>
        </div>
      </div>
    </section>
  )
}
