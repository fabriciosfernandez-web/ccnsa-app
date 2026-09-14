import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, type UserRole } from './AuthProvider'

export function ProtectedRoute({ allowedRoles }: { allowedRoles?: UserRole[] }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return <div className="screen-message">Cargando sesión…</div>
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/sin-acceso" replace />
  }

  return <Outlet />
}
