import { test, expect } from '@playwright/test'

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test.describe(`invalid resource URLs at ${viewport.width}px`, () => {
    test.use({ viewport })
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('bonefree_locale', 'en-GB')
        localStorage.setItem('bonefree:cookie_consent', JSON.stringify({ accepted: true, version: 1, acceptedAt: new Date().toISOString() }))
        sessionStorage.setItem('bonefree:prototype_notice_dismissed', 'true')
      })
    })

    for (const resource of ['product', 'orders']) {
      test(`${resource} shows not found for malformed IDs without requesting the resource`, async ({ page }) => {
        test.setTimeout(60000)
        const resourceRequests: string[] = []
        page.on('request', request => {
          const path = new URL(request.url()).pathname
          if (/^\/(products|checkout\/orders)\/[^/]+/.test(path)) resourceRequests.push(path)
        })
        for (const id of ['text', 'text1', '-1', '1.5', '1e2', '0', '9007199254740992']) {
          await page.goto(`/${resource}/${id}`)
          await expect(page.locator('.resource-not-found-page')).toBeVisible()
          await expect(page.getByRole('banner')).toHaveCount(1)
          await expect(page.locator('.pd-error, .pd-loading')).toHaveCount(0)
        }
        expect(resourceRequests).toEqual([])
      })
    }

    test('a well-formed missing product also renders not found after an API 404', async ({ page }) => {
      const response = page.waitForResponse(response => new URL(response.url()).pathname === '/products/2147483647')
      await page.goto('/product/2147483647')
      expect((await response).status()).toBe(404)
      await expect(page.locator('.resource-not-found-page')).toBeVisible()
      await expect(page.locator('.pd-error')).toHaveCount(0)
    })
  })
}
