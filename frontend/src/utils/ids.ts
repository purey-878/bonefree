export function parseResourcePathId(value: string | undefined, prefix?: 'PRD' | 'CAT'): number | null {
  if (!value) return null
  const pattern = prefix ? new RegExp(`^(?:${prefix}-?)?([0-9]+)$`, 'i') : /^([0-9]+)$/
  const match = pattern.exec(value)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

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
