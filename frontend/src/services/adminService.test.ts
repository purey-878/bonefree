import { afterEach, describe, expect, it, vi } from 'vitest'

import * as generated from '../api/generated'
import { setIngredientAvailability, setProductAvailability } from './adminService'

describe('admin availability services', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends the intended product value instead of a blind toggle', async () => {
    const request = vi.spyOn(generated, 'adminManagementSetProductAvailability').mockResolvedValue({
      data: {
        product_id: 7,
        product_display_id: 'P7',
        name: 'Dish',
        available: false,
        effective_available: false,
        unavailable_base_ingredients: [],
      },
    } as never)

    await expect(setProductAvailability(7, false)).resolves.toMatchObject({
      productId: 7,
      available: false,
      effectiveAvailable: false,
    })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      path: { product_id: '7' },
      body: { available: false },
      throwOnError: true,
    }))
  })

  it('forwards ingredient failures so the CRUD can roll back', async () => {
    const failure = new Error('request failed')
    const request = vi.spyOn(generated, 'adminManagementSetIngredientAvailability').mockRejectedValue(failure)

    await expect(setIngredientAvailability(3, true)).rejects.toBe(failure)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      path: { ingredient_id: 3 },
      body: { available: true },
      throwOnError: true,
    }))
  })
})
