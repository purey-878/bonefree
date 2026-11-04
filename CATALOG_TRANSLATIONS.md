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
