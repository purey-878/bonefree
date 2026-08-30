export const ORDER_PROGRESS_STATUSES = [
  "pending",
  "confirmed",
  "in_preparation",
  "ready",
  "delivered",
] as const

export type OrderProgressStatus = typeof ORDER_PROGRESS_STATUSES[number]

export type OrderProgressStepState = "complete" | "current" | "upcoming"

export function orderProgressStepState(status: string, step: OrderProgressStatus): OrderProgressStepState {
  const currentIndex = ORDER_PROGRESS_STATUSES.indexOf(status as OrderProgressStatus)
  const stepIndex = ORDER_PROGRESS_STATUSES.indexOf(step)

  if (currentIndex < 0 || stepIndex > currentIndex) return "upcoming"
  if (stepIndex === currentIndex) return "current"
  return "complete"
}
