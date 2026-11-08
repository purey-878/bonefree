# Frontend API request optimization

Implemented 2026-11-08. No deployment, production API mutation, backend runtime,
API contract, database schema or generated-client changes were made. Existing
admin CRUD and responsive UI work was preserved.

## Audit

- `SiteThemeController` is the single mounted theme consumer. It previously sent
  one request on mount, every 60 seconds (even in background tabs), and once per
  `siteThemeUpdated` event. Development Strict Mode repeats mount effects. There
  was no shared request deduplication or freshness policy. The existing stored
  theme is an appearance snapshot, not a network cache.
- Public catalog requests go through `productService`. Home and menu ask for the
  same default catalog page, but differ in explicitly sending `special=all`.
  Menu facet/price initialization can run the same request twice. A restored
  full-range price slider could briefly be sent as an explicit price cap.
- Product detail fetches the complete dish, then related products and, when
  present, recently viewed IDs. These queries are distinct and remain distinct.
  A listing card is not treated as a complete dish-detail response.
- Categories on public pages come from catalog facets. No separate public
  category or ingredient requests need to be prefetched. Footer, contact and
  events use public settings services; all share the same client policy.
- Admin navigation mixed imperative click loaders with active-tab effects.
  Product pages loaded all ingredients before the editor opened; updating
  category state could start another identical ingredient request. Some mutation
  handlers also refreshed off-screen lists.
- Public routes already lazy-load administrator route code and do not request
  administrator data. This separation is preserved.

## Implementation and cache policy

`frontend/src/api/requestCache.ts` supplies fetch adapters to the existing generated
clients through `clients.ts`. Components keep using the existing service methods;
no separate per-component network cache or new dependency is introduced.

| Data | Policy |
| --- | --- |
| Public theme | Shared in-flight request; 60-second freshness |
| Public product lists and complete dish details | Shared in-flight request; 30-second freshness |
| Public company details, social links, events and chef selection | Shared in-flight request; 5-minute freshness |
| Administrator GETs | Concurrent requests only, keyed by authorization and URL; no retained completed responses |
| Mutations, login, unknown endpoints, authenticated requests through the public client | No public response caching |

Caches live only in the current document's memory and retain at most 100 entries.
A full reload starts empty. Freshness begins at successful completion. Rejected
and HTTP error responses are retryable. Locale, filters, pagination, IDs, base URL
and all query parameters remain part of the key. Only verified equivalent product
list defaults and trailing slashes are normalized. Response bodies are cloned so
consumers cannot consume one another's data. Cancelling one caller does not cancel
another consumer's shared request.

Successful catalog mutations, including image uploads/removals and ingredient
availability, immediately invalidate all cached public catalog variants and chef
selection. Successful settings writes invalidate their matching public setting.
Invalidated in-flight requests cannot repopulate the cache. Private admin responses
never seed public caches. Failed mutations retain current fresh data. The admin
chef-selection product list is also discarded after catalog mutations.

The theme controller retains its current appearance on transient failures,
ignores superseded fetches, skips background polling, and checks freshness when
visible again. Its existing update event applies admin theme changes immediately
through the public endpoint. Polling remains every 60 seconds while visible; a
poll just before cache expiry may reuse its result until the next tick.

Admin active-tab effects now own navigation reads. Ingredients load when opening
the editor or ingredient tab. Off-screen lists are not refreshed after unrelated
writes; navigating to them obtains fresh private data. Editor opening still loads
a complete, fresh product and current ingredient/category choices.

Saved menu filters now record the catalog price ceiling so a previously unbounded
slider remains unbounded on return. Explicit price caps and legacy saved ranges
are preserved; URL filters and pagination continue to work.

Invalidation is local to this document. Updates made in other tabs, devices or API
clients are observed through the public freshness windows and theme polling;
there is no cross-device push subscription. Public catalog availability can be up
to 30 seconds old between reads. Caches do not persist sensitive admin data in
localStorage, sessionStorage, service workers or any shared public response store.

## Measured request counts

Measured in local headless Chrome against an isolated SQLite/FastAPI test API,
with the saved pre-change production build and optimized production build. Each
run used a fresh browser profile, Portuguese, an owner test session, browser HTTP
caching disabled, and explicit React-mount/network-settle checks. The test proxy
serialized API requests because the test fixture uses a shared in-memory SQLite
connection. These are counts, not production latency or Lighthouse measurements.

The fixture has one public product, one category, no configured chef selection,
and initially no recently viewed dishes. Counts vary with real catalog size,
filters, history and chef selection. Cold means a new document. Warm navigation
uses the same SPA document within the public freshness windows.

| Scenario | Before | After |
| --- | ---: | ---: |
| Cold homepage | 5 | 5 |
| Cold menu | 5 | 4 |
| Cold product detail | 5 | 5 |
| Cold admin products | 6 | 4 |
| Cold admin settings | 8 | 8 |
| Homepage → menu, first SPA navigation | 2 | 0 |
| Menu → product, first visit in this SPA document | 2 | 2 |
| Warm homepage revisit | 2 | 0 |
| Warm menu revisit | 2 | 0 |
| Warm product-detail revisit | 2 | 0 |
| Public page → admin products | 5 | 3 |
| Admin ingredients tab | 1 | 1 |
| Admin categories tab | 1 | 1 |
| First admin settings tab visit | 6 | 6 |
| Return to admin products tab | 2 | 1 |
| Return to admin settings tab | 5 | 5 |
| Three simultaneous theme update events with fresh theme data | 3 | 0 |

The homepage retains its five necessary cold reads: theme, catalog, chef choice,
company details and social links. Cold dish detail still needs its own full
response and related-products query. Private settings are deliberately read again
when entering that tab. Public routes issued no administrator requests. Both
measurement runs had no browser runtime exceptions; recorded responses were 200.

Raw per-endpoint counts and statuses:
[before](measurements/api-requests-before.json),
[after](measurements/api-requests-after.json).

## Verification

- TypeScript via `tsc -b`, production Vite build and ESLint passed.
- All **88 frontend tests in 24 files** passed. New regressions cover concurrent
  consumers, response bodies, expiry, error retries, invalidation races, bounds,
  language/query isolation, private identity isolation, successful/failed CRUD,
  all public settings mutations, cancellation, actual generated-client/service
  integration and restoring saved price filters.
- Backend suite: **154 tests, OK, one skipped** because the dedicated PostgreSQL
  test URL is unavailable. No backend runtime changes were needed.
- Ten generated HTML files retain the same metadata, canonical URLs, JSON-LD and
  H1 content as the baseline. `.htaccess`, `robots.txt` and `sitemap.xml` match
  byte-for-byte. No UI markup/style, SEO generation or hosting-rule redesign.
- Nine further Chrome CRUD checks passed: edits with unknown calories, multiple
  images, primary-image removal, partial upload/retry without duplicates, mobile
  editor bounds and no runtime exceptions. These used isolated test data.
- Chrome request measurements exercised homepage, menu, dish details and admin
  product, ingredient, category and settings tabs. No deployment was performed.

## Separate backend opportunities

Public conditional requests with ETags/Last-Modified could reduce payloads after
client freshness expires. A public settings aggregate could reduce the five
necessary cold-home requests, but requires an API contract decision. Those changes
were not introduced. Sensitive administrator endpoints should keep private/no-store
HTTP policies; they must not be put into a public CDN cache.
