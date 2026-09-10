import { expect, test, type Page } from '@playwright/test'

const emptyPage = { items: [], total: 0, page: 1, per_page: 20, total_pages: 0 }
const product = { id: 1, id_display: 'PRD-001', name: 'Test dish', description: 'Plant-based dish', price: 12, category: 'Food', category_id: 1, available: true, customizable: false, media: [], tags: [], ingredients: [] }
const existingReview = { review_id: 1, product_id: 1, product_display_id: 'PRD-001', customer_id: 1, customer_name: 'Ana', rating: 5, title: 'Great', comment: 'Delicious', is_owner: true, created_at: '2026-09-01T12:00:00', updated_at: '2026-09-01T12:00:00', replies: [], reactions: [] }

for (const width of [320, 390, 767]) {
  test(`mobile purchase bar and navigation stay accessible at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    await mockCustomerExperience(page)
    await page.route('**/public/organization-experience', async route => {
      const response = await route.fetch()
      const data = await response.json()
      data.experience.navigation = [
        { id: 'home', route_id: 'home', label: 'Home', enabled: true },
        { id: 'menu', route_id: 'menu', label: 'Menu', enabled: true },
      ]
      await route.fulfill({ response, json: data })
    })
    await page.route('**/products/1', route => route.fulfill({ json: { ...product, name: 'Chickpeas Tikka Masala with Basmati Rice' } }))
    await page.goto('/product/1')
    const bar = page.locator('.pd-mobile-bar')
    const navigation = page.getByRole('navigation', { name: 'Navegação inferior móvel' })
    const purchaseButton = bar.getByRole('button', { name: 'Adicionar ao carrinho', exact: true })
    await expect(purchaseButton).toBeEnabled()
    await expect(navigation.getByRole('link')).toHaveCount(4)
    await expect(navigation.getByRole('link', { name: 'Menu', exact: true })).toBeVisible()

    for (const scrollToBottom of [false, true]) {
      if (scrollToBottom) await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }))
      await expect(bar).toBeInViewport({ ratio: 1 })
      await expect(navigation).toBeInViewport({ ratio: 1 })
      const barBox = (await bar.boundingBox())!
      const navBox = (await navigation.boundingBox())!
      const buttonBox = (await purchaseButton.boundingBox())!
      expect(barBox.y + barBox.height).toBe(navBox.y)
      expect(navBox.y + navBox.height).toBe(844)
      expect(barBox.height + navBox.height).toBeLessThanOrEqual(120)
      expect(buttonBox.height).toBeGreaterThanOrEqual(44)
      expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(navBox.y)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.screenshot({ path: testInfo.outputPath('mobile-purchase-navigation.png') })
    // A larger navigation inset must move the purchase bar and page padding together.
    await page.evaluate(() => document.body.style.setProperty('--mobile-nav-height', '98px'))
    expect(await bar.evaluate(element => element.getBoundingClientRect().bottom)).toBe(746)
    expect(await page.evaluate(() => getComputedStyle(document.body).paddingBottom)).toBe('154px')
    await page.evaluate(() => document.body.style.removeProperty('--mobile-nav-height'))
    await navigation.getByRole('link', { name: 'Menu', exact: true }).click()
    await expect(page).toHaveURL(/\/menu$/)
    await expect(bar).toHaveCount(0)
    expect(await page.evaluate(() => getComputedStyle(document.body).paddingBottom)).toBe('64px')

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/product/1')
    await expect(page.locator('.pd-page h1')).toBeVisible()
    await expect(bar).toBeHidden()
    await expect(navigation).toBeHidden()
  })
}

async function mockCustomerExperience(page: Page, { authenticated = false, eligible = false, reviewed = false, coupons = false, locale = 'pt-PT' } = {}) {
  await page.addInitScript(({ authenticated, locale }) => {
    localStorage.setItem('bonefree_locale', locale)
    if (authenticated) localStorage.setItem('bonefree:token', 'browser-customer')
    localStorage.setItem('bonefree:cookie_consent', JSON.stringify({ accepted: true, version: 1, acceptedAt: new Date().toISOString() }))
    sessionStorage.setItem('bonefree:prototype_notice_dismissed', 'true')
  }, { authenticated, locale })
  const couponRequests: string[] = []
  await page.route('http://127.0.0.1:8019/**', async route => {
    const path = new URL(route.request().url()).pathname
    let json: unknown
    if (path === '/public/organization-experience') {
      const response = await route.fetch()
      const data = await response.json()
      data.experience.navigation = [
        { id: 'home', route_id: 'home', label: 'Home', enabled: true },
        { id: 'menu', route_id: 'menu', label: 'Menu', enabled: true },
      ]
      json = data
    }
    else if (path === '/me') json = { customer_id: 1, name: 'Ana', last_name: 'Silva', email: 'ana@example.com', phone: '912345678' }
    else if (path === '/cart/') json = { items: [], total: 0 }
    else if (path === '/products/1') json = product
    else if (path === '/products') json = { ...emptyPage, facets: { total_products: 0, max_price: 0, categories: [] } }
    else if (path === '/products/1/customization-options') json = { remove: [], add: [], preferences: [] }
    else if (path === '/products/1/reviews') json = reviewed ? { ...emptyPage, items: [existingReview], total: 1, total_pages: 1 } : emptyPage
    else if (path === '/products/1/reviews/stats') json = { product_id: 1, average_rating: reviewed ? 5 : null, total_reviews: reviewed ? 1 : 0 }
    else if (path === '/products/1/reviews/eligibility') json = {
      authenticated, eligible, existing_review: reviewed ? existingReview : null,
      items: eligible || reviewed ? [{ order_product_id: 1, order_id: 1, product_id: 1, product_name: 'Test dish', ordered_at: '2026-09-01T12:00:00', existing_review: reviewed ? existingReview : null }] : [],
      message: authenticated ? 'Purchase this product before leaving a review.' : 'Log in to review products you have purchased.',
    }
    else if (path === '/site-settings/loyalty-coupons') json = { enabled: coupons, qualifying_order_count: 3, qualifying_order_minimum: '50.00', discount_type: 'fixed_value', discount_value: '20.00', coupon_minimum_order: '0.00' }
    else if (path === '/checkout/coupons') { couponRequests.push(path); json = emptyPage }
    else if (path === '/profile/orders' || path === '/checkout/orders/history') json = emptyPage
    else if (path === '/profile/overview') json = {
      order_count: 3, total_items: 5, total_spent: '120.00', average_order_value: '40.00', latest_order: null,
      favorite_products: [{ product_id: 1, name: 'Test dish', quantity: 3 }],
      loyalty_progress: { current: 1, required: 3, remaining: 2, percent: 33, minimum_subtotal: '50.00' },
    }
    else { await route.continue(); return }
    await route.fulfill({ json })
  })
  return { couponRequests }
}

for (const [locale, loginText, purchaseText] of [
  ['pt-PT', 'Inicie sessão para avaliar os produtos que comprou.', 'Compre este produto para deixar uma avaliação.'],
  ['en-GB', 'Log in to review products you have purchased.', 'Purchase this product before leaving a review.'],
  ['de-DE', 'Melden Sie sich an, um gekaufte Produkte zu bewerten.', 'Kaufen Sie dieses Produkt, bevor Sie eine Bewertung abgeben.'],
]) {
  test(`guest review prompt is localized in ${locale} and only offers login`, async ({ page }) => {
    await mockCustomerExperience(page, { locale })
    await page.goto('/product/1')
    await expect(page.locator('.pd-review-login')).toContainText(loginText)
    await expect(page.locator('.pd-review-login a')).toHaveAttribute('href', '/login')
    await expect(page.locator('.pd-add-review-btn')).toHaveCount(0)
  })

  test(`customer without a purchase sees inline guidance in ${locale}`, async ({ page }) => {
    await mockCustomerExperience(page, { authenticated: true, locale })
    await page.goto('/product/1')
    await expect(page.locator('.pd-review-note')).toHaveText(purchaseText)
    await expect(page.locator('.pd-add-review-btn, .pd-review-login, .app-toast')).toHaveCount(0)
  })
}

test('eligible customers can create a review and existing reviewers can edit', async ({ page }) => {
  await mockCustomerExperience(page, { authenticated: true, eligible: true })
  await page.goto('/product/1')
  await page.getByRole('button', { name: 'Adicionar avaliação', exact: true }).click()
  await expect(page.locator('.pd-review-form')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Publicar avaliação', exact: true })).toBeEnabled()
  await page.unrouteAll({ behavior: 'wait' })
  await mockCustomerExperience(page, { authenticated: true, reviewed: true })
  await page.reload()
  await page.getByRole('button', { name: 'Editar avaliação', exact: true }).click()
  await expect(page.locator('.pd-review-form input')).toHaveValue('Great')
  await expect(page.locator('.app-toast')).toHaveCount(0)
})

for (const width of [1440, 390]) {
  for (const coupons of [false, true]) {
    test(`profile at ${width}px respects coupon settings (${coupons}) and its navigation mode`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 })
      const { couponRequests } = await mockCustomerExperience(page, { authenticated: true, coupons })
      await page.goto('/profile')
      const nav = page.locator('.profile-tabs')
      await expect(page.locator('#profile-personal')).toBeVisible()
      await expect(page.locator('.profile-stat-strip, .profile-contact-card')).toHaveCount(0)
      await expect(nav.locator('[data-profile-tab="coupons"]')).toHaveCount(coupons ? 1 : 0)

      if (width < 768) {
        await expect(page.locator('.profile-metric-card')).toHaveCount(5)
        await expect(page.locator('.profile-coupon-progress-card')).toHaveCount(coupons ? 1 : 0)
        const sectionOrder = ['personal', ...(coupons ? ['coupons'] : []), 'favorites', 'overview']
        expect(await page.locator('[data-profile-section]').evaluateAll(elements => elements.map(element => element.getAttribute('data-profile-section')))).toEqual(sectionOrder)
        for (const tab of sectionOrder) {
          await expect(page.locator(`#profile-${tab}`)).toBeVisible()
        }
        expect(await nav.evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(90)
        await page.screenshot({ path: testInfo.outputPath('profile-top.png') })
        for (const tab of [...(coupons ? ['coupons'] : []), 'favorites', 'overview', 'personal']) {
          await page.locator(`#profile-${tab}`).evaluate(element => {
            window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 84, behavior: 'instant' })
          })
          await expect(nav.locator(`[data-profile-tab="${tab}"]`)).toHaveAttribute('aria-current', 'location')
          if (tab !== 'personal') expect(await nav.evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThan(0)
        }
        await nav.locator('[data-profile-tab="favorites"]').click()
        await expect(nav.locator('[data-profile-tab="favorites"]')).toHaveAttribute('aria-current', 'location')
        await expect.poll(() => page.locator('#profile-favorites').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(84)
        await page.screenshot({ path: testInfo.outputPath('profile-favorites.png') })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      } else {
        await expect(page.locator('#profile-orders, #profile-overview, #profile-coupons, #profile-favorites')).toHaveCount(0)
        if (coupons) {
          await nav.locator('[data-profile-tab="coupons"]').click()
          await expect(page.locator('#profile-coupons')).toBeVisible()
        }
        await nav.locator('[data-profile-tab="favorites"]').click()
        await expect(page.locator('#profile-favorites')).toBeVisible()
        await nav.locator('[data-profile-tab="overview"]').click()
        await expect(page.locator('.profile-metric-card')).toHaveCount(5)
      }
      await expect(page.locator('#profile-orders, [data-profile-tab="orders"]')).toHaveCount(0)
      if (!coupons) expect(couponRequests).toEqual([])
    })
  }
}

test('mobile deep links scroll to the requested section and disabled coupons fall back to personal details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockCustomerExperience(page, { authenticated: true })
  await page.goto('/profile?tab=favorites')
  await expect(page.locator('[data-profile-tab="favorites"]')).toHaveAttribute('aria-current', 'location')
  await expect.poll(() => page.locator('#profile-favorites').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(84)
  await page.goto('/profile?tab=coupons')
  await expect(page.locator('[data-profile-tab="personal"]')).toHaveAttribute('aria-current', 'location')
  await expect(page.locator('#profile-coupons, [data-profile-tab="coupons"]')).toHaveCount(0)
})

for (const width of [390, 1440]) {
  test(`orders have a separate destination at ${width}px and old profile links redirect`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    await mockCustomerExperience(page, { authenticated: true })
    const historyRequests: string[] = []
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/profile/orders') historyRequests.push(request.url())
    })
    await page.goto('/profile')
    await expect(page.locator('#profile-personal')).toBeVisible()
    await expect(page.locator('[data-profile-tab="orders"], #profile-orders')).toHaveCount(0)
    expect(historyRequests).toEqual([])
    if (width < 768) {
      const nav = page.getByRole('navigation', { name: 'Navegação inferior móvel' })
      await expect(nav.getByRole('link')).toHaveText(['Início', 'Menu', 'Perfil', 'Pedidos'])
      await nav.getByRole('link', { name: 'Pedidos', exact: true }).click()
      await expect(nav.getByRole('link', { name: 'Pedidos', exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(nav.getByRole('link', { name: 'Perfil', exact: true })).not.toHaveAttribute('aria-current')
    } else {
      await page.getByRole('button', { name: 'Pedir novamente', exact: true }).click()
    }
    await expect(page).toHaveURL(/\/orders$/)
    await expect(page.getByRole('heading', { name: 'Histórico de pedidos', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ainda não há pedidos', exact: true })).toBeVisible()
    await expect(page.locator('.profile-tabs, #profile-personal')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('orders-page.png') })
    for (const param of ['tab', 'section']) {
      await page.goto(`/profile?${param}=orders&status=delivered&q=Test`)
      await expect(page).toHaveURL(/\/orders\?status=delivered&q=Test$/)
      await expect(page.getByPlaceholder('Pesquisar produto ou pedido...')).toHaveValue('Test')
      await expect(page.getByRole('heading', { name: 'Nenhum pedido corresponde a estes filtros' })).toBeVisible()
      expect(historyRequests.some(url => url.includes('status=delivered') && url.includes('search=Test'))).toBe(true)
    }
  })
}

test('guest orders remain accessible alongside the profile button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockCustomerExperience(page)
  await page.goto('/product/1')
  const nav = page.getByRole('navigation', { name: 'Navegação inferior móvel' })
  await expect(nav.getByRole('link')).toHaveText(['Início', 'Menu', 'Perfil', 'Pedidos'])
  await nav.getByRole('link', { name: 'Pedidos', exact: true }).click()
  await expect(page).toHaveURL(/\/orders$/)
  await expect(page.locator('.guest-orders-page')).toBeVisible()
  await expect(page.locator('.guest-orders-account-actions a[href="/login"]')).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Perfil', exact: true })).toHaveAttribute('href', '/profile')
})

test('the orders page preserves pagination and reorder with one details destination for every status', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockCustomerExperience(page, { authenticated: true })
  const order = {
    order_id: 1, order_number: 'ORD-001', status: 'confirmed', payment_status: 'paid', can_cancel: false,
    delivery_method: 'pickup', payment_method: 'counter', subtotal: 24, discount: 0, delivery_fee: 0, service_fee: 0, total: 24, created_at: '2026-09-01T12:00:00',
    items: [{ product_id: 1, product_display_id: 'PRD-001', product_name: 'Test dish', unit_price: 12, quantity: 2, subtotal: 24 }],
  }
  await page.route('**/profile/orders?*', route => {
    const query = new URL(route.request().url()).searchParams
    const secondPage = query.get('page') === '2'
    return route.fulfill({ json: { items: [{ ...order, order_id: secondPage ? 2 : 1, order_number: secondPage ? 'ORD-002' : 'ORD-001' }], total: 11, page: secondPage ? 2 : 1, per_page: 10, total_pages: 2 } })
  })
  await page.route('**/checkout/orders/2', route => route.fulfill({ json: { ...order, order_id: 2, order_number: 'ORD-002' } }))
  let addedQuantity = 0
  await page.route('**/cart/add', route => {
    addedQuantity += route.request().postDataJSON().quantity
    return route.fulfill({ json: { items: [], total: 0 } })
  })
  await page.goto('/orders?per_page=10')
  await expect(page.locator('.profile-order-card h3')).toHaveText('ORD-001')
  await page.getByRole('button', { name: 'Ir para a página 2', exact: true }).click()
  await expect(page.locator('.profile-order-card h3')).toHaveText('ORD-002')
  await expect(page).toHaveURL(/page=2/)
  await expect(page.getByRole('button', { name: 'Ver detalhes', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Acompanhar pedido', exact: true })).toHaveCount(1)
  await expect(page.locator('.profile-order-modal')).toHaveCount(0)
  await page.getByRole('button', { name: 'Repetir pedido', exact: true }).click()
  await expect.poll(() => addedQuantity).toBe(2)
  await expect(page.getByRole('button', { name: 'Ver recibo', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Acompanhar pedido', exact: true }).click()
  await expect(page).toHaveURL(/\/orders\/2$/)
  await expect(page.locator('.order-details-page')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navegação inferior móvel' }).getByRole('link', { name: 'Pedidos', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.order-details-page a[href="/orders"]')).toBeVisible()
  for (const status of ['delivered', 'cancelled']) {
    order.status = status
    await page.goto('/orders?per_page=10&page=2')
    await expect(page.getByRole('button', { name: 'Acompanhar pedido', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Ver detalhes', exact: true }).click()
    await expect(page).toHaveURL(/\/orders\/2$/)
    await expect(page.locator('.order-details-page')).toBeVisible()
    await expect(page.locator('.profile-order-modal')).toHaveCount(0)
  }
})

for (const authenticated of [true, false]) {
  test(`hiding the order panel animates into its menu badge (${authenticated ? 'customer' : 'guest'})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockCustomerExperience(page, { authenticated })
    let completed = false
    const orders = [1, 2, 3].map(id => ({
      order_id: id, order_number: `ORD-00${id}`, status: id === 3 ? 'delivered' : 'pending', payment_status: 'pending', can_cancel: false,
      delivery_method: 'pickup', payment_method: 'counter', subtotal: 12, discount: 0, delivery_fee: 0, service_fee: 0, total: 12, created_at: '2026-09-01T12:00:00', items: [],
    }))
    if (!authenticated) {
      await page.addInitScript(() => localStorage.setItem('bonefree:guest_order_accesses_v1', JSON.stringify({
        1: { accessToken: 'guest-1', accessExpiresAt: null },
        2: { accessToken: 'guest-2', accessExpiresAt: null },
        3: { accessToken: 'guest-3', accessExpiresAt: null },
      })))
    }
    await page.route('**/checkout/orders/history?*', route => route.fulfill({ json: { ...emptyPage, items: orders.map(order => completed ? { ...order, status: 'delivered' } : order), total: 3, total_pages: 1 } }))
    await page.route(/\/checkout\/orders\/[123]$/, route => {
      const order = orders[Number(new URL(route.request().url()).pathname.split('/').at(-1)) - 1]
      return route.fulfill({ json: completed ? { ...order, status: 'delivered' } : order })
    })
    await page.goto('/product/1')
    const panel = page.locator('.order-status-bar')
    const destination = page.locator('[data-orders-destination="mobile"]')
    await expect(panel).toContainText('2 pedidos em andamento')
    await expect(destination.locator('[data-orders-count]')).toHaveText('2')
    await expect(destination).toHaveAccessibleDescription('2 pedidos em andamento')
    await expect(page.locator('.pd-mobile-bar')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.querySelector('.order-status-bar')!.getBoundingClientRect().bottom <= document.querySelector('.pd-mobile-bar')!.getBoundingClientRect().top)).toBe(true)
    // Capture the real flight without relying on wall-clock timing.
    await page.evaluate(() => {
      const original = Element.prototype.animate
      Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
        const animation = original.apply(this, args)
        if (this.classList.contains('order-status-bar')) animation.pause()
        return animation
      }
    })
    await panel.getByRole('button', { name: 'Ocultar estado do pedido' }).click()
    await expect(panel).toHaveClass(/is-hiding/)
    await panel.evaluate(element => {
      const flight = element.getAnimations().find(animation => !(animation instanceof CSSAnimation))!
      flight.currentTime = 280
    })
    await page.screenshot({ path: testInfo.outputPath('order-panel-mid-flight.png') })
    await panel.evaluate(element => {
      const flight = element.getAnimations().find(animation => !(animation instanceof CSSAnimation))!
      flight.currentTime = 559
    })
    const landing = (await panel.boundingBox())!
    const icon = (await destination.locator('svg').boundingBox())!
    expect(landing.width).toBeLessThan(25)
    expect(Math.abs(landing.x + landing.width / 2 - (icon.x + icon.width / 2))).toBeLessThan(5)
    expect(Math.abs(landing.y + landing.height / 2 - (icon.y + icon.height / 2))).toBeLessThan(5)
    await panel.evaluate(element => element.getAnimations().find(animation => !(animation instanceof CSSAnimation))!.finish())
    await expect(panel).toHaveCount(0)
    await expect(page.locator('.order-status-mini')).toHaveCount(0)
    await expect(destination).toBeFocused()
    await expect(destination.locator('[data-orders-count]')).toHaveText('2')
    await page.screenshot({ path: testInfo.outputPath('orders-badge.png') })
    await destination.click()
    await expect(page).toHaveURL(/\/orders$/)
    await expect(page.locator(authenticated ? '.customer-orders-page' : '.guest-orders-page')).toBeVisible()
    if (!authenticated) {
      await expect(page.locator('.guest-orders-page a[href="/orders/1"]')).toHaveText('Acompanhar pedido')
      await expect(page.locator('.guest-orders-page a[href="/orders/3"]')).toHaveText('Ver detalhes')
    }
    await expect(panel).toHaveCount(0)
    completed = true
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(destination.locator('[data-orders-count]')).toHaveCount(0)
  })
}

test('hiding order tracking respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockCustomerExperience(page, { authenticated: true })
  await page.route('**/checkout/orders/history?*', route => route.fulfill({ json: { ...emptyPage, items: [{ order_id: 1, order_number: 'ORD-001', status: 'pending', can_cancel: false, created_at: '2026-09-01T12:00:00', items: [] }], total: 1, total_pages: 1 } }))
  await page.goto('/product/1')
  await page.getByRole('button', { name: 'Ocultar estado do pedido' }).click()
  await expect(page.locator('.order-status-bar, .order-status-mini')).toHaveCount(0)
  await expect(page.locator('[data-orders-destination="mobile"] [data-orders-count]')).toHaveText('1')
})

for (const width of [320, 390]) {
  test(`order date filters stay compact and visible at ${width}px without a payment filter`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    await mockCustomerExperience(page, { authenticated: true })
    const requests: URL[] = []
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.pathname === '/profile/orders') requests.push(url)
    })
    await page.goto('/orders?payment=counter')
    await expect(page).toHaveURL(/\/orders$/)
    const dates = page.locator('.orders-date-control')
    await expect(dates).toHaveCount(2)
    await expect(page.locator('.orders-date-placeholder')).toHaveText(['dd/mm/aaaa', 'dd/mm/aaaa'])
    await expect(page.locator('.orders-date-placeholder').first()).toBeVisible()
    await expect(page.locator('.orders-date-placeholder').last()).toBeVisible()
    const first = (await dates.first().boundingBox())!
    const second = (await dates.last().boundingBox())!
    expect(first.y).toBe(second.y)
    expect(first.height).toBeLessThanOrEqual(52)
    expect(first.x + first.width).toBeLessThan(second.x)
    await expect(page.getByText('Todos os pagamentos', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('compact-order-filters.png') })
    await page.getByLabel('Data inicial', { exact: true }).fill('2026-09-01')
    await page.getByLabel('Data final', { exact: true }).fill('2026-09-10')
    await expect.poll(() => requests.some(url => url.searchParams.get('date_from') === '2026-09-01' && url.searchParams.get('date_to') === '2026-09-10')).toBe(true)
    await expect(page.locator('.orders-date-placeholder')).toHaveCount(0)
    expect(requests.every(url => !url.searchParams.has('payment'))).toBe(true)
    await page.locator('.profile-filter-toolbar').getByRole('button', { name: 'Limpar filtros', exact: true }).click()
    await expect(page.getByLabel('Data inicial', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('Data final', { exact: true })).toHaveValue('')
    await expect(page).toHaveURL(/\/orders$/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('order panel still animates when mobile viewport rounding places its destination beyond the window edge', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  await mockCustomerExperience(page, { authenticated: true })
  await page.route('**/checkout/orders/history?*', route => route.fulfill({ json: { ...emptyPage, items: [{ order_id: 1, order_number: 'ORD-001', status: 'pending', can_cancel: false, created_at: '2026-09-01T12:00:00', items: [] }], total: 1, total_pages: 1 } }))
  await page.goto('/product/1')
  await expect(page.locator('.pd-mobile-bar')).toBeVisible()
  const panel = page.locator('.order-status-bar')
  const destination = page.locator('[data-orders-destination="mobile"]')
  await expect(destination.locator('[data-orders-count]')).toHaveText('1')
  await page.addStyleTag({ content: '[data-orders-destination="mobile"] { transform: translateY(0.5px); }' })
  expect(await destination.evaluate(element => element.getBoundingClientRect().bottom)).toBeGreaterThan(await page.evaluate(() => innerHeight))
  await page.evaluate(() => {
    const original = Element.prototype.animate
    Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
      const animation = original.apply(this, args)
      if (this.classList.contains('order-status-bar')) animation.pause()
      return animation
    }
  })
  const hide = panel.getByRole('button', { name: 'Ocultar estado do pedido' })
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await hide.tap()
  else await hide.click()
  await expect(panel).toHaveClass(/is-hiding/)
  await panel.evaluate(element => element.getAnimations().find(animation => !(animation instanceof CSSAnimation))!.finish())
  await expect(panel).toHaveCount(0)
  await expect(destination.locator('[data-orders-count]')).toHaveText('1')
})
