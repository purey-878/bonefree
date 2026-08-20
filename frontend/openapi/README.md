# Updating the frontend API client

The FastAPI OpenAPI document is the source of truth for backend requests,
responses, enums, authentication, and endpoint definitions. Hey API uses that
document to generate the typed Fetch client consumed by the frontend.

Both `openapi/openapi.json` and `src/api/generated` are committed to Git. This
means production builds do not need Python or Hey API, but both outputs must be
regenerated whenever the backend API contract changes.

## Prerequisites

- Python with the backend dependencies installed.
- The backend virtual environment activated.
- Node.js 22 or newer.
- Frontend dependencies installed with `npm install`.

The OpenAPI exporter uses the test environment, disables automatic migrations,
and uses an in-memory SQLite URL. Generating the contract does not connect to or
modify the development or production database.

## Backend contract requirements

Before regenerating the client, make sure every changed route:

- declares an explicit and unique `operation_id` in `snake_case`;
- declares a `response_model` for every JSON response;
- documents empty, upload, download, and error responses correctly;
- uses `HTTPBearer` for bearer-token authentication;
- exposes public fields in English and `snake_case`.

The application startup, OpenAPI exporter, and backend contract tests reject
missing or duplicate operation IDs.

## Regenerate after a backend change

From the repository root, run:

```powershell
cd frontend
npm.cmd run api:generate
```

This command performs two steps:

1. Exports the current FastAPI schema to `openapi/openapi.json`.
2. Recreates `src/api/generated` from that schema with Hey API.

The generated directory is cleaned on every run. Never add handwritten code to
`src/api/generated`, because it will be deleted during the next generation.

## Review the generated changes

Inspect the contract and generated SDK before changing application code:

```powershell
git diff -- openapi/openapi.json src/api/generated
```

For compatible backend changes, such as adding an optional response field, no
other frontend changes may be necessary.

For breaking changes, such as renaming or removing a field, changing an enum,
or modifying request parameters, update only the appropriate integration layer:

- `src/api/mappers.ts` for DTO-to-domain conversions;
- `src/services` for endpoint orchestration and payload mapping;
- `src/types` only when the stable frontend domain model must also change;
- `src/api/clients.ts` for authentication or client-level behavior.

React components, pages, hooks, and contexts must not import from
`src/api/generated` directly. They should consume stable services and domain
types so backend changes remain isolated to the integration layer. ESLint
enforces this boundary.

## Validate before committing

Run the complete local validation from the `frontend` directory:

```powershell
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

Run the backend tests from the `backend` directory with the repository virtual
environment:

```powershell
cd ../backend
..\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Finally, commit the backend changes together with the regenerated contract,
generated client, adapter changes, and relevant tests.

CI also runs `npm run api:check`. It regenerates the contract and client and
fails if the committed generated files are out of date.

## Files that should be committed

After a backend contract change, the commit will normally include:

- the changed backend routes and schemas;
- `openapi/openapi.json`;
- `src/api/generated`;
- affected mappers, services, or domain types;
- contract and adapter tests.

Do not commit database files, virtual environments, `node_modules`, or local
environment files.
