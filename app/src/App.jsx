import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Recipes from './pages/Recipes'
import SKUs from './pages/SKUs'
import PriceLists from './pages/PriceLists'
import Assortments from './pages/Assortments'
import AssortmentDetail from './pages/AssortmentDetail'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/assortments" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/assortments" element={<Assortments />} />
        <Route path="/assortments/:code" element={<AssortmentDetail />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/skus" element={<SKUs />} />
        <Route path="/pricelists" element={<PriceLists />} />
      </Routes>
    </Layout>
  )
}
