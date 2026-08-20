# Generated API contract

`openapi.json` is exported from FastAPI and is the input for Hey API. Both the
contract and `src/api/generated` are versioned so production builds do not need
Python or the generator.

After changing a backend route or schema, activate the backend virtual
environment and run from this directory:

```powershell
npm.cmd run api:generate
```

Application code must import API behavior through `src/services` and domain
types through `src/types`. Do not edit files in `src/api/generated` manually.
