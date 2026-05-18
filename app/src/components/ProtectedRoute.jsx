import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-forest-dark text-muted text-sm">
        Загрузка…
      </div>
    )
  }

  if (!user || !profile) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (adminOnly && profile.role !== 'admin') {
    return <Navigate to="/pricelists" replace />
  }

  return children
}
