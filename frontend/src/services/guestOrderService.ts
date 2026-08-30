import {
  readGuestOrderAccesses,
  removeGuestOrderAccesses,
} from "../components/orderStatusStorage"
import { checkoutService } from "./checkoutService"

const CLAIM_BATCH_SIZE = 50
let claimInFlight: Promise<number[]> | null = null

export async function claimStoredGuestOrders(): Promise<number[]> {
  if (claimInFlight) return claimInFlight
  claimInFlight = claimStoredGuestOrdersOnce()
  try {
    return await claimInFlight
  } finally {
    claimInFlight = null
  }
}

async function claimStoredGuestOrdersOnce(): Promise<number[]> {
  const accesses = readGuestOrderAccesses()
  const claimedOrderIds: number[] = []

  for (let index = 0; index < accesses.length; index += CLAIM_BATCH_SIZE) {
    const batch = accesses.slice(index, index + CLAIM_BATCH_SIZE)
    const result = await checkoutService.claimGuestOrders(
      batch.map(({ orderId, accessToken }) => ({ orderId, accessToken })),
    )
    claimedOrderIds.push(...result.claimedOrderIds)
    removeGuestOrderAccesses(
      [...result.claimedOrderIds, ...result.rejectedOrderIds],
      index + CLAIM_BATCH_SIZE >= accesses.length,
    )
  }

  return claimedOrderIds
}
