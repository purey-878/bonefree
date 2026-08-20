# Bonefree engineering rules

These instructions apply to the entire repository.

## Database access

- Use SQLAlchemy 2.x statements. Never use `Session.query` or `db.query`.
- Use `db.scalar(select(...))` when one entity or scalar value is expected.
- Use `db.scalars(select(...)).all()` for collections of ORM entities or one selected column.
- Use `db.execute(select(...))` for multi-column rows and aggregate tuples.
- Call `.unique()` before consuming results that joined-eager-load a collection.
- Use `select(exists().where(...))` for existence checks.
- Use `db.execute(delete(...))` or `db.execute(update(...))` for bulk mutations; use `db.delete(instance)` for one loaded entity.
- Keep transaction boundaries explicit. Do not add commits inside read helpers.
- Do not issue database calls inside collection loops when the rows can be fetched in one `IN (...)` query and indexed in memory.
- Use `selectinload` for collections needed by a response; do not joined-eager-load collections because that multiplies parent rows. Use `joinedload` for required scalar relationships.
- Run filters, counts, sums, and grouped reporting in the database. Select only the columns needed by aggregate and summary endpoints instead of materializing ORM graphs.
- Preserve existing filtering, ordering, counters, response contents, and transaction behavior when optimizing a query.

## Authentication and authorization

- Every protected administrator or staff route must inject `Depends(require_role(...))` with the exact allowed roles. The administrator login route is the only public `/admin` route.
- Customer-only routes must inject `Depends(get_current_user)`.
- Use `get_current_user_optional` only when the same endpoint deliberately supports both authenticated customers and guests.
- Public routes must not parse bearer tokens manually. Authentication is declared through the shared `HTTPBearer` dependencies.

## API contract

- Every route decorator must declare a literal, unique, snake-case `operation_id`.
- Every JSON response must declare a `response_model`; document empty, upload, error, and binary responses explicitly.
- Public request and response fields, code identifiers, validation messages, and API error messages must be in English. Public JSON fields use `snake_case`.
- Preserve deliberately localized customer content such as Portuguese emails and receipts.
- Treat the FastAPI OpenAPI document as the source of truth for frontend requests, responses, enums, and endpoints.

## Migrations and generated code

- Alembic migrations must preserve existing data. Never drop, recreate, or clear a legacy database merely to align its schema.
- Migrations and startup migration checks must be safe to run repeatedly and must not duplicate or reset existing records.
- Keep historical migration identifiers unchanged. Map cleaner Python attribute names to legacy physical column names when a database rename is unnecessary.
- Never edit `frontend/src/api/generated` manually.
- After a backend contract change, run `npm.cmd run api:generate` from `frontend` and commit both `openapi/openapi.json` and the generated client.

## Verification

- Run backend tests from `backend` with `..\.venv\Scripts\python.exe -m unittest discover -s tests -v` on Windows.
- Run frontend tests, lint, and build before handing off changes that affect the contract or frontend integration.
