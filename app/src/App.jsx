import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Recipes from './pages/Recipes'
import SKUs from './pages/SKUs'
import Assortments from './pages/Assortments'
import AssortmentDetail from './pages/AssortmentDetail'
import Materials from './pages/Materials'
import MaterialsImport from './pages/MaterialsImport'
import Constructor from './pages/Constructor'
import Project from './pages/Project'
import PriceLists from './pages/PriceLists'
import Descriptions from './pages/Descriptions'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/assortments" replace />} />
        <Route path="/assortments" element={<Assortments />} />
        <Route path="/assortments/:code" element={<AssortmentDetail />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/skus" element={<SKUs />} />
        <Route path="/materials" element={<Materials />} />
        <Route path="/materials/import" element={<MaterialsImport />} />
        <Route path="/constructor" element={<Constructor />} />
        <Route path="/project" element={<Project />} />
        <Route path="/descriptions" element={<Descriptions />} />
        <Route path="/pricelists" element={<PriceLists />} />
      </Routes>
    </Layout>
  )
}
