# Invisible performance optimization — 2026-11-06

## Initial audit (before source changes)

A production Vite build with source maps was saved outside the repository at
`/private/tmp/bonefree-perf-before-20261106`. No saved Lighthouse diagnostics or
HAR files were found. The user-provided Lighthouse scores are the baseline field
report; local measurements below are not replacement Lighthouse scores.

- Entry JavaScript: **807,562 bytes** (including the audit build source-map comment), about
  **233 kB gzip**. Every route was eagerly imported by App.tsx.
- Global production CSS: **438,042 bytes**, about **66 kB gzip**. It included
  151,162 source bytes of AdminDashboard.css and 12,968 of Auth.css.
- Source map input attribution (not minified output sizes): AdminDashboard.tsx
  208,887 bytes, Bootstrap's unused JS bundle 80,496, and adminPhrases.ts 42,562.
  React/React DOM/router, i18next and styled-components are active dependencies.
  No arbitrary vendor chunking or new package is needed.
- The homepage eagerly evaluated all route modules, shared UI barrel exports,
  administrator translation tables and Bootstrap JS event/data-API handlers.
  No data-bs controls or Bootstrap JS calls were found in application source.
- The homepage makes five parallel, necessary public requests: theme, catalog,
  chef special, company details and social links. A sixth product request is
  conditional when the configured special is absent from the first catalog page.
  A cold render can also attempt the image fallback before catalog data arrives.
  Production did not show duplicate data GETs in the controlled browser check.
  StrictMode can repeat effects in development; it does not justify changing
  production freshness semantics or disabling StrictMode.
- Rubik is declared in both index.html and a CSS @import with the exact same
  URL. Both use display=swap and the same variable weights/italics. Remove only
  the redundant CSS declaration, retaining the font and all existing weights.
- Homepage background: existing WebP is 177,744 bytes at 2000×1333. It is first
  discovered from JS-generated styled-components CSS. Preload the same file on
  the homepage. Do not downsize it for tall phones: background-size:cover needs
  source pixels across the off-screen cropped width as well as visible width.
- Logo: 106,692 bytes at **2915×2882**, displayed 42px high in navigation and 56px
  in the footer. It is a good candidate for lossless, high-DPI-sized derivatives.
- Catalog images already use server card variants and lazy loading; no backend
  image or response contract change is warranted. Chef-special imagery below
  the fold can use native lazy loading; featured hero imagery stays eager.
- SEO HTML is an introductory shell mounted with createRoot, not a hydration
  snapshot. Preserve it and the metadata/robots/sitemap/HTTP error strategy.
- No React profiler trace demonstrates expensive catalog sorting/filtering at
  the existing 20-item page size. Avoid speculative memoization or animation,
  backdrop-filter, transition or design changes.

A headless Chrome baseline covers home, menu, product detail and administrator
login at 1440×900 and 390×844. API responses are deterministic local fixtures,
not production mutations. Screenshots pause animation only in the test browser
so geometry/styles can be compared; application animations remain unchanged.

## Changes and verification

The following changes preserve the approved visual design:

- React.lazy/Suspense isolate secondary public pages, admin login/dashboard and
  their CSS. Home stays eager. The Suspense boundary includes the route and footer,
  preserving the generated HTML on a cold deep link. React Router transitions
  retain the previous screen during a pending route; no spinner was added.
- Admin phrase dictionaries register on demand before the protected dashboard
  renders, including all three languages and the existing admin role strings.
  Public language switching still has its dictionaries synchronously available.
- Removed Bootstrap's JS bundle import after confirming no application data-API
  attributes or Bootstrap JS calls. Bootstrap CSS, layout utilities, colors,
  all fonts/weights, and the Bootstrap/Popper packages remain unchanged.
- Home imports ProductCard/Skeleton directly instead of evaluating the complete
  shared UI barrel. Other routes retain their existing component imports.
- Removed the duplicate Google Fonts CSS @import. The existing index.html Rubik
  stylesheet, preconnects, variable weights, italics and display=swap remain.
- Homepage HTML preloads the **same original hero WebP**, with high priority.
  Other generated pages omit this hero-specific preload. A preconnect to the
  configured production API origin allows connection setup before JS executes;
  API URL configuration and all requests/responses are unchanged.
- Added lossless 96px/192px logo derivatives with srcset/sizes, intrinsic
  dimensions and the original aspect ratio. Existing navbar/footer geometry is
  preserved; the original logo remains for larger/SEO uses. Added asynchronous
  decoding to hero dish imagery (still eager) and native lazy loading/async
  decoding to the below-fold chef image. Existing product card variants and
  image-loading behavior remain intact.

No new dependencies, manualChunks rules, backend changes, TTL caches, API
payload changes, font substitutions, CSS design edits, or animation/transition
changes were introduced. No speculative memoization was added.

## Measured bundle and image results

Decimal kB below. Initial JavaScript includes **every statically imported shared
chunk**, not just the smaller entry filename. CSS includes all initial linked
stylesheets. Gzip is the sum of each resource compressed independently with Node
zlib; this is not a claim about Hostinger's current compression configuration.
The baseline audit build includes its approximately 50-byte source-map comment;
production output has no source maps.

| Resource | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Initial JS, total | 807.56 kB | 490.98 kB | 39.2% |
| Initial JS, gzip | 233.49 kB | 153.67 kB | 34.2% |
| Initial CSS, total | 438.04 kB | 256.93 kB | 41.3% |
| Initial CSS, gzip | 65.98 kB | 36.92 kB | 44.0% |
| Logo, 96px derivative | 106.69 kB | 10.36 kB | 90.3% |
| Logo, 192px derivative | 106.69 kB | 22.85 kB | 78.6% |

The original hero bytes and appearance are unchanged. The original logo has
about 8.4 million pixels; the derivatives have 9,120 and 36,480. Actual browser
image decoding and memory use depend on implementation. On some high-DPI screens
the navbar and footer select different derivatives; even their combined transfer
is smaller than the original logo. No chunk exceeds 500 kB in the optimized build.

## Verification

- TypeScript (`npm run build`), ESLint and Vite production build passed.
- **51 tests pass across 19 files**, including the new on-demand admin dictionary
  test and existing catalog, administrator/API, storage, SEO and product tests.
- **Eight before/after Chrome screens**, four routes at desktop 1440×900 and
  phone 390×844: home, menu, product and admin login. Headings, body width and
  sampled bounding boxes/fonts/colors/backgrounds/padding/radii match (geometry
  tolerance 0.5 CSS px). No runtime exceptions occurred. Screenshots at DPR 1
  differ only in the small navbar logo region; no other pixels exceed the
  comparison threshold of 8/255. That region reflects the resized logo raster,
  not changed layout or styling. Animations were paused **in the test harness
  only**, never in application source.
- Navigation checks with the menu chunk deliberately delayed 300ms confirm that
  the previous screen stays visible until the new route loads. Mobile filters,
  language switching, menu drawer/Escape, cold About/Events/Contact/Privacy/dish
  and login routes work. An unauthenticated dashboard visit redirects to login
  without fetching the dashboard chunk. All API responses in this browser QA are
  local deterministic fixtures; no production writes or real administrator
  credentials were used. Authenticated dashboard editing remains a manual check.
- **39 Apache HTTP/TLS checks pass** against the final build: public/admin shells,
  product routing, canonical redirects, retired 410s, unknown 404s and sitemap.
- Metadata/canonicals/JSON-LD and initial root fallback copy are unchanged in all
  ten generated HTML documents. robots.txt, sitemap.xml, .htaccess and hero bytes
  match the baseline exactly. Only the homepage has a hero image preload.
- Five expected homepage data requests remain parallel and unchanged. No
  additional production API requests or browser-storage changes were introduced.
- `git diff --check` passes. Final dist contains no source maps. The source-map
  audit copies, Chrome profiles, screenshots, network and timing records remain
  under `/private/tmp/bonefree-perf-*`, outside the repository and deployment.

The harness collected performance-observer traces, but local fixture runs on an
uncontrolled machine are **not Lighthouse scores** and are not a reliable before/
after LCP/TBT benchmark. Do not claim an improved score from bundle size alone.
Run fresh mobile/desktop Lighthouse tests under matching conditions after staging
or deployment, using real API responses and fonts. Compare several cold runs,
check LCP resource discovery, unused JS/CSS, long tasks and CLS against the supplied
93 mobile / 82 desktop scores.

## Deployment and follow-up

Upload the complete matching dist output, including lazy chunks and the unchanged
SEO/hosting dotfiles. Retain previous hashed assets long enough for existing tabs
to finish using their route chunks; avoid replacing HTML while its matching assets
are unavailable. Smoke-test public and authorized admin routes on staging. This
work does not deploy, change Hostinger settings, or alter backend/Docker/database
configuration.

Separate server-side opportunities, if production measurements justify them:
verify Brotli/gzip and cache headers for hashed assets; measure API latency and
JSON payload sizes; evaluate conditional requests/ETags for public settings with
explicit invalidation on admin edits. No such infrastructure or freshness policy
was changed here. Full Bootstrap CSS was retained to protect the approved design;
removing utility classes through automated CSS purging could change dynamic admin
or responsive states and was deliberately avoided.

Implementation files: App.tsx, main.tsx, Home.tsx, Navbar.tsx, Footer.tsx,
i18n/index.ts, the new i18n/loadAdminTranslations.ts and its test,
constants/brandLogo.ts, theme.css, vite.config.ts, the two new logo WebPs, and
this report. Existing API adapters, backend files, metadata definitions, routing
rules and source hero assets are untouched.

References: [React lazy](https://react.dev/reference/react/lazy),
[Vite async chunk loading](https://vite.dev/guide/features.html#async-chunk-loading-optimization),
[fetch priority and preloading](https://web.dev/articles/fetch-priority).
