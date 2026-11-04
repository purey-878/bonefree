# Menu translations

Portuguese (`pt-PT`) remains the source catalog. Products, categories and ingredients
can have optional English (`en-GB`) and German (`de-DE`) overrides. Product IDs,
URLs, prices, images, nutrition and existing catalog data stay unchanged.
Each missing or blank translated field falls back to Portuguese independently.

## Enter translations

Sign in as an owner or manager and edit Products, Categories or Ingredients.
Use Português, English and Deutsch tabs to edit text. Switching tabs retains
unsaved drafts; save the form to persist all languages together. English and
German fields are optional. Clearing an override restores its Portuguese fallback.
Catalog management lists always identify records in Portuguese.

Product translations cover name, description and comma-separated menu tags;
category translations cover name and description; ingredients translate names.
Changing Portuguese text preserves translations, which administrators should
review manually. Events, company details and media captions are outside this feature.

## API behavior

Public `GET /products/` and `GET /products/{product_id}` accept `locale`, defaulting
to `pt-PT`. Search matches the displayed name/description and Portuguese originals.
Alphabetical sorting, filtering, totals and pagination run in SQL. Category facet
names and ingredient names use the same locale. Other sorting modes remain unchanged.
Unsupported locales return validation errors.

Administrator catalog requests and responses include optional `translations` maps:

```json
{
  "translations": {
    "en-GB": {"name": "Mushroom soup", "description": "Homemade soup"},
    "de-DE": null
  }
}
```

Omitting the map or a locale preserves saved overrides. A supplied locale replaces
all its overrides; omitted fields within that locale fall back to Portuguese.
A null locale or an entirely blank locale removes its overrides. Product tags use
`menu_tags`; category and ingredient translated names use `name`. Portuguese text
continues using the existing source fields. Limits match database source columns.

## Release order

1. Back up the database and uploads using the existing deployment procedure.
2. Release the backend first. Build and start the new API image using the existing
   Compose deployment workflow (`docker compose build --pull api`, then
   `docker compose up -d api`). Startup runs the additive Alembic migration
   `20261103_0002`, creating three translation tables without rewriting source rows.
   Do not stamp migrations manually or remove volumes. Wait for API health.
3. Verify `/products/?locale=en-GB` and `/products/?locale=de-DE`. Before translations
   are entered, Portuguese fallbacks are expected. Repeated startup is safe.
4. Build the frontend from the repository root:

   ```bash
   cd frontend
   npm ci
   npm test
   npm run lint
   npm run build
   ```

   The build validates TypeScript and writes `frontend/dist/`. Its production API
   remains `https://api.bonefree.pt`. Follow [Hostinger upload instructions](frontend/README.md#hostinger-upload)
   to upload the contents of that directory, preserving hosting configuration.
5. Check both frontend domains: switch languages on the menu, homepage and a dish;
   verify images, filters, pagination and related/recently viewed dishes. Try a rapid
   language switch to confirm an older response cannot overwrite the latest one.
   Edit translations as owner and manager; verify Portuguese and unsaved drafts
   remain intact when switching editor tabs.

Deploying the frontend before the backend is unsupported. All deployment steps are
manual; no production data or DNS settings are changed by building this project.

## Development verification

From `backend`, run `.venv/bin/python -m unittest discover -s tests -v` on macOS/Linux.
On Windows use `..\.venv\Scripts\python.exe -m unittest discover -s tests -v`.
Migration tests use temporary databases. Set `TEST_POSTGRES_DATABASE_URL` to an
isolated PostgreSQL test database to enable the optional PostgreSQL migration test.
Never point it at production.

Regenerate the API contract after backend schema changes (from `frontend`, with
the backend virtual environment's Python on `PATH`): `npm run api:generate`.
Do not edit generated client files manually. Run frontend tests, lint and build.
The existing `src/api/errors.test.ts` invalid-login translation assertion is a
known unrelated failure; report it separately if it persists.

## Offline batch proposals and reviewed imports

The reusable command `python -m scripts.translate_catalog` uses the existing
SQLAlchemy database configuration and translation tables. It needs no external
translation service, API key or additional dependency. It uses the reviewed
Portuguese-to-English/German phrase glossary in
`backend/seeds/translations/glossary.json`. This is a deterministic catalog-specific
translation tool, not a general-purpose machine translation model. New or changed
Portuguese text absent from the glossary is flagged for manual translation rather
than guessed. Update the glossary or edit the exported review file for new content.

The initial [review bundle](backend/seeds/translations/catalog.proposed.json)
contains 54 local products, 7 categories and 148 ingredients. It includes originals,
proposals, existing saved translations and review notes. Source descriptions remain
Portuguese. Product descriptions are translated into British English and German;
category names/descriptions and ingredient names are localized. Product menu tags
are deliberately outside this batch and are never changed.

Fourteen products have optional `proposed_name_en` suggestions. Branded/house dish
names stay as written. Ordinary Portuguese names such as “Batatas Fritas” have an
English suggestion (“Fries”). These names are never translated into German.
**Without `--apply-product-names`, every base product name stays unchanged.** With
that explicit option, the reviewed English name becomes the base product name and
the name override for both languages, making names identical in Portuguese,
English and German. This is the only option that can change a base catalog field.
Portuguese descriptions and all prices, media, recipe links, availability and
nutrition remain untouched. Existing conflicting name overrides require an explicit
`--overwrite` as well; the command refuses rather than partially renaming a dish.

Some local records cannot be translated faithfully: Tiramisu has only a placeholder
description, and ingredient names `TEST`, `house`, `house2`, `creme` and `crema` are
ambiguous or test data. Their affected fields are null in the proposal and are
skipped, leaving existing translations or Portuguese fallbacks. Notes identify these
and other details to confirm. Do not infer ingredients, allergens, dietary claims or
recipes from a product name. Supply accurate source content or reviewed translations
before publishing those records. Nothing is removed from the catalog.

### Local review and testing

From `backend`, using your backend virtual environment:

```bash
python -m scripts.translate_catalog export --output /tmp/catalog.review.json
python -m scripts.translate_catalog import --file /tmp/catalog.review.json --dry-run --report /tmp/catalog.preview.json
```

The default import mode is dry-run, even if `--dry-run` is omitted. Previews issue
only SELECT queries, not writes followed by rollback. Review the `source`,
`translations`, `existing_translations`, `proposed_name_en` and `notes` entries.
The preview report lists exact before/after changes. Existing nonblank translated
fields are preserved by default; empty fields may be filled. Identical values are
no-ops. Null/blank proposals never delete content. Reports and exports use exclusive
file creation so they cannot accidentally replace a reviewed file.

To include the proposed English names in the preview:

```bash
python -m scripts.translate_catalog import --file /tmp/catalog.review.json --dry-run --apply-product-names
```

After reviewing, apply to the configured **local** database:

```bash
python -m scripts.translate_catalog import --file /tmp/catalog.review.json --apply
```

Add `--apply-product-names` only if you approve the English name suggestions. Add
`--overwrite` only when you intend to replace existing nonblank translations in the
file. `--overwrite` does not clear fields omitted from the file or replace menu tags.
The `existing_translations` snapshot is informational; only `translations` are imported.

The command validates all IDs, Portuguese source text, locales and text limits
before staging changes. A source mismatch aborts the entire import: export and review
a fresh bundle. You may remove entries from a bundle to import a reviewed subset.
Changing source text inside the bundle does not update Portuguese database text.
All writes commit in one transaction; failures roll everything back. Translation
primary keys and PostgreSQL table locks prevent duplicate concurrent imports.
Rerunning the same file with the same options is idempotent. After applying English
names, rerun with that option again or export a fresh file to match the new names.

### Production PostgreSQL procedure (manual only)

1. Deploy the tooling and existing translation-table migration/backend before using
   this command. Back up PostgreSQL and uploads first using the normal procedure.
2. Export a fresh bundle **on the production server**, through the API container:

   ```bash
   docker compose exec -T api python -m scripts.translate_catalog export --output /tmp/catalog.production.review.json
   docker compose cp api:/tmp/catalog.production.review.json ./catalog.production.review.json
   ```

   Do not assume the local bundle's IDs or test records match production. The
   command refuses mismatched sources instead of attaching text to the wrong dish.
3. Download/review the JSON, resolve notes and missing text, and upload the reviewed
   file back to the server. Copy it into the container:

   ```bash
   docker compose cp ./catalog.production.review.json api:/tmp/catalog.production.reviewed.json
   docker compose exec -T api python -m scripts.translate_catalog import --file /tmp/catalog.production.reviewed.json --dry-run
   ```

4. Preview again with any intended `--apply-product-names` / `--overwrite` options.
   Save and inspect the report. Once approved, run the exact same options with
   `--apply --allow-production`. For example, without renames or overwriting:

   ```bash
   docker compose exec -T api python -m scripts.translate_catalog import --file /tmp/catalog.production.reviewed.json --apply --allow-production
   ```

   `--allow-production` is an explicit acknowledgement, not a credential or target
   selector: the command still uses the container's existing DATABASE_URL. Never
   point a local test command at production. No production command is run automatically.
5. Rerun dry-run with the same options to confirm zero further changes, inspect the
   localized public API in both languages, and verify the live menu and dish pages.
   The existing API returns Portuguese when a translated field is absent. A manual
   refresh shows the updated catalog; restarting or resetting the database is unnecessary.

Regression tests are in `backend/tests/test_catalog_translation_bundle.py`.
