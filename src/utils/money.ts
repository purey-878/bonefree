export function formatEuro(value: number | string | null | undefined) {
  const amount = Number(value ?? 0)
  const safeAmount = Number.isFinite(amount) ? amount : 0
  const sign = safeAmount < 0 ? "-" : ""
  const absolute = Math.abs(safeAmount)
  const [whole, cents] = absolute.toFixed(2).split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return `${sign}${grouped},${cents} €`
}

export function formatPercent(value: number | string | null | undefined) {
  const amount = Number(value ?? 0)
  const safeAmount = Number.isFinite(amount) ? amount : 0
  const text = safeAmount % 1 === 0 ? safeAmount.toFixed(0) : safeAmount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
  return `${text.replace(".", ",")}%`
}
