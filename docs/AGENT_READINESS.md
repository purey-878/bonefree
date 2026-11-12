# Bonefree agent readiness

Implemented locally on 2026-11-11. No deployment, production settings, database or infrastructure was changed. Public production resources were read to verify identity and capture product IDs. Earlier Meal Finder/pricing work and staged changes were preserved.

## Live findings

Read-only HTTPS checks found a 48,025-byte homepage with one H1, description, canonical, readable content and Restaurant JSON-LD. Robots already declared a parseable sitemap, and an intentionally nonexistent URL returned HTTP 404. These parts of the supplied report were outdated or came from a different response. The live upload predates several local features.

The restaurant's public [company settings](https://api.bonefree.pt/site-settings/company-details) and [social settings](https://api.bonefree.pt/site-settings/social-media) verified its address, **+351 968 107 702**, email and Facebook/Instagram profiles. Previous frontend fallback/contact copy ended in 703; they now use the verified 702 number. Build-time identity is centralized in `frontend/src/seo/business.ts`. Recheck this source when staff change company details; metadata/guides are build-time snapshots, while the interactive footer still reads the public settings API.

## Coverage of the 20 requested checks

| # | Goal | Implementation / scope |
| --- | --- | --- |
| 1 | Content Signals | `Content-Signal: search=yes, ai-train=no` in robots and HTTP headers. Usage preferences, not access control or a promise all crawlers obey them. |
| 2 | Sitemap | Build emits canonical public URLs plus verified catalog IDs. Prepared build: **8 public pages + 55 verified products = 63 URLs**. |
| 3 | Robots sitemap declaration | Existing absolute Sitemap directive retained and tested. |
| 4 | Missing-page status | Actual Apache tests confirm unknown paths, missing Markdown/JSON and internal shells return 404; retired paths return 410. Numeric product shells retain the existing client/API existence check; this does not claim server-side validation of every possible product ID. |
| 5 | No-JavaScript reading | All 8 public pages retain build-rendered HTML, navigation, one H1, contact and legal links. Markdown guides are also available. Live catalogs, reservation availability and quiz results still use the API. |
| 6 | Token budget | Snapshot CSS moved from inline HTML into fingerprinted external stylesheets. Homepage: 23,048 bytes HTML, 26,417 bytes external initial CSS, 1,440 bytes Markdown. These are byte counts, not model token or performance scores. |
| 7 | Metadata | Localized titles/descriptions/canonicals retained. Public static pages advertise Markdown alternates; private/product pages do not advertise missing Markdown. |
| 8 | Headings | One H1 verified per public route. Footer headings use H2 with their existing visual sizing. |
| 9 | JSON-LD | Initial HTML and client navigation have valid JSON-LD with safely encoded page text. |
| 10 | Business | Restaurant/LocalBusiness with verified PostalAddress, telephone, email and menu URL. No guessed hours, ratings or price range. |
| 11 | External identity | sameAs uses the two profiles published by the restaurant API. No guessed directory accounts or placeholder profile links. |
| 12 | Multiple schema types | Linked Restaurant/LocalBusiness, WebSite, WebPage and PostalAddress. SPA navigation updates page identity. Reservation actions remain conditional on the API confirming booking is enabled. |
| 13 | About/contact/legal | Existing about, contact and privacy pages are crawlable from initial homepage HTML. Privacy is the existing legal-information link; no unreviewed terms were invented. |
| 14 | Readable contact | Real tel/mailto links in homepage/footer, plus structured contact fields. |
| 15 | Plain-text llms | Generated `/llms.txt` serves text/plain, not SPA fallback HTML. |
| 16 | llms format | H1, blockquote summary, sections and Markdown links to all public guides, discovery and contact resources. |
| 17 | Markdown | Accept: text/markdown on known public pages returns the guide. Quality weights and q=0 are respected; higher-quality HTML remains HTML. Explicit `/index.md`, `/menu.md`, etc. also work. |
| 18 | Link headers | Responses advertise llms.txt via RFC 8288 Link. Markdown responses also link to the canonical page. Negotiated responses vary on Accept. |
| 19 | Browser tools | Feature-detected WebMCP registration on public pages. Current document.modelContext and older navigator.modelContext trials supported; unsupported browsers continue normally. Cleanup on private routes. |
| 20 | MCP discovery | Both `/.well-known/mcp/server-card.json` (requested path) and `/.well-known/mcp.json` (proposal path) serve JSON describing a working read-only `/mcp` endpoint. |

## Guides and tools

Guides are concise English descriptions with links and freshness notes, not manufactured menu/calendar copies. They contain no live prices, guessed hours/events, quiz answers, customer data or confirmation tokens. HTML retains the Portuguese build snapshot and Portuguese/English/German client localization.

Apache/LiteSpeed + **PHP 8.1+** handles `agent.php`. Explicit rules route only known public representations and `/mcp`; this is not a catch-all, filesystem browser or outbound proxy. Direct agent.php requests return 404. Existing private confirmation protections remain. No AWS API, database, session or package dependency is added.

Browser and HTTP MCP expose exactly two read-only tools:

- `get_restaurant_info({})`: build-time identity, contact and verified profile links.
- `get_public_page({"page":"/menu"})`: one whitelisted Markdown guide. Private paths and extra arguments are rejected.

Tools cannot make/cancel bookings, modify catalog data, access customer/admin information or claim live inventory. The card advertises only implemented capabilities. HTTP MCP implements stateless Streamable HTTP JSON responses, initialize, ping, initialized notifications and tool listing/calls. No SSE/session support is advertised; GET correctly returns **405**, permitted by the protocol. Requests have 8 KiB/depth bounds; origins and protocol versions are validated. MCP uses no-store. No bearer credentials are parsed/forwarded. The bridge only reads generated public manifest/Markdown files; it performs no network calls or writes.

WebMCP is experimental. Implementation follows the [current draft](https://webmachinelearning.github.io/webmcp/) with a legacy navigator fallback. Callback execution and cleanup are tested with a supported-API browser test double, not claimed as universal native-browser support. HTTP MCP uses real Apache/PHP integration checks. Server Cards follow the [SEP-1649 proposal](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649); two discovery paths improve compatibility without claiming final universal discovery support. Other references: [MCP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [llms.txt proposal](https://llmstxt.org/), [Content Signals](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/).

## Verification and release

From `frontend`:

```sh
npm test
npm run lint
npm run test:seo:catalog

# Actual release API, temporary path outside document root:
npm run seo:catalog -- https://api.bonefree.pt /tmp/bonefree-agent-catalog.json
BONEFREE_CATALOG_SNAPSHOT=/tmp/bonefree-agent-catalog.json npm run build

# Requires local Apache 2.4, OpenSSL and PHP CGI:
npm run test:agents:hosting
# Optional paths: APACHE_BIN, APACHE_MODULES, PHP_CGI_BIN.

npm run test:menu:browser
# In another terminal, from backend:
# python scripts/run_meal_finder_browser_api.py
npm run test:meal-finder:browser
```

The hosting suite uses a byte-for-byte temporary build copy to avoid macOS Desktop privacy restrictions. Apache and PHP CGI run on disposable localhost ports and are cleaned up. Tests exercise actual .htaccess/TLS statuses and headers, all public pages without JS, schema, MIME, guides/cards, Markdown quality negotiation/HEAD/ETag, MCP execution, malformed input, invalid origins and private-path rejection. The rules are not replaced with a fake SPA router.

Chrome tests use isolated catalog/API fixtures. The menu suite also checks browser tool callbacks with a WebMCP test double, private-route cleanup, changing schema/alternate links, and removal of initial CSS links after client commit. No production reservations or administrator writes occur. The menu guide links directly to the verified paginated catalog JSON, so agents need not execute JavaScript or download the complete catalog to read current menu data. The production API returns 404 for its OpenAPI endpoint, so no nonexistent contract/documentation URL is advertised.

Ordinary offline builds still warn and emit static-page-only sitemaps without an explicit catalog snapshot. Full product discovery requires a verified release snapshot less than 24 hours old at build time. The URL limit reserves capacity for the actual public-route count. This task captured 55 real public IDs outside document root; fixture IDs are not bundled.

For deployment, review the full diff including new PHP/agent files. Confirm PHP, rewriting, mod_headers and MIME settings on the actual Hostinger account. Upload **all** dist contents, including `.htaccess`, hidden `.well-known`, Markdown/text/JSON/PHP files, route folders and fingerprinted `initial-pages` CSS. Preserve host-specific settings and old hashed JS/CSS/initial-page assets. Clear relevant CDN caches, then check HTML and Markdown homepage responses, Link/Vary/Content-Signal, sitemap/llms/cards, a missing URL and a real MCP initialize/tools call. Re-capture the catalog for later releases. No deployment is performed by these verification commands.

Earlier Meal Finder/backend/pricing release requirements remain separate; frontend upload cannot make an older backend implement those features.

## Local validation results

- **139 frontend tests in 32 files passed**, including guide generation, card/tool consistency, input validation, unavailable browser APIs, StrictMode remount/cleanup, sitemap capacity and JSON-LD encoding. ESLint and TypeScript/Vite production build passed.
- **Six actual Apache/TLS/PHP integration groups passed**, exercising all public routes and the protocol, representations, MIME, caching and negative cases described above. Public PHP/robots/.htaccess release files match their source bytes.
- **74 Chrome checks passed**: 33 menu/agent checks and 41 Meal Finder checks. Browser tool callbacks used the documented test double, fetched a real generated Markdown file and rejected private paths. Client metadata and stylesheet cleanup passed; no runtime exceptions or responsive overflow. Mobile/desktop screenshots were inspected.
- The **official MCP Python SDK 1.30.0** negotiated protocol **2025-11-25**, discovered the two tools, called both successfully and completed ping against the actual local PHP endpoint. The SDK was installed only in a disposable temporary environment, not added to application dependencies.
- Both Node public-catalog snapshot tests passed. The release sitemap was checked against all 8 public paths and exactly the 55 product IDs captured from the actual public API. No browser-fixture IDs were used.
- `git diff --check` passed. Backend tests were not rerun: no backend source, database schema or FastAPI contract changed. No deployment, live Content-Signal/Markdown/MCP claim or new Lighthouse score is implied by these local results.
