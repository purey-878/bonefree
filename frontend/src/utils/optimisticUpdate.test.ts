import { describe, expect, it, vi } from 'vitest'

import { persistOptimisticUpdate } from './optimisticUpdate'

describe('optimistic updates', () => {
  it('keeps the server value after a successful quick action', async () => {
    const apply = vi.fn()
    const previous = { available: true }
    const optimistic = { available: false }
    const saved = { available: false, effectiveAvailable: false }

    await expect(persistOptimisticUpdate(previous, optimistic, apply, async () => saved)).resolves.toBe(saved)
    expect(apply.mock.calls).toEqual([[optimistic], [saved]])
  })

  it('restores the previous value when the quick action fails', async () => {
    const apply = vi.fn()
    const previous = { available: true }
    const optimistic = { available: false }
    const failure = new Error('request failed')

    await expect(persistOptimisticUpdate(previous, optimistic, apply, async () => {
      throw failure
    })).rejects.toBe(failure)
    expect(apply.mock.calls).toEqual([[optimistic], [previous]])
  })
})
