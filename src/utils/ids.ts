export function formatProductId(id: number | string | null | undefined): string {
  return formatPrefixedId(id, "PRD")
}

export function formatCategoryId(id: number | string | null | undefined): string {
  return formatPrefixedId(id, "CAT")
}

function formatPrefixedId(id: number | string | null | undefined, prefix: string): string {
  const numericId = Number(id)
  if (!Number.isFinite(numericId) || numericId < 1) return `${prefix}-000`
  return `${prefix}-${Math.trunc(numericId).toString().padStart(3, "0")}`
}
