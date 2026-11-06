# Homepage LCP and image fallback — 2026-11-06

## Findings and changes

The homepage `HeroTitle` in `Home.tsx` has no opacity, visibility or animation
delay of its own. Its `.app-route-stage` ancestor did animate from opacity zero
and `translateY(9px)` over 280 ms, in both the generated HTML and React. The
homepage now has `app-route-stage--home` in both renderers, disabling only that
entrance animation. Other route entrances, navigation, cards and background
animations are unchanged. Heading text, dimensions, colors and typography are
unchanged.

The initial content remains real, styled page HTML. `createRoot` still replaces
it; this task does not introduce hydration. In the English-browser Lighthouse
trace, the final LCP node is the client-rendered English H1, following the initial
Portuguese snapshot. The first saved trace's observed LCP moved from 1,064 ms to
845 ms. This is a single diagnostic trace pair, not the simulated Lighthouse
metric below.

Rubik already used `font-display: swap`, and its files finished before the final
heading paint. However, its Google-hosted **stylesheet** blocked initial rendering;
Lighthouse estimated about 600 ms of potential savings from render-blocking
requests. The default font now loads locally, with the normal Latin face preloaded.
All 12 original Google Fonts v31 WOFF2 files, unicode ranges, 300–900 weights,
normal/italic styles and `swap` behavior are retained without modification. The
license and provenance are included alongside the files. Only needed subsets
download: the measured page fetched the same 35,324-byte normal Latin and
36,440-byte italic Latin fonts. Optional theme-specific Google Fonts remain supported.

The old fallback `/assets/images/menu-images/acai.avif` returned 404 and could
trigger an additional API retry. The shared fallback now uses a **384-byte SVG
dish icon** in the site's colors. Missing-image and API retry behavior is tested;
valid product photographs are unchanged. The optimized trace shows the SVG
returning 200 and no açaí fallback request.

## Measurements

Lighthouse 13.6.0, Chrome 156, fresh local production builds served with gzip.
Three cold mobile navigations per version, default Lighthouse mobile simulated
throttling; the English browser preference was retained. Public API responses
were fixed local fixtures, while baseline Google Fonts requests were live. A
desktop run per version used 1440×900, 40 ms RTT, 10,240 Kbps and 1× CPU.
Full configuration and individual runs: [measurements](MOBILE_LCP_MEASUREMENTS.json).
Lighthouse was installed only in `/private/tmp`, without project dependency changes.

| Metric | Before | After |
| --- | ---: | ---: |
| Mobile FCP, median | 1.55 s | 1.24 s |
| Mobile LCP, median | 3.85 s | 3.64 s |
| H1 observed render delay, median | 1,039 ms | 752 ms |
| Mobile performance score, median | 59 | 66 |
| Mobile CLS, median | 0 | 0 |
| Desktop LCP, single run | 0.87 s | 0.85 s |
| Desktop performance score, single run | 70 | 75 |

The LCP breakdown insight reports observed timing; simulated Lighthouse LCP/FCP
use its network/CPU model, so those table rows do not add together. A preliminary
animation-only experiment gave 3.72 s median mobile LCP, which is why the verified
font stylesheet bottleneck was also addressed.

**The 2.5 s target was not reached.** These localhost/fixture results are not a
production retest and their absolute scores differ from the user's report. Local
mobile TBT was much higher than the reported production 80 ms, and timing varied
between runs. Saved traces confirm remaining startup scripting, style/layout work
and replacement/localization of the initial heading. A hydration-compatible,
locale-matched startup would require a broader change to styled-component IDs,
portals and mounting; it was not added to this focused fix. Retest the deployed
build on the original Lighthouse setup before drawing production conclusions.

Full reports/traces are available locally in
`/private/tmp/bonefree-lcp-before-measurements` and
`/private/tmp/bonefree-lcp-optimized-measurements`; the temporary measurement
harness is `/private/tmp/bonefree-lighthouse.mjs`.

## Validation and scope

- TypeScript and production Vite build passed; ESLint and all 55 tests passed.
- Eight baseline and eight optimized browser views cover home, menu, product
  detail and administrator login at 390×844 and 1440×900. Selected layout,
  heading and navigation computed styles match in all views. Seven viewport
  screenshots are pixel-identical, including both homepages; the remaining
  difference is confined to the existing product photograph region.
- Eight additional throttled initial/mounted screenshots of home/menu passed.
  With JavaScript paused, the homepage has exactly one H1, route opacity 1 and
  no entrance animation; the same assertions pass after React mounts. No browser
  exceptions or unstyled startup view were observed.
- All six public pages retain byte-identical SEO metadata blocks. `.htaccess`,
  robots, sitemap and 404/410 documents are byte-identical to baseline. All 39
  local Apache HTTP/TLS route, redirect, metadata and error-status checks passed.
- All 12 declared WOFF2 assets exist with valid WOFF2 headers. Default-page
  Lighthouse requests contain no Google Fonts requests after optimization.
- `git diff --check` passed. Backend, database, production infrastructure,
  dependencies and legitimate catalog images were not changed. Nothing deployed.

Upload the complete rebuilt `frontend/dist`, including the new fonts, CSS,
license, SVG and existing hidden hosting configuration.
