import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, userProfileContextLabel } from '../auth/AuthProvider'
import { AdminPageHeader } from '../components/AdminPageHeader'
import { loadFinanzas, type FinanzasSnapshot } from '../data/finanzas'
import { loadActividades, type ActividadesSnapshot } from '../data/actividades'
import { listSocios, loadPortfolioSummary, type PortfolioSummary, type Socio } from '../data/socios'

function localPeriod() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 7)
}

const currentPeriod = localPeriod()
const money = (value: number) => `Gs. ${Math.round(value).toLocaleString('es-PY')}`

interface DashboardData {
  socios: Socio[]
  finanzas: FinanzasSnapshot
  cartera: PortfolioSummary
  actividades: ActividadesSnapshot
}

export function AdminDashboard() {
  const { profile } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([listSocios(), loadFinanzas(currentPeriod), loadPortfolioSummary(), loadActividades()])
      .then(([socios, finanzas, cartera, actividades]) => {
        if (active) setData({ socios, finanzas, cartera, actividades })
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'No fue posible cargar el resumen institucional.')
      })
    return () => { active = false }
  }, [])

  const sociosActivos = data?.socios.filter((item) => item.estado === 'ACTIVO').length ?? 0
  const finanzas = data?.finanzas.totales
  const cartera = data?.cartera
  const actividades = data?.actividades
  const actividadesActivas = actividades?.actividades.filter((item) => item.estado === 'ACTIVA').length ?? 0
  const actividadesPlanificadas = actividades?.actividades.filter((item) => item.estado === 'PLANIFICADA').length ?? 0
  const inscripcionesConfirmadas = actividades?.inscripciones.filter((item) => item.estado === 'CONFIRMADA').length ?? 0
  const inscripcionesEspera = actividades?.inscripciones.filter((item) => item.estado === 'ESPERA').length ?? 0
  const pagosActividadPendientes = actividades?.inscripciones.filter(
    (item) => item.estado === 'CONFIRMADA' && item.estadoPago === 'PENDIENTE',
  ).length ?? 0
  const proximaActividad = actividades?.actividades
    .filter((item) => item.estado === 'PLANIFICADA' || item.estado === 'ACTIVA')
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))[0]
  const profileContext = userProfileContextLabel(profile)

  return (
    <section className="page-stack legacy-page-stack enterprise-dashboard">
      <AdminPageHeader
        eyebrow="Gestión institucional"
        title={profile?.role === 'CONSULTA' ? 'Panel de consulta' : 'Panel de gestión'}
        description="Resumen ejecutivo de socios, cobranza, cartera y resultado financiero para el seguimiento institucional."
        meta={(
          <>
            <span className="status-badge neutral">Periodo · {currentPeriod}</span>
            <span className="status-badge neutral">{profileContext}</span>
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
          <span>Cuentas por cobrar</span>
          <strong>{cartera ? money(cartera.saldoPendiente) : '—'}</strong>
          <small>{cartera ? `${cartera.sociosConSaldoPendiente} socio(s) con saldo pendiente.` : 'Calculando cartera…'}</small>
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
            <Link className="dashboard-module-row" to="/admin/actividades">
              <span className="dashboard-module-icon" aria-hidden="true">A</span>
              <span className="dashboard-module-copy"><strong>Actividades</strong><small>Subcontabilidad de retiros, San Juan, Club de Damas, Academia y otras iniciativas.</small></span>
              <span className="dashboard-module-arrow" aria-hidden="true">›</span>
            </Link>
            <Link className="dashboard-module-row" to="/admin/auditoria">
              <span className="dashboard-module-icon" aria-hidden="true">C</span>
              <span className="dashboard-module-copy"><strong>Auditoría</strong><small>Trazabilidad central de acciones, actores, importes y motivos.</small></span>
              <span className="dashboard-module-arrow" aria-hidden="true">›</span>
            </Link>
            <Link className="dashboard-module-row" to="/admin/cuotas">
              <span className="dashboard-module-icon" aria-hidden="true">T</span>
              <span className="dashboard-module-copy"><strong>Tarifas y configuración</strong><small>Tarifas, generación mensual, reglas especiales y excepciones.</small></span>
              <span className="dashboard-module-arrow" aria-hidden="true">›</span>
            </Link>
            {profile?.role === 'ADMIN' && (
              <Link className="dashboard-module-row" to="/admin/usuarios">
                <span className="dashboard-module-icon" aria-hidden="true">U</span>
                <span className="dashboard-module-copy"><strong>Usuarios y accesos</strong><small>Vinculación de cuentas, roles y habilitación de acceso al portal.</small></span>
                <span className="dashboard-module-arrow" aria-hidden="true">›</span>
              </Link>
            )}
          </div>
        </article>

        <div className="dashboard-side-stack">
          <article className="panel legacy-panel">
            <div className="panel-heading-row"><div><p className="legacy-kicker">Control</p><h3>Estado del sistema</h3></div></div>
            <div className="dashboard-status-list">
              <div className="dashboard-status-item"><span>Finanzas</span><span className="status-badge success">Operativo DEV</span></div>
              <div className="dashboard-status-item"><span>Actividades</span><span className="status-badge neutral">Prueba funcional pendiente</span></div>
              <div className="dashboard-status-item"><span>Portal del socio</span><span className="status-badge success">Operativo DEV</span></div>
              <div className="dashboard-status-item"><span>Usuarios y accesos</span><span className="status-badge success">Operativo DEV</span></div>
              <div className="dashboard-status-item"><span>Web Push</span><span className="status-badge neutral">Pendiente de prueba</span></div>
              <div className="dashboard-status-item"><span>Auditoría central</span><span className="status-badge success">Activa</span></div>
              <div className="dashboard-status-item"><span>Migración productiva</span><span className="status-badge neutral">Pendiente</span></div>
            </div>
          </article>

          <article className="panel legacy-panel">
            <p className="legacy-kicker">Operación</p>
            <h3>Actividades e inscripciones</h3>
            <div className="dashboard-status-list">
              <div className="dashboard-status-item"><span>Actividades activas</span><strong>{data ? actividadesActivas : '—'}</strong></div>
              <div className="dashboard-status-item"><span>Planificadas</span><strong>{data ? actividadesPlanificadas : '—'}</strong></div>
              <div className="dashboard-status-item"><span>Inscripciones confirmadas</span><strong>{data ? inscripcionesConfirmadas : '—'}</strong></div>
              <div className="dashboard-status-item"><span>Lista de espera</span><span className={`status-badge ${inscripcionesEspera > 0 ? 'neutral' : 'success'}`}>{data ? inscripcionesEspera : '—'}</span></div>
              <div className="dashboard-status-item"><span>Pagos de actividad pendientes</span><span className={`status-badge ${pagosActividadPendientes > 0 ? 'danger' : 'success'}`}>{data ? pagosActividadPendientes : '—'}</span></div>
              <div className="dashboard-status-item"><span>Próxima actividad</span><strong>{proximaActividad ? `${proximaActividad.nombre} · ${proximaActividad.fechaInicio}` : '—'}</strong></div>
            </div>
          </article>

          <article className="panel legacy-panel">
            <p className="legacy-kicker">Atención requerida</p>
            <h3>Seguimiento de cartera</h3>
            <div className="dashboard-status-list">
              <div className="dashboard-status-item"><span>Socios con saldo pendiente</span><strong>{cartera ? cartera.sociosConSaldoPendiente : '—'}</strong></div>
              <div className="dashboard-status-item"><span>Obligaciones pendientes</span><strong>{cartera ? cartera.obligacionesPendientes : '—'}</strong></div>
              <div className="dashboard-status-item"><span>Obligaciones vencidas</span><span className={`status-badge ${cartera?.obligacionesVencidas ? 'danger' : 'success'}`}>{cartera ? cartera.obligacionesVencidas : '—'}</span></div>
              <div className="dashboard-status-item"><span>Importe vencido</span><strong>{cartera ? money(cartera.importeVencido) : '—'}</strong></div>
              <div className="dashboard-status-item"><span>Saldo a favor global</span><strong>{cartera ? money(cartera.saldoFavor) : '—'}</strong></div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
