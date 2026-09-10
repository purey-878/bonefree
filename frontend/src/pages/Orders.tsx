import RouteLoading from "../components/RouteLoading"
import { useAuth } from "../hooks"
import CustomerOrders from "./CustomerOrders"
import GuestOrders from "./GuestOrders"

export default function Orders() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <RouteLoading />
  return isAuthenticated ? <CustomerOrders /> : <GuestOrders />
}
