# Styled initial HTML — 2026-11-06

## Cause and reproduction

Inspected `dist`, `vite.config.ts`, `index.html` and `main.tsx`. The old SEO
generator emitted an unrelated `<main><h1>…</h1><p>…</p><nav>…</nav>` inside
`#root`. The production stylesheets were render-blocking, but that markup had
none of the real page components or their styled-components rules. `createRoot`
replaced it rather than hydrating it. Loading the correct CSS earlier could not
make two different layouts match.

Reproduced in local Chrome at 390×844 and 1440×900 with 150 ms network latency,
200 kB/s download bandwidth and JavaScript deliberately paused while CSS/HTML
loaded. The before screenshots show the plain heading, paragraph and links.
These tests use local API fixtures and do not change production data.

## Change

- The existing Vite HTML-generation plugin now renders the actual public page
  components at build time using React's existing server renderer and
  styled-components' existing `ServerStyleSheet`. No added dependency or running
  frontend server is required. API effects do not run during this rendering.
- Initial HTML includes the existing page layout, navbar, footer, imagery and
  ordinary catalog loading states. Route-specific CSS is linked on its own
  generated page, while administrator/dashboard assets stay off the homepage.
- The build places the navbar outside the animated route, matching its browser
  portal. It emits one copy of the content for all visitors and crawlers.
- Snapshot component styles are scoped to the initial root. Once the real route
  is committed, a layout effect removes those temporary rules and continues the
  already-running route entrance animation before the next paint. Later
  navigation keeps its normal animation. A cold lazy route keeps its styled
  snapshot while its code loads.
- `createRoot` remains intentional: these are initial loading-state snapshots,
  not hydration-compatible live catalog snapshots. Server/client component-ID
  ordering is isolated by scoped styles rather than relying on identical IDs.

There is no new hiding rule, crawler-specific content, loading screen, timer or
blocking JavaScript request. Existing visual styles and animations are reused.
Portuguese is the build language; the existing saved/browser language detection,
theme settings and API content updates continue after JavaScript starts. Existing
Google Fonts `display=swap` behavior remains. Live dishes/settings are not frozen
into the build and still require the API, as before.

## SEO, performance and verification

Titles, descriptions, canonical URLs, Open Graph/Twitter metadata and Restaurant
JSON-LD remain. All six public route documents, sitemap, robots and static error
documents remain. `.htaccess` is unchanged. The older cleanup report's description
of a small generic text fallback is superseded by this change.

The tradeoff is approximately 47.5 kB of homepage HTML (10 kB gzip), containing
real markup and critical styles. Browser JavaScript changes by less than 1 kB;
the largest JS chunk remains approximately 286 kB. Route splitting, administrator
translation splitting, image variants and the homepage image preload remain.
There is no new Lighthouse score claim.

- Production TypeScript/Vite build, ESLint and 53 tests across 20 files pass.
- New tests render every public page, check real navigation and scoped styles,
  and verify that build-time rendering makes no fetch requests.
- 24 throttled browser screenshots cover initial/mounted views of all six public
  routes on mobile and desktop, with no JavaScript exceptions. Homepage mobile
  screenshots match exactly after the font loads; expected differences elsewhere
  include running animations and existing asynchronous content.
- Final home/menu checks confirm both the lazy fallback and completed handoff
  retain full route opacity, with temporary snapshot styles removed at commit.
  Mobile filters, locale switching, the drawer, cold public routes and protected
  administrator redirects also pass browser checks.
- All 39 local Apache HTTP/TLS checks pass for public/admin/product routing,
  canonical redirects, metadata, sitemap and 404/410 responses.

No deployment, backend, database or production infrastructure change was made.
Deploy the complete rebuilt `frontend/dist` using the existing hosting procedure.
