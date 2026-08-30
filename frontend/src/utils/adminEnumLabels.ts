import i18n from "../i18n"
import type { AdminRole } from "../types/admin"

export const ADMIN_ROLES: AdminRole[] = ["owner", "manager", "waiter", "chef"]

const PAYMENT_METHOD_KEYS: Record<string, string> = {
  counter: "orders.payment.counter",
  card: "orders.payment.card",
  mbway: "orders.payment.mbway",
}

const PAYMENT_STATUS_KEYS: Record<string, string> = {
  paid: "orders.payment.paid",
  unpaid: "orders.payment.unpaid",
}

const ADMIN_ROLE_KEYS: Record<AdminRole, string> = {
  owner: "roles.owner",
  manager: "roles.manager",
  waiter: "roles.waiter",
  chef: "roles.chef",
}

function readableFallback(value: string | null | undefined): string {
  return value?.replace(/_/g, " ") || "-"
}

export function formatPaymentMethod(method: string | null | undefined): string {
  const key = method ? PAYMENT_METHOD_KEYS[method] : null
  return key ? i18n.t(key, { ns: "admin" }) : readableFallback(method)
}

export function formatPaymentStatus(status: string | null | undefined): string {
  const key = status ? PAYMENT_STATUS_KEYS[status] : null
  return key ? i18n.t(key, { ns: "admin" }) : readableFallback(status)
}

export function formatAdminRole(role: AdminRole | string | null | undefined): string {
  const key = role ? ADMIN_ROLE_KEYS[role as AdminRole] : null
  return key ? i18n.t(key, { ns: "admin" }) : readableFallback(role)
}
