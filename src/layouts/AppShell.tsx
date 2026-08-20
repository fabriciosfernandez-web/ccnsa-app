import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export function AppShell() {
  const { profile, logout } = useAuth()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">CCNSA</p>
          <h1>Gestión</h1>
        </div>

        <nav className="nav-list" aria-label="Navegación principal">
          {profile?.role === 'SOCIO' ? (
            <NavLink to="/socio" className={({ isActive }) => (isActive ? 'active' : '')}>
              Mi estado de cuenta
            </NavLink>
          ) : (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
              Panel de gestión
            </NavLink>
          )}
        </nav>

        <div className="sidebar-user">
          <strong>{profile?.displayName}</strong>
          <span>{profile?.role}</span>
          <button className="button secondary" type="button" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
