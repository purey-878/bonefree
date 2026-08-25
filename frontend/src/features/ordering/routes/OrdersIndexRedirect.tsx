import { Navigate } from 'react-router-dom'

import { readActiveOrder } from '../../../components/orderStatusStorage'
import { useAuth } from '../../../hooks'

export default function OrdersIndexRedirect() {
  const { isAuthenticated, loading } = useAuth()
  const activeOrder = readActiveOrder()

  if (activeOrder?.accessToken) {
    return <Navigate to={`/orders/${activeOrder.orderId}`} replace />
  }
  if (loading) return null
  return <Navigate to={isAuthenticated ? '/profile?tab=orders' : '/menu'} replace />
}
