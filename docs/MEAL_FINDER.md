# BoneFree Meal Finder — fixed, simple version

The customer flow has three fixed questions:

1. **Course:** starters, tacos or mains.
2. **Style:** crispy, creamy, smoky/BBQ, or surprise me.
3. **Ingredients:** tofu/plant-based meat, beans/chickpeas/lentils, vegetables/avocado, or no preference.

Admin → Meal Finder has **one on/off switch**, saved immediately. Administrators cannot edit questions, rules, product recommendation attributes or result settings. Product editing no longer contains a Meal Finder subsection. The baseline tools and preview/editor APIs have been removed. Normal catalog and reservation management are unchanged.

## Fixed matching

Ranking uses live public product names and descriptions, with fixed code-owned word patterns. It does not need tagging, a seed plan or external AI. Portuguese accents are normalized; matching uses the source catalog text and is independent of the visitor's language. Questions, controls and explanations are translated into Portuguese, English and German.

- Course is a hard constraint: starters only use Entradas/Starters, tacos only Tacos, and mains only Pratos Principais/Main Courses/Mains. No sides, desserts, sauces or drinks are returned.
- Only active, nondeleted, available products in active categories are eligible. Required-base ingredient availability and available portions/prices use existing catalog helpers. Alcohol-containing products are excluded.
- Explicit recipe words such as `frito`, `crocante`, `queijo creme`, `leite de coco`, `fumado`, `BBQ`, `tofu`, `Beyond`, `feijão` and `lentilhas` support matching. The rules make no appetite, calorie, serving-size or sharing claims.
- Style contributes 40 points; selected ingredients contribute 30. Each dimension scores once. `Surprise me` and `No preference` add no soft constraint.
- Genuine ties use a stable hash of the answers and product ID, rather than always favouring the lowest ID. Identical answers and catalog data give identical results, across languages.
- Show one best match and up to two alternatives within the same course. If soft preferences do not all match, explain that these are the closest available dishes. Never substitute another course or relax the optional dietary filter.

Examples verified against the local real catalog:

| Answers | Best match |
| --- | --- |
| Mains · Creamy · Beans/chickpeas/lentils | Chickpeas Tikka Masala |
| Mains · Smoky/BBQ · Tofu/plant-based meat | Bonefree Cheeseburger |
| Tacos · Smoky/BBQ · Beans/chickpeas/lentils | Lentil Taco |
| Tacos · Crispy · Vegetables/avocado | Crispy Cauliflower |
| Starters · Crispy · Tofu/plant-based meat | Vegan Momos |

Names and descriptions are ordinary catalog content, so updating a recipe description can affect matching. Changing the questionnaire or scoring requires a source change, not an admin setting.

## Interface

The finder follows the site’s Rubik typography, green/cream palette, yellow calls to action and shared ProductCards. The Ask Paulo welcome screen includes a small decorative plate illustration on larger screens. The primary start action sits directly below the welcome heading with a large yellow face, bold label, green outline/shadow and a subtle arrow nudge. It stays visible without scrolling on mobile; reduced-motion preferences disable the nudge.

The quiz uses a numbered three-step progress indicator with the website’s yellow progress bar, icon-led answer cards, explicit selected states and a visible gluten-free Yes/No choice. Keyboard focus, Back, restart and translated controls remain. Results show the selected preferences, a featured match with structured reasons, up to two alternatives, and a reservation panel. Empty, loading, retry and disabled states share the same surface and button styles. CSS respects reduced-motion preferences and uses existing theme variables; no new fonts, dependencies, questionnaire or ranking changes were introduced.

## Data, API and safety

The existing `meal_finder_settings` row retains its enabled flag. Historical question configuration and `product_meal_finder` rows are preserved in the database but ignored by the fixed engine; no database records or historical migrations were deleted or changed. No extra schema migration is necessary beyond `20261110_0005`. Initialization now creates only a disabled switch when absent and never resets an existing setting:

```sh
cd backend
python -m alembic upgrade head
python scripts/initialize_meal_finder.py
```

Public API: `GET /meal-finder/config`, `POST /meal-finder/recommendations`.
Owner/manager API: `GET/PUT /admin/meal-finder/settings`; PUT accepts **only** `{"enabled": true|false}`. Extra configuration fields are rejected. Former products, baseline and preview endpoints no longer exist. The public questionnaire version is fixed at 2; toggling does not invalidate valid answers. Historical incompatible browser-history state restarts safely.

The public endpoints retain the shared IP limiter and bounded request bodies. Responses use `no-store`; new requests use current prices/availability. Product rendering, optimized images, translations and portions use the shared serializer. Answers remain anonymous browser-history state, never URL parameters or stored sessions. Back, restart, keyboard focus, reduced motion, retry and empty/disabled states remain. The visible gluten-free Yes/No choice defaults to No (no dietary restriction). Yes applies the existing strict catalog `gluten_free` filter, with cross-contact guidance; no medical or absolute allergy guarantee is made.

The reservation CTA always links to `/reservations`; no booking or promotion logic changed. The `/meal-finder` landing page remains lazy-loaded, has unique metadata, one H1, route HTML, clean canonical and a sitemap entry. The catalog snapshot mechanism and existing Hostinger/robots/404/410 behavior remain. No new homepage API requests or dependencies were added.

## Verification commands

```sh
# From backend:
python -m unittest discover -s tests -v
# Windows equivalent:
..\.venv\Scripts\python.exe -m unittest discover -s tests -v

# Disposable local PostgreSQL databases only (the suites reset them):
TEST_POSTGRES_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/bonefree_test \
MEAL_FINDER_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/bonefree_meal_finder_test \
python -m unittest discover -s tests -v

# From frontend:
npm run api:generate
npm test
npm run lint
npm run build
npm run test:seo:catalog

# Start the disposable fixture from backend:
python scripts/run_meal_finder_browser_api.py
# Then, from frontend after building:
npm run test:meal-finder:browser
npm run test:menu:browser
```

Contract CI runs PostgreSQL tests in an isolated database. The browser harness uses real HTTP endpoints and a disposable catalog, never production data. It checks different answer combinations, keyboard/back/retry/languages, product and reservation links, four viewport widths, and the single admin toggle. `CHROME_BIN` can override the Chrome executable. Physical Safari and staff acceptance remain release checks.

## Deployment checklist — no automatic deployment

1. Review and commit source and regenerated OpenAPI/client together. Run backend, PostgreSQL, frontend, browser and catalog-snapshot tests.
2. Verify a production database backup. Preserve all catalog, pricing, translation, reservation, promotion and historical finder data.
3. Update backend source and rebuild/recreate the API with the existing Docker deployment procedure. Run Alembic through head and the idempotent initializer if setting up an existing deployment that lacks the feature tables. Do not reset or reseed the catalog. The existing enabled setting is preserved.
4. Verify API health, public fixed configuration, answer validation, different recommendations and owner/manager authorization. Confirm old editor/baseline/preview endpoints are unavailable and settings reject extra fields.
5. Capture the release catalog and build the frontend:

   ```sh
   cd frontend
   npm run seo:catalog -- https://api.bonefree.pt /tmp/bonefree-public-catalog.json
   BONEFREE_CATALOG_SNAPSHOT=/tmp/bonefree-public-catalog.json npm run build
   ```

6. Upload all dist contents to Hostinger, including `.htaccess`, route folders, hashed assets, sitemap and robots. Preserve host-specific settings and old assets for open tabs.
7. Verify the landing HTML/canonical/sitemap, three-question flow, actual course/ingredient matches, strict empty/dietary paths, real product detail links, reservations and admin on/off. Check existing menu scroll/restoration, pricing and themes. Test on desktop and physical mobile Safari.

No production infrastructure or database was accessed or deployed during this simplification.

## Local validation

- Full backend suite: **198 tests passed** with both dedicated local PostgreSQL suites enabled, including existing reservations, pricing, migrations, authentication and catalog regressions.
- Frontend: 131 tests in 31 files passed; ESLint, TypeScript and production Vite build passed. OpenAPI and the TypeScript SDK were regenerated.
- Finder/API focused suite: 32 checks passed, including SQLite and migrated PostgreSQL, fixed answer-dependent ranking, course constraints, availability/price/dietary rules, toggle authorization, rejected editor fields, and historical-data preservation/downgrade.
- Chrome: **41 Meal Finder checks passed after the interface, start-button and gluten-free control refresh**; 26 existing menu checks passed during the fixed-engine implementation. The finder covers three different answer combinations, keyboard/Back/retry, German switching, real product links, single-switch administration, persisted on/off state and retired endpoints. Welcome, quiz and results have no horizontal overflow at 320px, 390px, 768px and 1440px; the mobile start button is visible without scrolling. No runtime exceptions. Full-page mobile/desktop screenshots were inspected. The large start action and yellow quiz progress were checked in the production build. The visible gluten-free Yes/No control was verified through real recommendations: Yes excludes unlabelled dishes, Back retains the choice, and No removes the restriction.
- Both Node catalog snapshot tests passed. Generated route HTML has one H1 and the canonical; the sitemap includes the landing page, and robots/.htaccess match source.
- The five examples above were also checked read-only against the existing local catalog. No catalog or finder records were changed by this simplification.
