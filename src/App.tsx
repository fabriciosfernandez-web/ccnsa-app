import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppShell } from './layouts/AppShell'
import { AdminActividadesPage } from './pages/AdminActividadesPage'
import { AdminAuditoriaPage } from './pages/AdminAuditoriaPage'
import { AdminCuotasPage } from './pages/AdminCuotasPage'
import { AdminDashboard } from './pages/AdminDashboard'
import { AdminFinanzasPage } from './pages/AdminFinanzasPage'
import { AdminMigracionPage } from './pages/AdminMigracionPage'
import { AdminMigracionPreflightPage } from './pages/AdminMigracionPreflightPage'
import { AdminNotificationsDevPage } from './pages/AdminNotificationsDevPage'
import { AdminReglasCobroPage } from './pages/AdminReglasCobroPage'
import { AdminSociosPage } from './pages/AdminSociosPage'
import { ForbiddenPage } from './pages/ForbiddenPage'
import { LoginPage } from './pages/LoginPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { SocioDashboard } from './pages/SocioDashboard'

function HomeRedirect() {
  const { user, profile, loading } = useAuth()

  if (loading) return <div className="screen-message">Cargando…</div>
  if (!user || !profile) return <Navigate to="/login" replace />
  if (profile.role === 'SOCIO') return <Navigate to="/socio" replace />
  return <Navigate to="/admin" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/sin-acceso" element={<ForbiddenPage />} />
          <Route path="/" element={<HomeRedirect />} />

          <Route element={<ProtectedRoute allowedRoles={['SOCIO']} />}>
            <Route element={<AppShell />}>
              <Route path="/socio" element={<SocioDashboard />} />
              <Route path="/socio/notificaciones" element={<NotificationsPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'TESORERIA', 'CONSULTA']} />}>
            <Route element={<AppShell />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/socios" element={<AdminSociosPage />} />
              <Route path="/admin/finanzas" element={<AdminFinanzasPage />} />
              <Route path="/admin/actividades" element={<AdminActividadesPage />} />
              <Route path="/admin/cuotas" element={<AdminCuotasPage />} />
              <Route path="/admin/reglas-cobro" element={<AdminReglasCobroPage />} />
              <Route path="/admin/auditoria" element={<AdminAuditoriaPage />} />
              <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
                <Route path="/admin/migracion" element={<AdminMigracionPage />} />
                <Route path="/admin/migracion/preflight" element={<AdminMigracionPreflightPage />} />
                <Route path="/admin/notificaciones" element={<AdminNotificationsDevPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
