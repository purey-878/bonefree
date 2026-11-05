> Historical report from the earlier browse-only conversion. Current cookie,
> storage, SEO, HTTP status and verification details are documented in
> [the restaurant cleanup report](../docs/RESTAURANT_CLEANUP_REPORT.md).

# Browse-only frontend implementation report

BoneFree now provides restaurant information and menu browsing without customer
accounts, ordering, checkout, order tracking, reviews, coupons or loyalty rewards.
The existing public design is retained, with removed controls and sections closed
up. The menu retains search, categories, dietary filters, prices, pagination and
images. Dish pages retain galleries, ingredients, nutrition, availability and
related/recently viewed dishes.

## Administration

Owners and managers enter the content dashboard on Products. Managers retain
catalog permissions; owners retain site settings and administrator management.
Waiter, chef and unknown roles see an access message with a sign-out option.
Retired tabs fall back to Products. Order boards, customer management, reviews,
sales charts and purchase analytics are removed. Existing product customization
and discount fields are preserved when editing; new products disable those options.

## Local validation

- TypeScript validation and production Vite build: passed (`npm run build`).
- ESLint: passed (`npm run lint`).
- Vitest: **35 passed, 1 failed** across 14 test files. All new regressions passed.
- The unchanged `src/api/errors.test.ts` test for invalid login credentials expects
  Portuguese text but receives English. This is the pre-existing locale-sensitive
  failure previously observed before the browse-only conversion.
- Regression coverage includes owner/manager access, rejection of operational and
  unknown roles, retired-tab fallback, preservation of legacy product fields,
  disabled defaults for new products, public/admin token isolation, product media
  resolution, and informational product cards without ordering controls.
- Route matching against the actual App route definitions confirms `/cart`,
  `/checkout`, `/orders`, `/orders/42`, `/profile`, `/login`, `/register`,
  `/forgot-password`, `/admin/staff` and `/admin/kitchen` resolve to Not Found.
  Public content routes and administrator login/dashboard still resolve.
- Static checks of handwritten API adapters found catalog, content and admin-account
  operations only. Built JavaScript contains no retired feature endpoint URLs.
- The final `frontend/dist/` JavaScript contains `https://api.bonefree.pt` and no EC2
  IP address. `.env.production` explicitly sets the public production origin; local
  development retains the original localhost default.
- Backend files, database migrations, OpenAPI, generated API code, and dependency
  manifests/lockfile are unchanged. `git diff --check` passed.

Vite still reports a JavaScript chunk larger than 500 kB. Live authenticated
browser workflows and desktop/mobile visual smoke checks have not been performed
in this environment. No deployment, DNS modification, data reset or push occurred.
Backend ordering endpoints remain available because this is a frontend-only change.
Existing browser customer/order storage is preserved and ignored.

## Rebuild and upload

From the repository root:

```bash
cd frontend
npm ci
npm test
npm run lint
npm run build
```

Back up the Hostinger site, then upload the **contents** of `frontend/dist/` to the
domain's document root (usually `public_html`). Preserve `.htaccess` and other
hosting configuration, and clear enabled CDN/hosting caches. Do not upload source,
`node_modules` or environment files. See [README.md](README.md) for browser checks
on both production domains. Deployment remains manual.

## File inventory

`M` = modified, `D` = deleted, `A` = added. Paths are relative to the repository root.

- `M` `.gitignore`
- `A` `frontend/.env.production`
- `A` `frontend/BROWSE_ONLY_REPORT.md`
- `A` `frontend/README.md`
- `M` `frontend/src/App.tsx`
- `M` `frontend/src/api/clients.test.ts`
- `M` `frontend/src/api/clients.ts`
- `A` `frontend/src/components/AdminAccessDenied.tsx`
- `M` `frontend/src/components/CookieBanner.tsx`
- `D` `frontend/src/components/CustomizeProductModal.css`
- `D` `frontend/src/components/CustomizeProductModal.tsx`
- `D` `frontend/src/components/FloatingProfileIcons.tsx`
- `M` `frontend/src/components/MenuSection.tsx`
- `M` `frontend/src/components/Navbar.tsx`
- `D` `frontend/src/components/OrderStatusBar.css`
- `D` `frontend/src/components/OrderStatusBar.tsx`
- `M` `frontend/src/components/ResourceNotFound.tsx`
- `M` `frontend/src/components/Welcome.tsx`
- `D` `frontend/src/components/admin-orders/KitchenOrdersBoard.tsx`
- `D` `frontend/src/components/admin-orders/OrderAgeBadge.tsx`
- `D` `frontend/src/components/admin-orders/OrderDetailsDrawer.tsx`
- `D` `frontend/src/components/admin-orders/OrderStatusBadge.tsx`
- `D` `frontend/src/components/admin-orders/OrderViewSwitcher.tsx`
- `D` `frontend/src/components/admin-orders/StaffOrdersBoard.tsx`
- `D` `frontend/src/components/admin-orders/SuperAdminOrdersView.tsx`
- `D` `frontend/src/components/admin-orders/orderUtils.test.ts`
- `D` `frontend/src/components/admin-orders/orderUtils.ts`
- `D` `frontend/src/components/cart.tsx`
- `D` `frontend/src/components/orderStatusStorage.test.ts`
- `D` `frontend/src/components/orderStatusStorage.ts`
- `M` `frontend/src/components/ui/Button.tsx`
- `A` `frontend/src/components/ui/ProductCard.test.tsx`
- `M` `frontend/src/components/ui/ProductCard.tsx`
- `M` `frontend/src/components/ui/index.ts`
- `D` `frontend/src/context/AuthContext.tsx`
- `D` `frontend/src/context/auth-context.ts`
- `D` `frontend/src/hooks/index.ts`
- `D` `frontend/src/hooks/useAuth.ts`
- `D` `frontend/src/hooks/useCart.ts`
- `M` `frontend/src/i18n/adminPhrases.ts`
- `M` `frontend/src/i18n/index.test.ts`
- `M` `frontend/src/i18n/locales/de-DE.ts`
- `M` `frontend/src/i18n/locales/en-GB.ts`
- `M` `frontend/src/i18n/locales/pt-PT.ts`
- `M` `frontend/src/main.tsx`
- `M` `frontend/src/pages/About.tsx`
- `M` `frontend/src/pages/AdminDashboard.css`
- `M` `frontend/src/pages/AdminDashboard.tsx`
- `M` `frontend/src/pages/AdminLogin.tsx`
- `D` `frontend/src/pages/Cart.css`
- `D` `frontend/src/pages/Cart.tsx`
- `D` `frontend/src/pages/Checkout.css`
- `D` `frontend/src/pages/Checkout.tsx`
- `D` `frontend/src/pages/ForgotPassword.tsx`
- `D` `frontend/src/pages/GuestOrders.css`
- `D` `frontend/src/pages/GuestOrders.tsx`
- `M` `frontend/src/pages/Home.tsx`
- `D` `frontend/src/pages/Login.tsx`
- `M` `frontend/src/pages/Menu.css`
- `M` `frontend/src/pages/Menu.tsx`
- `D` `frontend/src/pages/OrderDetails.css`
- `D` `frontend/src/pages/OrderDetails.tsx`
- `M` `frontend/src/pages/ProductDetail.css`
- `M` `frontend/src/pages/ProductDetail.tsx`
- `D` `frontend/src/pages/Profile.css`
- `D` `frontend/src/pages/Profile.tsx`
- `D` `frontend/src/pages/Register.tsx`
- `M` `frontend/src/services/adminService.ts`
- `D` `frontend/src/services/authService.ts`
- `M` `frontend/src/services/binaryTransfer.test.ts`
- `D` `frontend/src/services/cartService.test.ts`
- `D` `frontend/src/services/cartService.ts`
- `D` `frontend/src/services/checkoutService.ts`
- `D` `frontend/src/services/guestOrderService.test.ts`
- `D` `frontend/src/services/guestOrderService.ts`
- `M` `frontend/src/services/index.ts`
- `M` `frontend/src/services/productService.ts`
- `M` `frontend/src/services/siteSettingsService.ts`
- `M` `frontend/src/theme.css`
- `M` `frontend/src/types/admin.ts`
- `D` `frontend/src/types/cart.ts`
- `D` `frontend/src/types/checkout.ts`
- `M` `frontend/src/types/index.ts`
- `M` `frontend/src/types/product.ts`
- `M` `frontend/src/types/siteSettings.ts`
- `D` `frontend/src/types/user.ts`
- `A` `frontend/src/utils/adminAccess.test.ts`
- `A` `frontend/src/utils/adminAccess.ts`
- `M` `frontend/src/utils/adminEnumLabels.test.ts`
- `M` `frontend/src/utils/adminEnumLabels.ts`
- `D` `frontend/src/utils/adminOrderViews.test.ts`
- `D` `frontend/src/utils/adminOrderViews.ts`
- `A` `frontend/src/utils/catalogProduct.test.ts`
- `A` `frontend/src/utils/catalogProduct.ts`
- `A` `frontend/src/utils/imageFallback.test.ts`
- `D` `frontend/src/utils/loyaltyCoupon.ts`
- `M` `frontend/src/utils/messages.ts`
- `D` `frontend/src/utils/orderProgress.test.ts`
- `D` `frontend/src/utils/orderProgress.ts`
- `D` `frontend/src/utils/productAnalyticsView.test.ts`
- `D` `frontend/src/utils/productAnalyticsView.ts`
