import { resolvedLocale } from "../i18n"

export function formatEuro(value: number | string | null | undefined) {
  const amount = Number(value ?? 0)
  const safeAmount = Number.isFinite(amount) ? amount : 0
  return new Intl.NumberFormat(resolvedLocale(), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount)
}

export function formatPercent(value: number | string | null | undefined) {
  const amount = Number(value ?? 0)
  const safeAmount = Number.isFinite(amount) ? amount : 0
  return new Intl.NumberFormat(resolvedLocale(), {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(safeAmount / 100)
}
