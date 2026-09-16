import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { appEnvironment } from '../lib/firebase'

export function AppShell() {
  const { profile, logout } = useAuth()

  return (
    <div className="app-shell legacy-app-shell">
      <aside className="sidebar legacy-sidebar">
        <div className="legacy-sidebar-brand">
          <div className="legacy-logo small" aria-hidden="true">CC</div>
          <div>
            <p className="legacy-kicker">Centro Cultural</p>
            <h1>CCNSA</h1>
          </div>
        </div>

        {appEnvironment === 'dev' && (
          <div className="status-badge neutral" title="Este ambiente usa Firebase DEV y datos de prueba">
            DEV · ENTORNO DE PRUEBA
          </div>
        )}

        <nav className="nav-list" aria-label="Navegación principal">
          {profile?.role === 'SOCIO' ? (
            <div className="nav-group">
              <span className="nav-group-label">Portal del socio</span>
              <NavLink to="/socio" end className={({ isActive }) => (isActive ? 'active' : '')}>
                Mi estado de cuenta
              </NavLink>
              <NavLink to="/socio/notificaciones" className={({ isActive }) => (isActive ? 'active' : '')}>
                Notificaciones
              </NavLink>
            </div>
          ) : (
            <>
              <div className="nav-group">
                <span className="nav-group-label">Gestión</span>
                <NavLink to="/admin" end className={({ isActive }) => (isActive ? 'active' : '')}>
                  Panel de gestión
                </NavLink>
                <NavLink to="/admin/socios" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Socios y cuotas
                </NavLink>
                <NavLink to="/admin/finanzas" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Finanzas
                </NavLink>
              </div>

              <div className="nav-group">
                <span className="nav-group-label">Configuración</span>
                <NavLink to="/admin/cuotas" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Tarifas y generación
                </NavLink>
                <NavLink to="/admin/reglas-cobro" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Reglas especiales
                </NavLink>
              </div>

              <div className="nav-group">
                <span className="nav-group-label">Control</span>
                <NavLink to="/admin/auditoria" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Auditoría
                </NavLink>
              </div>

              {profile?.role === 'ADMIN' && (
                <div className="nav-group nav-group-tools">
                  <span className="nav-group-label">Herramientas DEV</span>
                  <NavLink to="/admin/migracion" end className={({ isActive }) => (isActive ? 'active' : '')}>
                    Migración 2026
                  </NavLink>
                  <NavLink to="/admin/migracion/preflight" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Preflight de migración
                  </NavLink>
                </div>
              )}
            </>
          )}
        </nav>

        <div className="sidebar-user">
          <span className="legacy-user-label">Sesión iniciada</span>
          <strong>{profile?.displayName}</strong>
          <span>{profile?.role}</span>
          <button className="button secondary" type="button" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main-content legacy-main-content">
        <div className="legacy-accent page-accent" />
        <Outlet />
      </main>
    </div>
  )
}
