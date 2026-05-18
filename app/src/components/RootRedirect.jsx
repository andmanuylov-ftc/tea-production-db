import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RootRedirect() {
  const { profile } = useAuth()
  const target = profile?.role === 'admin' ? '/assortments' : '/pricelists'
  return <Navigate to={target} replace />
}
