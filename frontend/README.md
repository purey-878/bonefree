# BoneFree restaurant website

The frontend is a browse-only restaurant website. Visitors can explore the menu,
dish details, ingredients, nutrition, prices, photos, About, Events and Contact.
Customer accounts, ordering, checkout, order tracking, reviews and loyalty rewards
are not part of this frontend. Retired routes display the Not Found page.

Owners and managers sign in at `/admin/login`; the dashboard opens on Products.
Owners manage catalog, administrator accounts and site content. Managers retain
catalog access. Waiter and chef accounts cannot access the frontend dashboard.
The existing backend permissions remain authoritative.

Backend ordering endpoints and stored data remain unchanged. Removing the
frontend features does not disable those APIs. The generated OpenAPI client still
represents the full backend contract and must not be edited manually.

## Build and check

From the repository root:

```bash
cd frontend
npm ci
npm test
npm run lint
npm run build
```

The build runs TypeScript validation and Vite, writing `frontend/dist/`.
Production reads the public API origin from `.env.production`:

```dotenv
VITE_API_BASE_URL=https://api.bonefree.pt
```

Vite embeds this at build time. Exported environment variables and
`.env.production.local` can override it. Keep secrets out of `VITE_*` variables.
Local development (`npm run dev`) defaults to `http://127.0.0.1:8000`; an
untracked `.env.development.local` can override the local API URL.

## Hostinger upload

1. Back up the current site in Hostinger's File Manager or through SFTP.
2. Upload the **contents** of `frontend/dist/` into the domain's document root
   (usually `public_html`). Replace the old `index.html` and upload its matching
   assets. Do not upload the parent `dist` folder, source or environment files.
3. Preserve existing hosting configuration, including React Router's `.htaccess`.
4. Clear enabled hosting/CDN caches. Test both `https://bonefree.pt` and
   `https://www.bonefree.pt`, including a direct visit to `/menu` and a dish URL.
5. In browser developer tools, confirm API and uploaded-image requests use
   `https://api.bonefree.pt`. Public browsing should not request customer sessions,
   carts, orders, checkout, reviews, loyalty settings or sales analytics.
6. Check the menu filters, pagination, languages, images, cookie consent and admin
   catalog/content editing. Old customer/order URLs should display Not Found.

The backend must allow both frontend HTTPS origins through CORS. No DNS or backend
changes are performed by the frontend build. Deployment remains manual.

## Database-backed menu languages

Menu content follows the existing language switcher, with Portuguese fallbacks
for missing English or German text. Owners and managers enter optional translations
in catalog editor language tabs; management lists stay Portuguese.
See [menu translation administration and backend-first rollout](../CATALOG_TRANSLATIONS.md).
