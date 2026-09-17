import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth, userProfileContextLabel } from '../auth/AuthProvider'
import { appEnvironment } from '../lib/firebase'
import { subscribeNotificationsForSocio } from '../notifications/firestoreNotificationService'
import { useTheme, type ThemePreference } from '../theme/ThemeProvider'

type NavIconName = 'dashboard' | 'users' | 'finance' | 'activity' | 'settings' | 'rules' | 'audit' | 'migration' | 'check' | 'account' | 'bell'

function NavIcon({ name }: { name: NavIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const paths: Record<NavIconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    finance: <><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M22 19V3" /><path d="M2 21h22" /></>,
    activity: <><path d="M4 20V10" /><path d="M20 20V10" /><path d="M2 20h20" /><path d="M6 10V6l6-3 6 3v4" /><path d="M9 20v-5h6v5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1a1.7 1.7 0 0 0-1.4-1.66 1.7 1.7 0 0 0-1.48.46l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.76 8.2a1.7 1.7 0 0 0-.46-1.48l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.8 4.76a1.7 1.7 0 0 0 1.48-.46l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.11.36.32.7.6 1 .3.27.68.42 1.1.4h.1v4h-.1A1.7 1.7 0 0 0 19.4 15Z" /></>,
    rules: <><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h7" /><circle cx="18" cy="12" r="2" /><circle cx="15" cy="18" r="2" /></>,
    audit: <><path d="M9 3h6l4 4v14H5V3h4Z" /><path d="M14 3v5h5" /><path d="m8 14 2 2 5-5" /></>,
    migration: <><path d="M7 7h10" /><path d="m14 4 3 3-3 3" /><path d="M17 17H7" /><path d="m10 20-3-3 3-3" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  }

  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name]}</svg>
}

function navItem(to: string, label: string, icon: NavIconName, end = false, badge = 0) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
      <NavIcon name={icon} />
      <span className="nav-item-label">{label}</span>
      {badge > 0 && <span className="nav-unread-badge" aria-label={`${badge} sin leer`}>{badge > 99 ? '99+' : badge}</span>}
    </NavLink>
  )
}

function routeMeta(pathname: string) {
  if (pathname.startsWith('/admin/migracion/preflight')) return { section: 'Herramientas DEV', title: 'Preflight de migración' }
  if (pathname.startsWith('/admin/migracion')) return { section: 'Herramientas DEV', title: 'Migración 2026' }
  if (pathname.startsWith('/admin/auditoria')) return { section: 'Control', title: 'Auditoría' }
  if (pathname.startsWith('/admin/reglas-cobro')) return { section: 'Configuración', title: 'Reglas especiales' }
  if (pathname.startsWith('/admin/cuotas')) return { section: 'Configuración', title: 'Tarifas y generación' }
  if (pathname.startsWith('/admin/actividades')) return { section: 'Gestión', title: 'Actividades' }
  if (pathname.startsWith('/admin/finanzas')) return { section: 'Gestión', title: 'Finanzas' }
  if (pathname.startsWith('/admin/socios')) return { section: 'Gestión', title: 'Socios y cuotas' }
  if (pathname === '/admin') return { section: 'Gestión institucional', title: 'Panel de gestión' }
  if (pathname.startsWith('/socio/notificaciones')) return { section: 'Portal del socio', title: 'Notificaciones' }
  return { section: 'Portal del socio', title: 'Mi estado de cuenta' }
}

export function AppShell() {
  const { profile, logout } = useAuth()
  const location = useLocation()
  const { preference, setPreference } = useTheme()
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const meta = routeMeta(location.pathname)
  const configuredLogo = String(import.meta.env.VITE_BRAND_LOGO_URL || '').trim()
  const profileContext = userProfileContextLabel(profile)

  useEffect(() => {
    if (profile?.role !== 'SOCIO' || !profile.socioId) {
      setUnreadNotifications(0)
      return
    }

    return subscribeNotificationsForSocio(
      profile.socioId,
      (items) => setUnreadNotifications(items.filter((item) => item.status === 'UNREAD').length),
      () => setUnreadNotifications(0),
    )
  }, [profile?.role, profile?.socioId])

  return (
    <div className="app-shell legacy-app-shell">
      <aside className="sidebar legacy-sidebar">
        <div className="enterprise-brand">
          <div className="enterprise-brand-mark" aria-hidden={!configuredLogo}>
            {configuredLogo ? <img src={configuredLogo} alt="CCNSA" /> : 'CC'}
          </div>
          <div className="enterprise-brand-copy">
            <span>Centro Cultural</span>
            <strong>CCNSA</strong>
          </div>
        </div>

        {appEnvironment === 'dev' && (
          <div className="environment-chip" title="Firebase DEV · Datos de prueba">
            DEV · Entorno de prueba
          </div>
        )}

        <nav className="nav-list" aria-label="Navegación principal">
          {profile?.role === 'SOCIO' ? (
            <div className="nav-group">
              <span className="nav-group-label">Portal del socio</span>
              {navItem('/socio', 'Mi estado de cuenta', 'account', true)}
              {navItem('/socio/notificaciones', 'Notificaciones', 'bell', false, unreadNotifications)}
            </div>
          ) : (
            <>
              <div className="nav-group">
                <span className="nav-group-label">Gestión</span>
                {navItem('/admin', 'Panel', 'dashboard', true)}
                {navItem('/admin/socios', 'Socios y cuotas', 'users')}
                {navItem('/admin/finanzas', 'Finanzas', 'finance')}
                {navItem('/admin/actividades', 'Actividades', 'activity')}
              </div>

              <div className="nav-group">
                <span className="nav-group-label">Configuración</span>
                {navItem('/admin/cuotas', 'Tarifas y generación', 'settings')}
                {navItem('/admin/reglas-cobro', 'Reglas especiales', 'rules')}
              </div>

              <div className="nav-group">
                <span className="nav-group-label">Control</span>
                {navItem('/admin/auditoria', 'Auditoría', 'audit')}
              </div>

              {profile?.role === 'ADMIN' && (
                <div className="nav-group nav-group-tools">
                  <span className="nav-group-label">Herramientas DEV</span>
                  {navItem('/admin/migracion', 'Migración 2026', 'migration', true)}
                  {navItem('/admin/migracion/preflight', 'Preflight', 'check')}
                </div>
              )}
            </>
          )}
        </nav>

        <div className="sidebar-user">
          <span className="legacy-user-label">Sesión iniciada</span>
          <strong>{profile?.displayName || 'Usuario'}</strong>
          <span>{profileContext}</span>
          <button className="button secondary" type="button" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main-content legacy-main-content">
        <header className="workspace-topbar">
          <div className="workspace-heading">
            <small>{meta.section}</small>
            <strong>{meta.title}</strong>
          </div>
          <div className="workspace-topbar-actions">
            <label className="theme-control">
              <span className="theme-control-label">Apariencia</span>
              <select
                aria-label="Apariencia"
                value={preference}
                onChange={(event) => setPreference(event.target.value as ThemePreference)}
              >
                <option value="system">Sistema</option>
                <option value="light">Claro</option>
                <option value="dark">Oscuro</option>
              </select>
            </label>
            <div className="workspace-user-compact">
              <strong>{profile?.displayName || 'Usuario'}</strong>
              <span>{profileContext}</span>
            </div>
          </div>
        </header>
        <div className="workspace-page">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
