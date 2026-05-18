import { useAuth } from '../contexts/AuthContext'
import PriceListsAdmin from './PriceListsAdmin'
import PriceListsManager from './PriceListsManager'

export default function PriceLists() {
  const { profile } = useAuth()
  return profile?.role === 'admin' ? <PriceListsAdmin /> : <PriceListsManager />
}
