# Admin CRUD reliability fixes — 2026-11-08

## Problems found

- Product saves required manual calories even when the existing product had
  unknown calories. The API explicitly allows `null`. New products also defaulted
  to automatic calculation, which blocked progress without ingredients/quantities.
- A validation-message effect depended on the message itself, immediately clearing
  newly displayed feedback.
- Product data saved before image uploads, but failed uploads left the editor
  without a checkpoint. Retrying creation could create another product and retry
  already completed images. There were no product save guards.
- Existing and pending image previews shared a positional array, making partial
  save recovery fragile. Preview object URLs were not released.
- The editor opened from list data and did not catch failures loading reference
  data. Catalog translation instructions lived under the wrong namespace.
- Other admin forms lacked save guards and often replaced useful API errors with
  generic messages.

## Changes

- Unknown manual calories remain optional; new products start in that mode.
  Automatic calculation still validates the data it needs. Ordinary edits no
  longer require inventing nutrition information.
- Validation and upload errors remain visible. Opening a product loads its latest
  detail data, reports failures and ignores stale editor requests.
- Product save orchestration checkpoints the returned product ID and each
  completed image. Uploads append explicitly with `replace_existing=false`.
  Only completed files leave the pending queue; a failure keeps the editor open
  and names the failed image. Retry uses the saved product and remaining queue.
- Existing media and pending previews are displayed separately. Completed
  uploads appear immediately; removing a primary image refreshes the gallery and
  shows the promoted primary. Pending object URLs are revoked when no longer used.
- Product fields, navigation, removal and closing are guarded during mutations.
  Category, ingredient and staff forms also block duplicate submits, show a
  saving state and protect active saves from conflicting editor actions.
- Catalog instructions and source-name validation resolve correctly in Portuguese,
  English and German. Failed CRUD actions show the available API error message.

The product record and each image remain separate existing API transactions.
After a partial failure, the record and completed images stay saved; the open
editor offers the remaining files for retry. No new endpoint, generated-client
edit, migration, authentication rule or database schema change was needed.

## Verification

- Frontend: ESLint, TypeScript, production Vite build and **58 tests in 21 files**
  pass. New regressions cover multi-image append, partial-upload checkpoints,
  retry without duplicate creation, failed updates and translation namespaces.
- Backend: **154 tests run successfully, one skipped**. The skipped test requires
  a dedicated PostgreSQL test URL. A new API regression covers editing with null
  calories, three uploaded images, rejection of invalid image bytes without losing
  the gallery, and primary-image deletion/reindexing.
- Real browser tests used the production frontend with an isolated FastAPI app,
  temporary SQLite database and temporary upload directory. Production startup
  jobs were disabled. No production account or database was used.
- Product browser checks: edit name/price with unknown calories; upload three
  images to one product; delete primary and preserve other images; simulate a
  failure on the second image of a new product; retain the created ID and first
  image; retry only remaining images; verify one product with three images;
  check the editor at a 390px mobile viewport. No runtime exceptions.
- Additional browser checks: create/edit categories and clear description;
  double-click save sends one update; deactivate/restore category; create/edit
  ingredient nutrition; create staff and edit without resetting the password;
  verify translated editor instructions. No runtime exceptions.
- `git diff --check` passes. Public-page design, SEO and hosting rules were not
  changed. The temporary test API was stopped after verification.

Detailed local browser request logs are in
`/private/tmp/bonefree-admin-qa/product-results.json` and
`/private/tmp/bonefree-admin-qa/results.json`; the backend test log is
`/private/tmp/bonefree-admin-backend-tests.log`.

Nothing has been deployed. Deploy the rebuilt frontend against the existing
repository API contract to apply these fixes to the hosted admin interface.


## Responsive admin follow-up

- Replaced the always-expanded product filter panel with a compact icon search
  and an accessible Filters toggle, including a count of active advanced filters.
  Category, price, featured, gluten-free and alcohol filters remain available.
- Simplified directory search styling and increased mobile input/select/textarea
  text to 16px to address phone focus zoom. Browser pinch zoom remains enabled.
- Product editor fills the phone viewport, uses safe-area padding, keeps the close
  and action controls accessible, and scrolls the current form section. Background
  scrolling is locked during editing and restored when the editor closes.
- Corrected inherited mobile margins and desktop transform animation for the
  full-screen phone editor. Public website styling and backend code are unchanged
  by this follow-up.
- Validation: TypeScript/production build, ESLint, and all 58 frontend tests pass.
  Local headless Chrome passed 53 checks at 1440px, 390px and 320px,
  including actual navigation through all five editor steps, editor/action bounds,
  mobile field font sizes, filter expansion, scroll restoration and no runtime
  exceptions. Checks used an isolated test API; its in-memory SQLite requests
  were serialized to avoid shared-connection concurrency artifacts.
- Physical iPhone Safari focus/keyboard behavior remains a manual check. No
  production deployment or production database changes were performed.
