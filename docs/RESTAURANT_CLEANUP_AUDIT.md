# Restaurant cleanup audit (2026-11-05)

Audit completed before source changes. The existing Home.tsx working-tree edit
belongs to the user and is outside this cleanup.

## Findings and planned changes

- Public React routes and handwritten API adapters already contain no customer
  login, cart, checkout, loyalty or order workflows. Administrator authentication
  and catalog/content settings are active and must remain.
- `CookieBanner.tsx`, its CSS and three locale dictionaries still offer blanket
  cookie acceptance. No analytics, tracking scripts or document.cookie writes were
  found in frontend source or index.html. Remove this misleading banner and add a
  localized, footer-linked storage information page. External fonts and the map
  link/embed must be disclosed; provider/server cookies require deployment review.
- Active storage: bonefree_locale, bonefree-menu-filters (session),
  bonefree_recently_viewed, bonefree_site_theme, admin_token/admin_role/admin_name,
  admin_theme/admin_sidebar_collapsed and the admin editor view preference.
  Preserve all. Git history confirms guest_cart, cart, token,
  bonefree_guest_order_accesses_v1 and active_order_* were legacy-only keys.
  Remove only this explicit historical allowlist and obsolete banner consent.
- `siteThemes.css` and `ProductDetail.css` retain selectors for retired customer
  pages, purchasing/customization and reviews. Locale dictionaries retain the
  removed customization modal. Remove dead rules/copy, preserving admin catalog
  customization/discount data and nutrition quantities.
- Generic mapper tests still use orders, customer/takeaway and receipt fixtures.
  Replace with catalog examples, retaining the same serialization coverage.
- No SEO controller, canonical tags, sitemap, robots.txt or tracked .htaccess.
  index.html has only a generic title. Add shared localized restaurant metadata,
  route HTML shells with static essential copy, minimal Restaurant JSON-LD,
  HTTP 410 handling for known retired routes, 404 for unknown paths, and
  HTTPS/non-www canonicalization. Preserve public and administrator SPA routes.
- Product detail links currently depend on button clicks. Make the explicit
  details control a crawlable link, retaining SPA navigation and modified clicks.
- Backend still mounts auth/cart/checkout/profile/reviews routers, with receipt,
  invoice/email, loyalty and order models/services. Generated clients and OpenAPI
  correctly represent these APIs. Keep them and historical migrations unchanged;
  propose separate endpoint retirement after administration/dependency review.
- Current package dependencies are lean; recharts has no active import and can be
  removed. Bootstrap uses Popper, so retain it. No new library is needed.

## Limits

Production homepage returned an empty JS app shell to the text fetcher. Hosting
redirect/status behavior, authenticated CMS workflows, third-party cookie behavior
and actual business details cannot be verified from repository code alone.
No production database or hosting changes are authorized by this implementation.
