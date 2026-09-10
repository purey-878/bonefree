import { test, expect, type Page } from '@playwright/test'

async function holdPageModule(page: Page, name: string) {
  let release!: () => void
  let requested!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { requested = resolve })
  await page.route(`**/src/pages/${name}.tsx`, async route => {
    requested()
    await pending
    await route.continue()
  })
  return { started, release }
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test.describe(`navigation at ${viewport.width}px`, () => {
    test.use({ viewport })

    test.beforeEach(async ({ page }) => {
      // The legal API fixture deliberately starts with an empty navigation menu.
      await page.route('**/public/organization-experience', async route => {
        const response = await route.fetch()
        const data = await response.json()
        data.experience.navigation = [
          { id: 'home', route_id: 'home', label: 'Home', enabled: true },
          { id: 'menu', route_id: 'menu', label: 'Menu', enabled: true },
        ]
        await route.fulfill({ response, json: data })
      })
      await page.addInitScript(() => {
        localStorage.setItem('bonefree_locale', 'en-GB')
        localStorage.setItem('bonefree:cookie_consent', JSON.stringify({ accepted: true, version: 1, acceptedAt: new Date().toISOString() }))
        sessionStorage.setItem('bonefree:prototype_notice_dismissed', 'true')
      })
    })

    test('keeps navigation visible and the footer below the viewport during the first load', async ({ page }) => {
      const module = await holdPageModule(page, 'About')
      await page.goto('/about', { waitUntil: 'domcontentloaded' })
      await module.started
      const header = page.getByRole('banner')
      await expect(header).toBeVisible()
      await expect(page.getByRole('status', { name: 'Loading...' })).toBeVisible()
      await header.evaluate(element => { element.setAttribute('data-persistent-header', 'true') })
      expect(await page.locator('footer').evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(viewport.height)
      module.release()
      await expect(page.locator('.route-loading')).toHaveCount(0)
      await expect(header).toHaveAttribute('data-persistent-header', 'true')
      await expect(header).toBeInViewport()
    })

    test('retains the current page while a new route loads and resets scroll when it is ready', async ({ page }) => {
      await page.goto('/about')
      await expect(page.locator('.app-route-stage h1')).toBeVisible()
      const previousTitle = await page.locator('.app-route-stage h1').textContent()
      const header = page.getByRole('banner')
      await header.evaluate(element => { element.setAttribute('data-persistent-header', 'true') })
      const module = await holdPageModule(page, 'Terms')
      await page.locator('footer a[href="/terms"]').click()
      await module.started
      await expect(header).toHaveAttribute('data-persistent-header', 'true')
      await expect(page.locator('.app-route-stage h1')).toHaveText(previousTitle!)
      await expect(page.locator('.route-loading')).toHaveCount(0)
      expect(await page.locator('.app-route-stage').evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(viewport.height)
      module.release()
      await expect(page.locator('.legal-page')).toBeVisible()
      await expect(header).toHaveAttribute('data-persistent-header', 'true')
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
      expect(await page.locator('footer').evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(viewport.height)

      await page.goBack()
      await expect(page.locator('.app-route-stage h1')).toHaveText(previousTitle!)
      await expect(header).toHaveAttribute('data-persistent-header', 'true')
    })

    test('keeps one header through menu navigation and preserves the page beneath the basket', async ({ page }) => {
      await page.goto('/about')
      await expect(page.locator('.app-route-stage h1')).toBeVisible()
      const header = page.getByRole('banner')
      await header.evaluate(element => { element.setAttribute('data-persistent-header', 'true') })
      if (viewport.width < 768) {
        await page.getByRole('button', { name: 'Open menu', exact: true }).click()
        await page.getByRole('complementary', { name: 'Mobile navigation' }).getByRole('link', { name: 'Menu', exact: true }).click()
        await expect(page.getByRole('complementary', { name: 'Mobile navigation' })).toHaveCount(0)
      } else {
        await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Menu', exact: true }).click()
      }
      await expect(page.locator('.menu-page')).toBeVisible()
      await expect(header).toHaveCount(1)
      await expect(header).toHaveAttribute('data-persistent-header', 'true')
      await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
      const title = await page.locator('.app-route-stage h1').textContent()
      await header.getByRole('link', { name: 'Basket', exact: true }).filter({ visible: true }).click()
      await expect(page.locator('.cart-page-overlay')).toBeVisible()
      await expect(page.locator('.app-route-stage h1')).toHaveText(title!)
      await expect(header).toHaveCount(1)
      await expect(header).toHaveAttribute('data-persistent-header', 'true')
      await page.locator('.cart-close').click()
      await expect(page.locator('.cart-page-overlay')).toHaveCount(0)
      await expect(page.locator('.app-route-stage h1')).toHaveText(title!)
      await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
    })
  })
}
