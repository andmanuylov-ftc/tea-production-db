import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Recipes from './pages/Recipes'
import SKUs from './pages/SKUs'
import PriceLists from './pages/PriceLists'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/skus" element={<SKUs />} />
        <Route path="/pricelists" element={<PriceLists />} />
      </Routes>
    </Layout>
  )
}
