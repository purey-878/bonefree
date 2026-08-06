const ACTIVE_ORDER_KEY = "active_order_id"

export function rememberActiveOrder(orderId: number) {
  localStorage.setItem(ACTIVE_ORDER_KEY, String(orderId))
  window.dispatchEvent(new Event("active-order-updated"))
}

export { ACTIVE_ORDER_KEY }
