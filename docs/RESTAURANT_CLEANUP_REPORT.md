# Bonefree restaurant cleanup and SEO report

Implementation date: 2026-11-05. See the [pre-edit audit](RESTAURANT_CLEANUP_AUDIT.md).
No production deployment, database operation, backend edit or migration was performed.
The user's pre-existing changes in `frontend/src/pages/Home.tsx` were preserved.

## Removed and preserved functionality

The earlier browse-only conversion had already removed customer authentication,
cart/checkout/order pages, loyalty/rewards and their handwritten API adapters.
This cleanup removes the remaining blanket cookie acceptance dialog and CSS,
three sets of obsolete purchase-customization translations, dead customer-page
and ordering/customization/review CSS, and unused admin order-board, loyalty, coupon, chart-tooltip and analytics rules/keyframes. Generic serialization tests now use catalog
fixtures rather than ordering/customer data. Product pricing row names describe
prices rather than purchases. The unused `recharts` dependency (38 packages in total) was removed; Bootstrap/Popper remain.

Public pages, menu filtering/pagination, dish galleries, ingredients, dietary
labels, nutrition, availability, language switching, theme settings and mobile
navigation remain. Administrator routes, login, role checks, catalog editors,
legacy product fields and active site settings are unchanged. There is no new
reservation or recommendation feature.

## Storage, privacy and external services

- Removed `CookieBanner.tsx` / `CookieBanner.css` and obsolete consent translations.
  There are no analytics or advertising tracking scripts in the audited source.
- Added a localized `/privacy` information page linked from the footer. It describes
  browser preferences, admin credentials, API requests, external services and
  browser storage controls. It is a factual implementation notice, not a complete
  legal policy or compliance certification.
- Google Maps now loads only after the visitor explicitly clicks its load button;
  the notice explains that an external service is involved. Font requests to
  Google Fonts remain, as do external social/map links. No blanket consent state
  is claimed for these services.
- Cleanup removes only keys confirmed by the removed source in Git history:
  `guest_cart`, `cart`, `token`, `bonefree_guest_order_accesses_v1`,
  `active_order_id`, `active_order_access_token`, `active_order_access_expires_at`
  and obsolete `bonefree_cookie_consent`. It runs on localStorage/sessionStorage,
  is idempotent, and tolerates blocked storage. There is no storage.clear call.
- Preserved: `admin_token`, `admin_role`, `admin_name`, `admin_theme`,
  `admin_sidebar_collapsed`, `admin_editor_view_mode`, `bonefree_locale`,
  `bonefree_site_theme`, `bonefree_recently_viewed`, session key
  `bonefree-menu-filters`, and every unrelated/unknown key. Recent-dish history is
  browsing history, not order history. No database cookies or sessions are reset.

Before release, the owner should review the privacy notice against actual hosting
and API logs, retention, legal controller/contact details and third-party cookie
behavior. Reassess consent controls before adding tracking. These are deployment
review items; the code does not assert legal compliance.

## SEO and hosting

- Portuguese homepage title: **Bonefree | Restaurante Vegan na Costa da Caparica**.
- Description: **Descobre o Bonefree, restaurante vegan na Costa da Caparica.
  Pratos 100% vegetais, cocktails e um ambiente descontraído. Explora o nosso menu.**
- Shared Portuguese, English and German metadata updates titles, descriptions,
  canonical URLs, Open Graph and Twitter cards. Query-string menu state does not
  create new canonical URLs. There are no separate language URLs, so no invented
  hreflang alternates were added.
- Build emits unique HTML for home, menu, about, events, contact and privacy.
  Each contains metadata, a heading, a short restaurant introduction and public
  navigation before JavaScript runs. React replaces this small fallback with the
  existing full interface. This is **not** full page or catalog prerendering.
- Live dish metadata uses the fetched dish name and description. Explicit card
  detail controls now have real hrefs, with normal-click SPA behavior and native
  modified-click behavior. Missing/failed dishes and unknown/client-only routes
  receive noindex metadata; admin HTML is noindex too.
- Restaurant JSON-LD contains only project-confirmed name, public URL, logo,
  vegan cuisine and menu URL. No guessed address, phone, hours, ratings, prices,
  ordering or reservation actions. Confirm additional business facts before
  enriching it. Hidden/admin/error views do not retain restaurant markup.
- `robots.txt` points at the generated six-page `sitemap.xml`. Removed customer
  and commerce URLs are absent. Robots allows crawlers to see noindex/status
  responses; it is not an authentication mechanism.
- Hostinger `.htaccess` canonicalizes HTTP/www to `https://bonefree.pt`, normalizes
  public route aliases/trailing slashes, serves route HTML without DirectorySlash
  loops, preserves numeric product and active administrator SPA routes, returns
  **410** for known retired features and **404** for unknown URLs/assets. Error
  documents are static and noindex, not successful homepage shells.
- Existing-but-nonexistent numeric product IDs still need an API request to show
  Not Found and noindex; static hosting cannot infer the catalog's existence.
  Their initial HTTP response remains 200. This limitation is separate from
  retired-route HTTP 410 handling, which is implemented at the host.

### Rendering recommendation

Full menu content, live contact settings and individual dish previews still depend
on JavaScript/API availability. Google documents a separate rendering step for
JavaScript apps; social preview tools and other crawlers may not execute it.
The next incremental SEO step is build-time snapshots of the **verified public
catalog and company settings**, with rebuilds when admins publish changes and a
catalog-derived product sitemap/404 manifest. It adds publish synchronization and
staleness handling, but works with Hostinger static hosting. SSR would provide
fresher content at the cost of a frontend server and hosting changes. Neither a
framework migration nor a production catalog snapshot was introduced here.

References: [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics),
[Apache rewrite flags](https://httpd.apache.org/docs/2.4/rewrite/flags.html),
[Apache AllowNoSlash](https://httpd.apache.org/docs/2.4/mod/mod_rewrite.html#rewriteoptions).

## Backend recommendations and intentionally retained references

Backend routers still expose `/cart`, `/checkout`, `/profile`, customer auth and
reviews. Admin routers also retain historical order/customer/analytics operations.
Receipt/invoice/email services, loyalty/order models, schemas, tests and Alembic
history remain. So do OpenAPI and the generated client: editing them by hand or
removing them without a backend contract change would be incorrect.

Proposed separate backend task: inventory actual consumers and shared admin
imports, deprecate or gate only verified-unused public endpoints, preserve admin
login/catalog/settings and all catalog/allergen data, then regenerate OpenAPI and
the client with backend tests. Keep historical records and migrations; endpoint
retirement does not require dropping tables. Production APIs are **not disabled**
by this frontend cleanup.

Other legitimate references: regression tests assert retired routes/tokens stay
unavailable, the targeted storage migration names old keys, privacy copy describes
what is absent, and historical reports explain the earlier conversion. The
`account` translation namespace remains because administrator sign-in uses it.
Admin product customization/discount attributes are preserved as existing catalog
data. Generic quantity/calorie terminology remains for nutrition and admin forms.
“Customer” in admin preview copy and photo descriptions means restaurant visitors,
not a restored customer account system. Historical documentation is labelled.

## Validation

- Frontend TypeScript / production Vite build: passed.
- ESLint: passed.
- Vitest: **50 passed in 18 files**, including storage preservation, blocked
  storage, locale metadata, retired/noindex routes, HTML escaping, conservative
  structured data and crawlable product-card detail links.
- **39 live local Apache HTTP/TLS checks passed**: public routes, admin shells,
  numeric product routing, retired routes, unknown paths/assets, HTTP/www/alias
  redirects, unique canonical metadata and sitemap contents. A temporary copy of
  dist was served locally; no production host was changed.
- CSS parsed successfully during cleanup and Vite compilation. Generated HTML
  references production assets. Retired handwritten API calls were not found.
- `git diff --check`: passed. Backend files and generated contract are unchanged;
  backend tests were not required for this frontend-only change.
- Live administrator authentication/content mutations and visual browser checks
  were **not** performed: they require a running backend/account and browser QA.
  Existing admin access/API regression tests pass. Do not mistake static admin
  route checks for an authenticated end-to-end verification.
- Vite still warns about the existing large JavaScript chunk (>500 kB).

## Deployment and manual follow-up

1. Back up Hostinger's document root and current rewrite configuration. Upload
   **all dist contents**, including the hidden `.htaccess`, route subdirectories,
   robots, sitemap and error documents. Merge host-specific configuration and
   replace the old catch-all rewrite; test on staging first. HTTPS must be active
   at the origin, or Hostinger must supply an equivalent trusted proxy setup.
2. Check actual status/Location headers for `/menu`, `/menu/`, `/checkout`,
   `/orders/42`, an unknown URL, an asset and both domain variants. Verify all
   public pages, languages, images, map opt-in and privacy text in a browser.
   Sign in as owner/manager and test catalog/content publishing. No backend
   Docker Compose, EC2, database or DNS change is part of this deployment.
3. Confirm the canonical domain, actual business name/address/phone/opening hours
   with the owner. Keep Google Business Profile details and the menu URL current.
4. In Google Search Console, submit `https://bonefree.pt/sitemap.xml`, inspect
   representative public URLs and request recrawling after deployment. Review
   indexing reports for old URLs; use temporary removal tools only if urgently
   needed. Permanent removal relies on actual 404/410 responses, not a blanket
   homepage redirect. Check structured data with the Rich Results Test.
5. For Brave Search, use the [official crawler guidance](https://search.brave.com/help/brave-search-crawler)
   and the [re-fetch/removal form](https://search.brave.com/submit-url) for stale retired URLs after deployment.
   Brave also lists `not-found@brave.com` for pages that no longer exist. Serve the
   same crawlable canonical URLs and noindex/error statuses; no indexing guarantee
   or unverified submission API is assumed. No form or email was submitted here.

Google procedures: [URL Inspection](https://support.google.com/webmasters/answer/9012289/),
[Sitemaps report](https://support.google.com/webmasters/answer/7451001).

## File inventory

Paths are repository-relative. The Home.tsx entry is a pre-existing user change, not part of this cleanup.

- `M` `frontend/BROWSE_ONLY_REPORT.md`
- `M` `frontend/README.md`
- `M` `frontend/index.html`
- `M` `frontend/package-lock.json`
- `M` `frontend/package.json`
- `M` `frontend/src/App.tsx`
- `M` `frontend/src/api/mappers.test.ts`
- `D` `frontend/src/components/CookieBanner.css`
- `D` `frontend/src/components/CookieBanner.tsx`
- `M` `frontend/src/components/Footer.tsx`
- `M` `frontend/src/components/ResourceNotFound.tsx`
- `M` `frontend/src/components/ui/ProductCard.test.tsx`
- `M` `frontend/src/components/ui/ProductCard.tsx`
- `M` `frontend/src/i18n/locales/de-DE.ts`
- `M` `frontend/src/i18n/locales/en-GB.ts`
- `M` `frontend/src/i18n/locales/pt-PT.ts`
- `M` `frontend/src/main.tsx`
- `M` `frontend/src/pages/AdminDashboard.css`
- `M` `frontend/src/pages/Contact.tsx`
- `M` `frontend/src/pages/NotFound.tsx`
- `M` `frontend/src/pages/ProductDetail.css`
- `M` `frontend/src/pages/ProductDetail.tsx`
- `M` `frontend/src/siteThemes.css`
- `M` `frontend/vite.config.ts`
- `A` `docs/RESTAURANT_CLEANUP_AUDIT.md`
- `A` `docs/RESTAURANT_CLEANUP_REPORT.md`
- `A` `frontend/public/.htaccess`
- `A` `frontend/public/robots.txt`
- `A` `frontend/src/components/PageMetadata.tsx`
- `A` `frontend/src/pages/Privacy.css`
- `A` `frontend/src/pages/Privacy.tsx`
- `A` `frontend/src/seo/documentMetadata.ts`
- `A` `frontend/src/seo/metadata.test.ts`
- `A` `frontend/src/seo/metadata.ts`
- `A` `frontend/src/utils/retiredStorage.test.ts`
- `A` `frontend/src/utils/retiredStorage.ts`
