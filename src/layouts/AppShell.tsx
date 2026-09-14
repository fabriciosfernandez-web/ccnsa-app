import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

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

        <nav className="nav-list" aria-label="Navegación principal">
          {profile?.role === 'SOCIO' ? (
            <>
              <NavLink to="/socio" end className={({ isActive }) => (isActive ? 'active' : '')}>
                Mi estado de cuenta
              </NavLink>
              <NavLink to="/socio/notificaciones" className={({ isActive }) => (isActive ? 'active' : '')}>
                Notificaciones
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/admin" end className={({ isActive }) => (isActive ? 'active' : '')}>
                Panel de gestión
              </NavLink>
              <NavLink to="/admin/socios" className={({ isActive }) => (isActive ? 'active' : '')}>
                Socios y cuotas
              </NavLink>
              <NavLink to="/admin/cuotas" className={({ isActive }) => (isActive ? 'active' : '')}>
                Tarifas y generación
              </NavLink>
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
