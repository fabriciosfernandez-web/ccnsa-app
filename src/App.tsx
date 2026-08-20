import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppShell } from './layouts/AppShell'
import { AdminDashboard } from './pages/AdminDashboard'
import { ForbiddenPage } from './pages/ForbiddenPage'
import { LoginPage } from './pages/LoginPage'
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
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'TESORERIA', 'CONSULTA']} />}>
            <Route element={<AppShell />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
