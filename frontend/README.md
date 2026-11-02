# BoneFree frontend deployment

The React frontend is hosted on Hostinger at `https://bonefree.pt` and
`https://www.bonefree.pt`. Its backend runs on AWS and is accessed through
`https://api.bonefree.pt`, never through the EC2 IP address.

Production builds load the public `VITE_API_BASE_URL` from `.env.production`.
Vite embeds this value at build time; changing it requires rebuilding and uploading
the build again. Keep secrets out of all `VITE_*` variables. An exported
`VITE_API_BASE_URL` or `.env.production.local` can override this setting; check
for unintended overrides before building.

Local development (`npm run dev`) continues to use `http://127.0.0.1:8000` by
default. To use a different local backend, set `VITE_API_BASE_URL` in an untracked
`.env.development.local` file.

## Build and verify

From the repository root, run:

```bash
cd frontend
npm ci
npm test
npm run lint
npm run build
```

`npm run build` runs TypeScript validation and the production Vite build. The
output directory is `frontend/dist/`. Confirm that the JavaScript under
`dist/assets/` contains `https://api.bonefree.pt` before uploading.

All public, customer, and administrator API clients use the shared configuration
in `src/api/clients.ts`. The image resolver uses the same origin for `/uploads/`
and `uploads/` paths, while preserving frontend assets and absolute external URLs.

## Upload to Hostinger

1. Back up the currently deployed frontend files through Hostinger's File Manager
   or SFTP.
2. Open the document root for `bonefree.pt` (usually `public_html`). Upload the
   **contents** of `frontend/dist/`, including `index.html`, `assets/`, and other
   generated public files, directly into that root. Do not upload the `dist`
   directory itself, source files, `node_modules`, or environment files.
3. Preserve existing Hostinger configuration, including any `.htaccess` used for
   React Router navigation. Check that a direct visit to an existing route such
   as `/menu` still works.
4. Clear any enabled Hostinger/CDN cache and refresh the browser. Check both
   production domains in the browser's Network panel: API requests must use
   `https://api.bonefree.pt` and uploaded images must load from that origin.
5. Verify login, registration, profile, administrator dashboard, product media,
   cart, checkout, and reviews with appropriate accounts.

The AWS backend must allow both `https://bonefree.pt` and
`https://www.bonefree.pt` in its `CORS_ORIGINS`. Browsers send their own origin;
there is no frontend CORS workaround. Use HTTPS for both the site and API.
With the fresh PostgreSQL database, use accounts and catalog records created on
the new backend when checking these flows.
