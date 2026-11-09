# Reservations, private passes and promotions

Implemented locally on 2026-11-08. No production deployment, production database
operation, email, SMS, commit or push was performed. All booking and promotion
examples used isolated test databases. Availability starts **disabled**.

## Architecture and data

The existing React Router application lazy-loads `/reservations` and the private
`/reservations/confirmation` screen. The form uses native date/time controls and
the generated FastAPI client. It does not fetch the product catalog. The existing
dashboard has a Reservations section with Reservations and Settings tabs.

Migration **20261108_0004**, following **20261108_0003**, creates only:

- `reservation_settings`: one locked configuration row; weekly windows,
  interval, notice, horizon, party/capacity limits, pause and retention settings.
- `reservation_exception`: closed dates or replacement opening windows.
- `reservation_promotion`: percentage, dates, enable/automatic flags and localized
  content, weekday and time restrictions.
- `reservation`: customer details, Lisbon date/time, guests, status, independent
  display reference, hashed private credentials/idempotency data, immutable
  promotion snapshot and saved restaurant details.

No cart, order, pricing, product, user, payment or historical table is rewritten.
The migration seeds one disabled settings row and is safe to upgrade repeatedly.
Existing-catalog preservation and schema/model parity were tested on PostgreSQL.
Downgrade deletes the four new tables and all their bookings/configuration; it is
not a data-preserving rollback.

Allocation, settings, promotions, exceptions, status changes and retention all
lock the singleton settings row until transaction completion. The booking then
rechecks the configured slot and aggregate confirmed booking/guest capacity.
This deliberately serializes writes for a small restaurant; it works across
workers and prevents concurrent requests taking the final place. See
[PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).

Calendar dates and wall times are Europe/Lisbon. Notice checks compare UTC
instants. Ambiguous/nonexistent DST slots are rejected. `tzdata` supplies a small
backend fallback on systems without an installed timezone database. No calendar,
PDF or other frontend dependency was added.

## Booking and pass behavior

Name, date, available time and party size are required. Email, phone and special
requests are optional, including in backend validation. Supplied contacts are
validated. There is no account, payment, seating selection or notification step.

The API commits the reservation before returning success. Repeated clicks are
locked in the form. Ambiguous network/5xx failures retain the same payload and
cryptographic 256-bit idempotency key for retry; concurrent retries return one
booking and the same private token. Reusing a key with different data is rejected.
An unfinished form is not restored after a browser refresh.

The branded mobile pass contains status, name, reference, date, time, guests,
and awarded offer/conditions. The saved venue address is available separately in
the directions section below the save actions. It gives truthful screenshot
instructions, a real PDF download, and a copy-private-link action. ReportLab,
already installed in the backend, generates text-based A4 PDFs with an embedded
Unicode font and local Bonefree logo. No webpage screenshot or external service
is used. Cancelled/completed/no-show passes show their status and cannot appear
to be active promotional passes.

The recovery URL uses a fragment: `/reservations/confirmation#token=…`. The token
is sent only in private POST bodies, never query strings or request paths. It is
separate from the shorter display reference. The database stores token and
idempotency hashes, a per-booking random HMAC salt and a payload hash; it does
not store the private URL or original retry key. A saved link remains a bearer
secret: anyone holding it can view the pass and cancel an eligible upcoming booking. Without it, the customer must contact the restaurant for manual lookup.
The staff must verify reference, status and promotion in the database: a screenshot
is not proof of cryptographic authenticity.

## Customer cancellation

The private confirmation page offers **Cancel reservation** while the server reports
`can_cancel: true`. The customer must explicitly confirm the displayed date and time;
opening the link or choosing **Keep reservation** makes no change. Requests use
`POST /reservations/confirmation/cancel` with the existing token and locale in the
JSON body. The token remains in the URL fragment, never in an HTTP URL.

Only confirmed reservations whose Lisbon start time is still in the future can be
cancelled online. There is no additional cutoff. Completed and no-show reservations,
and confirmed bookings at or after their start, return a 409 conflict. Already-cancelled
bookings return the same cancelled pass, including after the original start time, so
retrying after a lost response is safe. Pausing online reservations does not prevent
cancellation. Invalid private tokens return 404; the display reference cannot be used.

The endpoint shares the existing settings-row lock with allocation and staff status
changes. It commits before returning the cancelled pass; cancellation releases capacity
without deleting the booking or its saved promotion snapshot. The page immediately
updates the ticket and removes the active offer and cancellation controls. Reopening the
same link and downloading a PDF reflect the saved cancelled status. If staff change the
status before the customer confirms, a rejected cancellation refreshes the displayed pass.
Cancellation requests are limited to 10 per IP per five minutes, separately from creation.
No customer login, email notification, or schema migration is introduced.

## Administrator controls and promotion rules

- Owner and manager: paginated list, today/upcoming/all, date/status/search/offer
  filters, customer details, refresh, confirmed/cancelled/completed/no-show status.
- Owner: availability, promotions, exceptions and explicit retention deletion.
- Availability: weekly multi-window schedules, 15/30/60-minute intervals, notice,
  horizon, minimum/maximum guests, booking/guest capacity per slot, pause and
  special opening/closed dates. No hours or promotion is invented at installation.
- Settings/exception changes warn about conflicting confirmed bookings and leave
  those bookings intact. Cancellation releases capacity. Reconfirmation must pass
  current availability checks.
- Offers support a percentage greater than zero and no more than 100, inclusive
  reservation date range, weekdays, optional time windows, scope and conditions.
  Only enabled, automatic, eligible offers apply. Highest percentage wins; oldest
  ID breaks a tie. One offer applies; discounts never stack.
- Portuguese is the source text; complete English/German overrides are optional,
  with Portuguese fallback. Awarded content and translations are snapshotted at
  booking, so later edits/disabling never rewrite an existing entitlement.
- Offers appear after selecting an eligible slot, not in static SEO text. The
  restaurant redeems them manually on the reservation date, according to scope
  and conditions. No checkout discount is calculated.

Time/party editing was optional in the plan and is not included; cancel and make
a new booking when these need changing. There is no background notification,
automatic status transition, waitlist or allocation to physical tables.

## API contract

All routes have unique operation IDs and explicit response models/binary PDF
documentation. Existing API paths and schemas are semantically unchanged.
`frontend/openapi/openapi.json` and the TypeScript client were regenerated, not
hand-edited; two subsequent generations produced identical hashes.

| Method | Path | Access / behavior |
| --- | --- | --- |
| GET | `/reservations/settings` | Public form limits and Lisbon date bounds |
| GET | `/reservations/dates` | Available dates, at most 31 per request |
| GET | `/reservations/availability` | Slots/capacity and localized eligible offer |
| POST | `/reservations` | Atomic, idempotent booking creation |
| POST | `/reservations/confirmation` | Private token body; saved pass |
| POST | `/reservations/confirmation/cancel` | Private token body; cancel an upcoming booking (repeat-safe) |
| POST | `/reservations/confirmation/pdf` | Private token body; PDF attachment |
| GET | `/admin/reservations` | Owner/manager, database-filtered/paginated list |
| GET | `/admin/reservations/{id}` | Owner/manager booking details |
| PATCH | `/admin/reservations/{id}` | Owner/manager status change |
| GET / PUT | `/admin/reservations/settings` | Owner/manager read; owner write |
| GET / PUT | `/admin/reservations/exceptions` | Owner/manager read; owner write |
| DELETE | `/admin/reservations/exceptions/{day}` | Owner |
| GET / POST | `/admin/reservations/promotions` | Owner/manager read; owner create |
| PUT | `/admin/reservations/promotions/{id}` | Owner edit/disable |
| DELETE | `/admin/reservations/retention` | Owner; remove bookings older than configured retention |

## Privacy, security and SEO

All administrator routes use the existing bearer-token role dependencies; no
cookie authentication was introduced. Public create requests are limited to
10 per IP per five minutes; other public reservation requests to 90 per minute,
using the existing Redis limiter/proxy policy. Request bodies are bounded at
16 KiB public / 64 KiB admin. Validation rejects unexpected fields and NUL input.
Unexpected failures return generic errors and redact exception details before
they reach access/error logging. Infrastructure must not add request-body logging
or third-party session replay on these screens.

Reservation API responses, including errors/PDFs, send no-store/private,
no-referrer and noindex headers. The Hostinger private HTML route has equivalent
headers and metadata. No customer/token data enters public response caches,
analytics or browser persistent storage. The link fragment does remain in the
customer's own browser history/bookmarks, as expected for a saved private link.

The localized privacy page explains reservation processing and optional contacts.
Default retention is 180 days after the reservation date, configurable 30–730.
Deletion is an explicit owner operation, **not an automatic scheduled job**.
Owners must operate that policy and review hosting/backups/access/retention and
their legal privacy notice before release. This implementation is not a legal
compliance certification.

`/reservations` has initial styled crawlable HTML, one H1, translated metadata,
canonical/OG tags and a sitemap entry. Private confirmations have no canonical
and never enter the sitemap. Existing product sitemap snapshots, robot rules,
404/410 handling, lazy routes, local fonts, catalog caches and homepage hero stay.
Restaurant JSON-LD is preserved. The live booking page adds a
[ReserveAction](https://schema.org/ReserveAction) only after the API confirms that
booking is enabled; there are no invented opening hours, ratings or offers.
Localized links were added to home, navigation/mobile navigation, menu, product
details and footer.

## Validation and repeatable QA

- Backend: **177 tests passed**, including the real PostgreSQL suite; no skips.
  Includes optional contacts, validation, capacity, idempotency, roles, settings,
  exceptions, promotion selection/snapshots, cancellation, retention, private
  access/PDFs, rate/body limits, DST and redacted errors.
- PostgreSQL 18.6: twelve simultaneous final-slot attempts yield one booking;
  eight concurrent same-key attempts yield one booking/token. Pause/cancellation
  serialization, populated-catalog migration, repeated upgrades, downgrade and
  re-upgrade/model parity pass on separate disposable databases.
- Frontend: **122 tests in 30 files passed**, TypeScript, ESLint and Vite production
  build passed. No new frontend dependencies. `pip check` passed.
- Chrome: **32 checks passed** against the real PostgreSQL-backed API, including
  configuring availability/promotion through admin, contact-free booking, pass,
  downloaded PDF, recovery, cancellation/capacity release, snapshot persistence,
  no offer, language switching, lost-response retry without duplication, disabled
  initial configuration and 320/390/820/1440px layouts. No runtime exceptions or
  product requests. Mobile screenshots were inspected.
- Apache: **27 local HTTP/TLS checks passed**, including private headers,
  reservations aliases/canonical redirects, all seven public pages, sitemap,
  admin/product routing, existing 404/410s and both canonical origin redirects.
- Generated artifacts were reproduced twice with identical hashes. Existing API
  path/schema contents were compared semantically with HEAD and are unchanged.
  `git diff --check` passed.

No production Lighthouse score or production latency result is claimed. Physical
iPhone Safari/keyboard/clipboard and live Hostinger header behavior remain release
checks. Native Chrome emulation is not a substitute for a physical device.

Backend tests (macOS/Linux; Windows uses the existing `.venv\\Scripts\\python.exe`):

```sh
cd backend
.venv/bin/python -m unittest discover -s tests -v
```

For real PostgreSQL checks set `TEST_POSTGRES_DATABASE_URL` to a disposable database
named **bonefree_test**, host localhost/127.0.0.1 or the CI postgres service. The
tests migrate/reset this database; never use production or a developer catalog.

For browser QA, create a separate disposable local PostgreSQL database named
**bonefree_browser**, set `TEST_POSTGRES_BROWSER_DATABASE_URL`, and run from the
repository root:

```sh
backend/.venv/bin/python backend/scripts/run_reservation_browser_api.py --reset-reservations
```

This guarded fixture runner migrates that database, seeds test-only owner/manager
sessions, binds 127.0.0.1:19102 and disables rate limiting only for the fixture.
The reset flag deletes fixture reservations/promotions/exceptions. In another
terminal, from `frontend`, run `npm run build` then
`npm run test:reservations:browser`. Set `CHROME_BIN` if Chrome is elsewhere.
Artifacts/results are printed in a temporary directory. The harness accepts only
a loopback test API. Stop the fixture afterward. The temporary embedded PostgreSQL
binaries used for this implementation's QA are not application dependencies.

## Safe release sequence — operator instructions, not executed

1. Review all source, migration and generated-client changes. Run checks and commit
   them together, then push the reviewed branch and wait for CI. Test the sequence
   on a separate restored PostgreSQL database and staging API/frontend, including
   backup restoration and authenticated admin flows. Do not add fixture users,
   tokens, bookings or example discounts to production.
2. Preserve the previous API image/release, Hostinger files and rewrite config.
   From the existing EC2 checkout with its existing Compose project, `.env` and
   volumes, build the reviewed API, stop only API publishing, and back up:

```sh
docker compose build api
docker compose stop api
reservation_backup="backups/reservations-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$reservation_backup"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$reservation_backup/database.dump"
docker compose exec -T postgres pg_restore --list < "$reservation_backup/database.dump" > "$reservation_backup/database-contents.txt"
docker compose run --rm --no-deps -T api tar -C /app -czf - uploads > "$reservation_backup/uploads.tar.gz"
```

Check success/nonempty backups, copy them off-instance and verify restoration on
staging. If any backup fails, stop and restore service with the prior reviewed
release; do not migrate. Do not recreate PostgreSQL or remove volumes.

3. Run the migration with the new image while API remains stopped:

```sh
docker compose run --rm --no-deps -T api python -m alembic -c alembic.ini current
docker compose run --rm --no-deps -T api python -m alembic -c alembic.ini upgrade head
docker compose run --rm --no-deps -T api python -m alembic -c alembic.ini current
docker compose up -d --no-deps api
docker compose ps api
docker compose logs --tail=100 api
curl -fsS https://api.bonefree.pt/health
curl -fsS https://api.bonefree.pt/reservations/settings
```

The expected previous head is 0003, final head **20261108_0004**. Investigate any
different revision/error; never stamp/clear the database to bypass it. Repeating
upgrade head is safe. Initial public settings must report enabled=false. Verify
existing product responses and Redis health. Never paste credentials/private
links or request bodies into logs.

4. Build on the release machine with the actual production API environment. From
   `frontend`, refresh the verified product snapshot; no fixture IDs may ship:

```sh
npm ci
npm run lint
npm test
npm run seo:catalog -- https://api.bonefree.pt /tmp/bonefree-public-catalog.json
BONEFREE_CATALOG_SNAPSHOT=/tmp/bonefree-public-catalog.json npm run build
```

Upload all dist contents, including hidden `.htaccess`, route directories, private
shell, hashed assets, sitemap, robots and errors. Upload new assets before HTML
and keep previous hashed assets temporarily for open tabs. Merge host-specific
rewrite/header configuration; keep private no-store headers active in any CDN.
Do not edit dist by hand. No DNS, Docker infrastructure or SMTP change is needed.

5. Verify home/menu/product/languages/SEO and actual HTTP headers for public,
   private, unknown and retired routes. Sign in as owner to configure verified
   weekly hours, capacities, exceptions and venue details; enable booking only
   when staff are ready. Configure a promotion only with approved commercial
   terms and translations. Check warnings before saving settings changes.
6. With staff coordination, make one clearly identified reversible verification
   booking, verify the admin record and private PDF/reload, then cancel it and
   confirm capacity release/inactive pass. Avoid unnecessary production fixtures.
   Check physical mobile devices and optional-contact behavior. Submit the updated
   sitemap using the existing Search Console process. No submission was made here.

Rollback: revert frontend first or pause booking while diagnosing. Prefer a forward
fix. An older API's startup migration check rejects an unknown newer Alembic head;
an image swap alone is not a safe backend rollback. Downgrade with the new image
only after explicit operator review/export/maintenance: it erases reservation and
promotion data. Never restore a full backup over subsequent legitimate writes
without a reviewed recovery plan.

## File inventory

Backend additions: `reservation_models.py`, `schemas/reservations.py`,
`services/reservations.py`, `services/reservation_pdf.py`, `routers/reservations.py`,
`core/reservation_privacy.py`, migration `20261108_0004_reservations.py`,
`tests/test_reservations.py`, `tests/test_reservations_postgres.py`,
`scripts/run_reservation_browser_api.py`. Integration changes: `app.py`, `models.py`,
`core/exception_handlers.py`, `requirements.txt`, `tests/test_schema_baseline.py`.

Frontend additions: `pages/Reservations.tsx`/`.css`, `components/ReservationPass.tsx`
and test, `components/admin/ReservationAdmin.tsx`/`.css`,
`services/reservationService.ts` and test, `i18n/reservations.ts`,
`utils/reservationFormatting.ts`, `scripts/test-reservations-browser.mjs`.
Integration changes: App, AdminDashboard/adminAccess tests, Home/Menu/ProductDetail,
Navbar/Footer/Privacy, locale/admin phrases, prerender, metadata/documentMetadata
and tests, catalogSnapshot, Vite config, `.htaccess`, package script, OpenAPI and
generated client. The existing public catalog/infinite-feed implementation is not
replaced. This document records the implementation and release requirements.


## Interface refinement — 2026-11-09

The public form and pass now use the site's existing soft green/yellow theme,
rounded surfaces, typography and lightweight Lucide icons. Date and guest inputs
share a compact mobile row; the main action is full-width. The pass groups its
reference, visit details, address and offer clearly, with icon-labelled PDF and
private-link actions. All controls retain visible focus states and mobile-safe
16px input text.

The reservation admin section has a padded header, segmented tabs, search/filter
toolbar, booking status badges, clearer cards and a translated empty state.
Settings use the dashboard's light/dark surface tokens; a scoped override prevents
the global public select reset from making dark-mode dropdowns white. Existing
roles, settings, capacity, promotions and API behavior are unchanged. No new
dependency or backend change was made for this refinement.

Validation: 122 frontend tests, ESLint, TypeScript and production build passed.
All 37 browser checks passed, including settings layout, mobile field sizing and
dark-select surfaces alongside the existing full booking flow. Phone/tablet/desktop screenshots
were inspected. No deployment or production mutation was performed.


## Confirmation screen

Confirmation uses one responsive column, at most 440px wide. A status heading and
localized screenshot instruction appear before the complete cream ticket. The
customer name, date, time, guests and reference are grouped inside the ticket;
applicable promotion terms remain visible and are never truncated. The ticket restores the centred logo, stacked booking details, scalloped edges and
yellow perforation. Its lower stub contains the customer name and reference; the restaurant name
and street address stay in the separate directions section. The cream paper uses
a deeper warm tint. There is no simulated screenshot button.

PDF download and private-link copying follow the pass. Copy feedback is announced
in a live region, and a short adjacent note explains that the private link grants
access and cancellation. Directions expand separately below these actions. Making
another reservation remains a secondary footer action. Cancellation sits directly
below the ticket and retains its two-step confirmation; its tinted default button
becomes muted on hover. Inactive bookings show their actual status in both the page heading
and ticket and do not show a confirmed heading or active promotion.

On entry, the page scrolls to the confirmation heading and focuses it without
scrolling away. Long names and terms wrap naturally; smaller screens can scroll
without a fixed pass height. Confirmation omits the form's floating decorations.


## Automatic administrator list refresh

The reservations tab fetches the current filtered page every 10 seconds while
visible and online, and refreshes on focus, tab visibility and network recovery.
New bookings, customer cancellations, totals and statuses update without a page
reload. Filters, pagination and expanded booking details remain in place.
Requests never overlap within a subscription; changing filters, switching tabs,
unmounting or starting a status update aborts the old subscription so its response
cannot overwrite newer data. Polling pauses during administrator writes and resumes
with a fresh request afterward. Settings forms are not polled. Background failures
retain the current list and retry on the next refresh.
