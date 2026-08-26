# Canonical catalog seed

The canonical development catalog is reproducible from the static Alembic
baseline `20260822_0001`,
`catalog/catalog.json`, and the WebP files under `catalog/products`.
Runtime databases and `uploads/` are deliberately not tracked by Git.

## Production PostgreSQL

Production uses a separate, non-destructive loader. It reads the same validated
catalog bundle but writes through SQLAlchemy to the configured PostgreSQL database,
associates categories and products with an existing active owner, and installs the
media in the persistent uploads volume. It never creates development test users and
refuses a non-empty catalog or uploads target.

From the production API container, validate the bundle and target:

```bash
python scripts/seed_production_catalog.py --check
```

The default organization slug is `bonefree`; pass `--organization-slug your-slug`
to target another organization.

Apply it once, after creating the first owner:

```bash
python scripts/seed_production_catalog.py --apply --owner-email admin@example.com
```

There is deliberately no production reset option. Restore a verified PostgreSQL and
uploads backup if production data must be replaced.

## Development SQLite

From `backend`, validate the committed seed against the current canonical local
database and uploads:

```powershell
..\.venv\Scripts\python.exe scripts\export_catalog_seed.py --check
```

Refresh the committed seed after deliberately changing the canonical catalog:

```powershell
..\.venv\Scripts\python.exe scripts\export_catalog_seed.py --apply
```

Validate the seed and report whether the configured local targets need a reset:

```powershell
..\.venv\Scripts\python.exe scripts\seed_catalog.py --check
```

Create a new local database and product upload tree when the targets are empty:

```powershell
..\.venv\Scripts\python.exe scripts\seed_catalog.py --apply
```

Replacing an existing development/test SQLite database is deliberately explicit.
The command creates a timestamped backup in `backend/backups` before swapping the
validated staged database and product uploads into place:

```powershell
..\.venv\Scripts\python.exe scripts\seed_catalog.py --apply --reset --confirm-reset
```

During development startup, the application automatically applies the full catalog
seed when the database catalog is empty. Existing product uploads are backed up and
atomically replaced with the normalized seed files in that case, which also supports
rebuilding after deleting only `backend/core_platform.db`. Existing catalog, real users,
and operational data are never reset automatically. Conflicting database data still
requires the explicit reset command above. The five deterministic development users
are created with freshly hashed test passwords; real users and all runtime/customer
data are excluded.
