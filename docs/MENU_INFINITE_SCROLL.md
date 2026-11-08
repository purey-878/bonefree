# Menu infinite scrolling and sticky categories

Implemented locally on 2026-11-08. No deployment, backend, database or infrastructure changes were made for this task.

## Audit and implementation

The menu previously replaced its product array for each numbered page (20 products by default). It already used server-side search, category, dietary, price and sort parameters through `productService.getPage`, the generated client, and the shared public request cache. The response includes `page`, `total`, `totalPages`, and catalog facets. Administrator pagination is independent and is unchanged.

The public menu now requests 16 products initially. A native IntersectionObserver with a 450px bottom margin loads the next page and appends existing ProductCards. No catalog-wide request runs in the visitor's menu. Existing lazy image loading, card design, effective pricing, portions, extras and availability remain. Explicit legacy `page` and supported `per_page` links still work; automatic batches do not rewrite the URL to represent a different subset of products.

A small MenuFeed controller provides synchronous request locking, ordered appends, ID deduplication, metadata-based stopping and generation checks. Filter changes create a new feed; retired feeds reject late responses. Errors keep existing cards and offer a localized retry for the same page. Empty results, initial skeletons, loading announcements and completion messages remain distinct. No new dependencies or frontend price sorting were added.

Search retains its 350ms debounce. Category, price, special filters, sort and locale remain server-side. Language changes restart at page one. Filters remain in query parameters and the existing small session-storage preference object. Back/Forward query changes synchronize controls with the URL. Clearing search starts a fresh feed instead of restoring an earlier accumulated list.

## Navigation, cache and accessibility

On Back from product details, a navigation snapshot restores loaded products and scroll position before the next paint. Restoration is restricted to route entry; changing filters does not restore historical response arrays. Fresh push navigation starts a fresh feed with the existing saved-filter behavior. The shared route scroll handler leaves menu Back restoration to this mechanism and does not reset scrolling for query-only navigation.

Snapshots exist only in memory, expire after 30 seconds, retain at most eight filter/locale combinations, and are not saved for feeds exceeding 500 products. Outside those bounds, returning loads the first matching page again. Product payloads are never written to localStorage or sessionStorage. This short restoration window deliberately follows catalog freshness; it is not permanent browsing history.

The existing request cache still owns network freshness and concurrent request deduplication. Page number, batch size, search, category, price, special filter, sort and locale stay in request keys. Successful catalog mutations clear navigation snapshots as well as cached responses. Mounted feeds also listen for the existing catalog invalidation event and restart. Private administrator responses retain their existing protections.

After three automatic batches (48 dishes with default settings), automatic loading pauses. A keyboard-accessible Load more button continues browsing and keeps the footer reachable. Browsers without IntersectionObserver use the same button. Retry and progress/end messages are translated into Portuguese, English and German. Progress uses one polite, atomic live region; errors have an alert and retry. Category buttons expose their selected state with aria-pressed.

At widths up to 1120px, the category row is transparent in its normal position and gains a translucent glass background with backdrop blur only once pinned flush to the viewport top. An IntersectionObserver watches a zero-layout-impact anchor, rather than running a scroll handler. The background spans the viewport edge to edge, with 12px vertical padding, matching page gutters inside and 1.25rem space below. The buttons scroll horizontally, and the row remains pinned through the product grid. It releases at the menu boundary before the footer. Search and expanded filter controls scroll normally. The desktop sidebar keeps its existing appearance and sticky position. Theme styles cover the extracted sidebar and category row.

## SEO discovery and release requirement

Generated route HTML, titles, descriptions, canonical URLs, JSON-LD, crawlable product detail anchors, robots and Hostinger routing remain. Existing sitemap generation listed only six static pages; neither the old pagination UI nor the initial menu skeleton provided a complete catalog to crawlers without JavaScript.

Added an explicit build-time public-catalog snapshot tool and sitemap integration. It reads every server page sequentially, verifies IDs, duplicates, totals and pagination, and writes only verified public IDs plus a timestamp. The build accepts snapshots captured within 24 hours and rejects malformed IDs, duplicates, excessive URL counts and stale/future snapshots. It adds product URLs to the existing sitemap without inventing products or adding query-string canonical pages.

Ordinary builds still succeed without network access and emit a clear warning when the product snapshot is absent. **Their sitemap still contains only static pages. Complete product discovery requires the snapshot-enabled release build below.** Rebuild the sitemap when products are added or removed. No production snapshot was downloaded or bundled during implementation; the sitemap integration was tested in a separate temporary build with the isolated test catalog.

From `frontend`, using the actual release API and a temporary path outside the deployed document root:

```sh
npm run seo:catalog -- https://api.bonefree.pt /tmp/bonefree-public-catalog.json
BONEFREE_CATALOG_SNAPSHOT=/tmp/bonefree-public-catalog.json npm run build
```

Pause catalog publishing during capture if necessary; repeat capture if the tool detects changes. A snapshot is verified at capture time and must be refreshed for subsequent releases. Do not ship test-fixture IDs. Upload all production dist contents, including hidden .htaccess, hashed assets, generated route folders, sitemap and robots. Preserve host-specific settings and old hashed assets for open tabs. No AWS rebuild is needed for this frontend-only task. Earlier pricing-feature backend/migration deployment requirements remain separate.

## Files for this task

- `frontend/src/pages/Menu.tsx`, `Menu.css`: progressive public menu and sticky mobile categories.
- `frontend/src/hooks/useMenuFeed.ts`, `frontend/src/utils/menuFeed.ts`: observer lifecycle, feed safety and bounded navigation state.
- `frontend/src/App.tsx`: coordinate route scrolling with menu restoration.
- `frontend/src/api/requestCache.ts`: invalidate navigation snapshots with catalog changes.
- `frontend/src/siteThemes.css`, three locale files: preserve themes and translate feed states.
- `frontend/vite.config.ts`, `frontend/src/seo/catalogSnapshot.ts`, `frontend/scripts/snapshot-public-catalog.mjs`: optional verified product sitemap.
- `frontend/package.json`: repeatable QA and snapshot commands.
- Feed/sitemap tests, cache integration test, `frontend/scripts/test-menu-browser.mjs`, `frontend/scripts/snapshot-public-catalog.node-test.mjs`: regression coverage.

Earlier uncommitted pricing-feature work was preserved.

## Validation

- TypeScript and production Vite build: passed; ESLint: passed.
- Vitest: **111 tests passed in 28 files**, including feed concurrency, append order, metadata stopping, duplicate prevention, empty/error/retry paths, stale responses, disposal/StrictMode resume, snapshot bounds/expiry, real admin-mutation invalidation and sitemap validation.
- **24 local Chrome checks passed** using 70 products and five server pages, with one deliberate page-two failure/retry. They cover initial request count, all products exactly once, footer access, observer cleanup, restoration without menu refetching, rapid searches, category/combined URL filters, server sorting, Back/Forward, German switching and 320px/390px/1440px layouts. Runtime exceptions: zero. Mobile and desktop screenshots were inspected.
- **2 Node snapshot-generator tests passed**, including a 205-product three-page catalog and rejection of duplicate/incomplete/changing catalogs.
- Six generated public pages retain canonical URLs, descriptions, initial HTML and one H1. Dist robots and .htaccess match their source files. An isolated snapshot-enabled build emits six public URLs plus all 70 fixture product URLs; the ordinary dist contains no test catalog IDs.
- `git diff --check`: passed. Backend tests were not rerun because this task changes no backend source or contract. Administrator pagination code is unchanged; authenticated administrator end-to-end pagination was not rerun.

Catalog request behavior: before, the menu requested one page of 20 products per numbered page; now the initial request is one page of 16 products. The first 48 dishes use three successful page requests. Browsing all 70 fixture products uses five successful page requests, plus the deliberately injected retry. Returning from product details within the restoration window makes **zero additional menu-page requests**; the detail page's existing related-product request is a separate, preserved feature. These are local fixture counts, not production traffic or latency measurements.

The browser harness uses an isolated 70-product fixture, not a production account or catalog. It can be rerun after building with `npm run test:menu:browser`; set CHROME_BIN if Chrome is installed elsewhere. Snapshot network tests use a temporary local HTTP server via `npm run test:seo:catalog`.

No new Lighthouse score or production speed improvement is claimed. Physical iPhone Safari testing remains a manual follow-up. HTTP 404/410 routing configuration is unchanged; this task verifies generated routing files rather than claiming a new live Hostinger status check.

Latest sticky-glass check: at a 390px viewport the row measured left 0px, right 390px and pinned top 0px. Background/blur were transparent/none initially, 55% theme surface/16px blur when pinned, and transparent/none again after returning to the top. Padding was 12px 16px, and there were no failed HTTP responses or browser runtime errors.
