import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import RootRedirect from './components/RootRedirect'
import Login from './pages/Login'
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

const adminOnly = (el) => <ProtectedRoute adminOnly>{el}</ProtectedRoute>

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<RootRedirect />} />
                <Route path="/pricelists" element={<PriceLists />} />
                <Route path="/assortments" element={adminOnly(<Assortments />)} />
                <Route path="/assortments/:code" element={adminOnly(<AssortmentDetail />)} />
                <Route path="/dashboard" element={adminOnly(<Dashboard />)} />
                <Route path="/recipes" element={adminOnly(<Recipes />)} />
                <Route path="/skus" element={adminOnly(<SKUs />)} />
                <Route path="/materials" element={adminOnly(<Materials />)} />
                <Route path="/materials/import" element={adminOnly(<MaterialsImport />)} />
                <Route path="/constructor" element={adminOnly(<Constructor />)} />
                <Route path="/project" element={adminOnly(<Project />)} />
                <Route path="/descriptions" element={adminOnly(<Descriptions />)} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
