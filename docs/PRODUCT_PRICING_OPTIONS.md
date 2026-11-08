# Product portions, extras and replacement upgrades

Implemented 2026-11-08. No production deployment or production database operation
was performed. Example prices were used only in isolated tests; no restaurant
product prices or options were guessed or populated in production.

## Architecture findings and implementation

Products already have a `NUMERIC(10,2)` base price and legacy discount fields.
`product_customization_option` belongs to the former purchasing workflow: it
references ingredients and is referenced by cart customization records, uses
purchase-specific option types, and lacks portions, display ordering and localized
labels. Reinterpreting or deleting those rows would risk historical compatibility.
It is unchanged, along with every cart, order, payment and customer table/route.
No purchase controls were restored in the website.

One new catalog-only `product_pricing_option` table represents portions, add-ons
and replacement upgrades. Its `kind` is `portion`, `addon` or `replacement`; its
Decimal amount is a portion total or an extra charge respectively. API consumers
receive separate `portions` and `extras` arrays with meaningful `price` and
`price_delta` fields. One generic table avoids two nearly identical pricing models.

`product_pricing_option_translation` follows the existing catalog translation
pattern: Portuguese stays in the source label, with optional English and German
name overrides. Foreign keys cascade on physical deletion. ORM delete-orphan
behavior removes options and translations together. Product soft deletion retains
its configuration for restoration. Neither legacy product IDs nor base prices
are rewritten.

The migration is `20261108_0003`, following `20261103_0002`. It creates only these
two tables and their constraints/index. Constraints enforce valid kinds,
non-negative Decimal prices and display ordering, and supported translation
locales. Repeated Alembic upgrades/startup checks do not duplicate records.
Downgrade removes only these new tables; it therefore discards configured pricing
options, and must never be treated as a data-preserving rollback of this feature.
Existing products and historical records survive it.

## API and pricing behavior

No new route or authentication mechanism was introduced. Existing protected
product create/update endpoints accept complete option-group arrays atomically:

```json
{
  "portions": [
    {"label": "3 peças", "price": "8.50", "display_order": 0, "is_available": true,
     "translations": {"en-GB": {"name": "3 pieces"}}},
    {"label": "6 peças", "price": "15.00", "display_order": 1, "is_available": true}
  ],
  "extras": [
    {"label": "Batata-doce em vez de batata normal", "price_delta": "1.00",
     "type": "replacement", "display_order": 0, "is_available": true},
    {"label": "Queijo vegan", "price_delta": "1.50", "type": "addon",
     "display_order": 1, "is_available": true}
  ]
}
```

- `POST /admin/products`: creates options with the product in one transaction.
- `PUT /admin/products/{product_id}`: creates, updates, removes or reorders options
  in the same transaction as product/ingredient/translation changes. PostgreSQL
  locks the parent product row during updates so concurrent option replacements
  cannot interleave. Return an
  existing option's `id` to retain it. Omit an option from a supplied array to
  remove it; send `[]` to clear that group. Omitted/null groups remain unchanged,
  preserving older administrator clients. Supplied display orders determine
  ordering; omitted orders use array position. Saved orders are normalized.
- Existing admin product read/list, availability and related-ingredient product
  responses include all options, translations, `effective_starting_price` and
  effective availability. The admin `price` field stays the saved base price.
- `GET /products/` and `GET /products/{product_id}` include localized options,
  availability and `effective_starting_price`. Public `price` is the effective
  starting price, so existing price displays remain accurate.

Options are limited to 30 per group. Validation rejects empty/oversized labels,
duplicate source labels within a group, duplicate IDs/orders, negative or
non-finite prices, amounts with more than two decimal places, unsupported kinds,
unknown option fields/locales, and IDs belonging to another product/group.
Zero-cost portions and extras are supported. Failed updates leave the product and
its existing options intact. Missing/empty translations fall back to Portuguese;
explicit null translation overrides clear that locale.

For products without portions, the existing discounted price remains in use.
With portions, the lowest **available portion total** is the starting price;
legacy discounts are not additionally applied to explicit portion totals or
extras. Extras never affect price filters. If every portion is unavailable, the
product is effectively unavailable and public price is null (displayed as a dash,
not a zero/free price). These products
remain visible in the unfiltered menu, follow existing unavailable-card styling,
sort last in price ordering, and do not satisfy numeric price filters.

Filtering, ascending/descending sorting and pagination use the same server-side
SQL expression as the public starting-price rule. Category aggregates now include
price maxima, avoiding a separate maximum-price query. The maximum slider facet
is the maximum effective starting price, not the most expensive portion/extra.
Option and translation relationships are batch-loaded with `selectinload`;
query counts do not grow per product. Administrator price filters likewise use portion starting prices for configured
products while retaining their existing base-price behavior for legacy products.
Existing saved menu filters continue to use
the same query parameters and storage mechanism.

OpenAPI and the TypeScript client were regenerated with the existing `api:generate`
workflow, using the backend virtualenv on macOS in place of `npm.cmd` on Windows.
No generated code was edited by hand. The release must include both
`frontend/openapi/openapi.json` and the generated TypeScript changes.

## Administrator and public interface

In the existing product editor, open **Price / Preço** to configure the new groups.
Add/edit labels and amounts, toggle availability, choose add-on or replacement,
remove rows, and move rows with the up/down buttons. Existing language tabs edit
source/translated option labels. The group is labelled “Sizes”, with a pieces/size
field and a live rate preview, while the underlying portions API stays unchanged.
Product saving and existing multiple-image,
ingredient, allergen and nutrition workflows are preserved. Saved option IDs are
checkpointed when image uploads continue or need retrying.

Menu cards keep their original layout with explicit size rates, such as
“3 × €10.00 · 6 × €15.00”, showing up to two available sizes and a count of additional choices. Extras
receive a short availability note; individual extra prices are on the detail page.
Products without options retain their existing presentation. Homepage hero/chef
prices also show explicit size rates when portions exist. Administrator list and
chef-picker summaries show those size rates while preserving the
original base-price editing field.

Product detail pages show all portion totals, separate replacement upgrades from
add-ons, and clearly label unavailable options. These are text/list displays:
there are no cart buttons, purchase quantity controls, totals calculators or new
ordering/customer features. UI labels are translated into pt-PT, en-GB and de-DE.

New admin rows use the existing colors, inputs, button styles and mobile text
sizing. Public additions use the existing typography and spacing. No new library,
public API request, background polling or ordering schema was introduced. Existing
catalog cache invalidation on successful product mutations covers all lists,
locale/filter/page variants, detail responses, price facets and chef selection.
Private administrator responses remain separate from public caches.

## SEO and validation

Metadata generation, canonical URLs, Restaurant JSON-LD, public/product URLs,
initial rendering strategy, sitemap, robots and Hostinger 404/410 rules are
unchanged. There is no shopping/checkout structured data or new purchasing claim.
The existing structured data does not contain product price offers that would
need parallel updates.

Validation performed locally:

- Backend suite: **165 tests, OK, one skipped**. This includes new option CRUD,
  reordering/IDs, Decimal accuracy, translation fallback/clearing, validation,
  transaction rollback/ownership, availability, effective prices, filtering,
  sorting, pagination, role guards and absence of legacy purchase-option writes.
- The original product-list query-budget test passes. A new test compares one
  versus eleven products with translated portions and verifies bounded query
  counts rather than per-product option/translation reads.
- Migration tests cover a populated legacy catalog, repeated startup/upgrade,
  populated options/translations, downgrade/re-upgrade and model/schema parity.
- PostgreSQL migration SQL compiled successfully offline. The live PostgreSQL
  integration test was skipped because `TEST_POSTGRES_DATABASE_URL` is not set;
  staging against the actual PostgreSQL version remains a release requirement.
- Frontend: **96 tests in 25 files**, TypeScript, ESLint and production Vite build.
  Tests cover public cards/detail displays, legacy products, editor fields,
  translated UI, option validation, backend-derived prices and options-only
  mutation invalidation through the actual generated client/service adapter.
- Regenerating OpenAPI/client a second time produced byte-for-byte identical
  outputs. No source/client drift was found.
- **19 local Chrome checks** cover real admin option editing/reordering/removal,
  stable IDs, preservation of the base price, translations and fallback, warm
  catalog invalidation, public cards/detail grouping, unavailable portions and
  mobile editing/display at 390px, including 16px text and no horizontal overflow.
  There were no browser runtime exceptions. This used a temporary test API and
  serialized requests for its shared in-memory SQLite fixture.
- **9 existing browser CRUD checks** also passed with pricing configured: editing,
  multi-image upload, deleting a primary image, partial upload failure/retry without
  duplicate products/images, mobile editor bounds and no runtime exceptions.
- Ten generated HTML files retained the same metadata/canonical/JSON-LD output;
  `.htaccess`, `robots.txt` and `sitemap.xml` match the previous build byte-for-byte.

No new Lighthouse score or production response-time improvement is claimed.
Physical iPhone Safari keyboard behavior and real PostgreSQL/staging checks are
manual follow-ups; no production account or catalog was used for these tests.

## Explicit deployment steps — do not run automatically

Deploy **database migration → new backend → frontend**. Test the same sequence
on staging first, including restoring the backup and authenticated CRUD. Keep
administrator publishing paused during the production maintenance window. Use the
existing EC2 checkout containing `compose.yaml`, its existing `.env`, and the
existing volumes; do not recreate PostgreSQL or change DNS/Docker configuration.

### 1. Prepare release and back up on EC2

Save the previous release/image reference and Hostinger files. Check out/upload
the reviewed source including the migration and generated client. From the EC2
checkout, build only the API image, then pause the API for consistent backups:

```sh
docker compose build api
docker compose stop api
pricing_backup="backups/pricing-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$pricing_backup"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$pricing_backup/database.dump"
docker compose exec -T postgres pg_restore --list < "$pricing_backup/database.dump" > "$pricing_backup/database-contents.txt"
docker compose run --rm --no-deps -T api tar -C /app -czf - uploads > "$pricing_backup/uploads.tar.gz"
```

Confirm these commands succeed and backups are nonempty; store copies outside
the instance and verify restoration on staging. If a backup fails, stop this
sequence and restore service using the previously reviewed release. Do not
continue to migration with an unverified backup.

### 2. Migrate with the new image

```sh
docker compose run --rm --no-deps -T api python -m alembic -c alembic.ini current
docker compose run --rm --no-deps -T api python -m alembic -c alembic.ini upgrade head
docker compose run --rm --no-deps -T api python -m alembic -c alembic.ini current
```

The final revision must be `20261108_0003`. Investigate any unexpected starting
revision or error; never stamp, clear or rebuild the database to bypass it.
`upgrade head` is safe to repeat after success. No product-price backfill is needed.

### 3. Start and verify the API before uploading frontend HTML

```sh
docker compose up -d --no-deps api
docker compose ps api
docker compose logs --tail=100 api
curl -fsS https://api.bonefree.pt/health
curl -fsS 'https://api.bonefree.pt/products/?page=1&per_page=1&locale=pt-PT'
```

Use the existing configured API domain if different. Verify a real public response
includes `portions`, `extras`, and `effective_starting_price`. Confirm legacy
products still have the same base price and empty option arrays. Sign in as an
owner/manager through staging/admin to verify role checks and a reversible catalog
edit; do not paste credentials into logs. The existing startup migration check may
run again, safely finding the new head.

Old frontend clients can continue reading the compatible public `price` field;
old admin updates that omit option arrays preserve them. Deploying the frontend
first is unsafe: the old API could ignore new option fields on save.

### 4. Build and deploy frontend to Hostinger

On the release build machine, with production API environment settings:

```sh
cd frontend
npm ci
npm run lint
npm test
npm run build
```

Use the regenerated client included with this release. Upload the complete
`frontend/dist` contents, including hidden `.htaccess`, route subdirectories,
robots, sitemap and error documents. Upload new hashed assets before replacing
HTML; keep previous hashed assets temporarily for already-open tabs. Preserve
host-specific configuration and unrelated Hostinger files. Do not edit `dist`
by hand or upload backend secrets. Refresh any HTML/CDN cache as appropriate.

### 5. Live verification and rollback boundaries

- Browse home, menu and a legacy dish in all three languages. Check first-frame
  appearance, navigation, product images, metadata/canonical URLs and 404/410s.
- Using verified restaurant prices, configure a test/staging dish with portions,
  an add-on and a replacement. Check reorder/edit/remove, free extras, unavailable
  portions and translation fallback. Confirm filters, sorting, pagination, slider
  maximum and displayed prices agree. Verify mobile editor and public layouts.
- Verify catalog changes appear after leaving admin without a hard reload; test
  image addition/removal and partial-upload retry alongside pricing options.
- Revert the frontend first if necessary while retaining the compatible backend.
  An old API image with automatic migrations enabled will reject an unknown newer
  Alembic head. Backend rollback therefore needs a planned operator-reviewed path,
  not just an image swap. Prefer a forward fix; if a downgrade is required, export
  the new pricing data/backups first and run it with the new image in maintenance.
  Downgrading to `20261103_0002` deletes configured options/translations. Never
  restore a full database backup over subsequent writes without an explicit,
  reviewed recovery action. No downgrade/restore/deployment was performed here.
