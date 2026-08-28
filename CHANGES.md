
# Changes in single-tenant branch
This section is a synchronization guide for changes that exist here but still need to be reproduced in the multi-tenant branch. Paths are relative to the repository root. Port the behavior into the multi-tenant architecture and preserve its tenant filters and authorization boundaries; do not blindly replace tenant-aware modules with their single-tenant equivalents. Generated API files must be regenerated from the target branch's OpenAPI document instead of edited by hand.

## 1. Remove the guest-browser expiry/account-linking notice from order details

Required behavior:

- Do not render the notice saying that guest access is restricted to the current browser, expires in 24 hours, or will not be associated automatically with an account.
- Keep guest-token validation, expiry enforcement, order access, and authenticated-customer behavior unchanged. This is only removal of confusing explanatory UI.

Files changed in this branch:

- `frontend/src/pages/OrderDetails.tsx`: removed the `guestToken`-conditioned paragraph that rendered `t("order.guestNote")`.
- `frontend/src/pages/OrderDetails.css`: removed the unused `.order-details-guest-note` selectors while retaining the error and item-helper styles.
- `frontend/src/i18n/locales/pt-PT.ts`: removed `order.guestNote` in Portuguese.
- `frontend/src/i18n/locales/en-GB.ts`: removed `order.guestNote` in English.
- `frontend/src/i18n/locales/de-DE.ts`: removed `order.guestNote` in German.

No backend endpoint, database schema, or guest-access security rule changed for this item.

## 2. Give managers and owners unrestricted Management control and allow deletion of cancelled orders

Required backend behavior:

- A `manager` or `owner` may change an order to any valid `OrderState`, even when the payment is still unpaid. Operational payment and transition checks continue to apply to chef/waiter actions.
- When an administrator changes an order to `cancelled`, set `canceled_at` if it is not already set and set `cancellation_origin` to `ADMIN`.
- When restoring an order from `cancelled` to another state, clear `canceled_at` and `cancellation_origin`.
- Add `DELETE /admin/orders/{order_id}` with operation ID `admin_management_delete_cancelled_order`, `MessageResponse`, and exact `Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE))` protection (manager and owner).
- The delete endpoint must return `409 order_must_be_cancelled` unless the loaded order is already cancelled. If eligible, delete the loaded ORM entity with `db.delete(order)` and commit once so configured relationships/cascades clean up associated records.

Backend files:

- `backend/routers/admin.py`: manager/owner bypass in `_ensure_order_status_allowed`, cancellation metadata maintenance in `update_order_status`, and the manager/owner cancelled-order delete route.
- `backend/tests/test_endpoint_smoke.py`: coverage for arbitrary manager/owner transitions, cancellation metadata, authorization, active-order deletion rejection, successful cancelled-order deletion, and cleanup of related rows.

Required frontend behavior:

- Show an `Eliminar`/`Delete` action only for cancelled orders in both the card and table layouts of the Management view.
- Ask for confirmation before permanent deletion, call the delete API, remove the deleted order from local state, and surface API errors through the existing dashboard error/toast flow.

Frontend files:

- `frontend/src/components/admin-orders/SuperAdminOrdersView.tsx`: added the `onDelete` callback and cancelled-order delete buttons in card and table layouts.
- `frontend/src/pages/AdminDashboard.tsx`: added the destructive confirmation dialog, delete service call, local-state removal, Portuguese success/error toasts, and passed the handler to `SuperAdminOrdersView`.
- `frontend/src/services/adminService.ts`: added the `deleteOrder` wrapper around `adminManagementDeleteCancelledOrder`.
- `frontend/src/i18n/locales/pt-PT.ts`, `frontend/src/i18n/locales/en-GB.ts`, `frontend/src/i18n/locales/de-DE.ts`: added `orders.common.delete`; the confirmation and toast copy currently lives directly in `AdminDashboard.tsx`.

API contract files regenerated after adding the endpoint:

- `frontend/openapi/openapi.json`
- `frontend/src/api/generated/index.ts`
- `frontend/src/api/generated/sdk.gen.ts`
- `frontend/src/api/generated/types.gen.ts`

After porting the backend route, export the multi-tenant OpenAPI document and run `npm.cmd run api:generate` from `frontend`; do not copy the generated files if the tenant-aware contract differs.

## 3. Consolidate the administrative order interfaces into one role-aware console

Required navigation and URL behavior:

- `/admin/dashboard` is the only rendered administrative console.
- The Orders tab stores its mode in the URL as `?tab=orders&view=service`, `view=kitchen`, or `view=management`, so refresh, browser history, copied links, and favorites preserve the selected mode.
- `/admin/super` redirects to `/admin/dashboard`.
- `/admin/staff` redirects to `/admin/dashboard?tab=orders&view=service`.
- `/admin/kitchen` redirects to `/admin/dashboard?tab=orders&view=kitchen`.
- Login and unauthorized-route fallbacks must target the canonical dashboard URL appropriate for the current role.
- An invalid or unauthorized `view` query value must be replaced safely with that role's default view.

Role/view matrix and defaults:

| Role | Counter (`service`) | Kitchen (`kitchen`) | Management (`management`) | Default |
|---|---|---|---|---|
| Owner | Full actions | Full actions | Full actions | Dashboard overview; Management when Orders opens |
| Manager | Full actions | Full actions | Unrestricted state/delete actions | Counter |
| Chef | Read only | Full preparation actions | No access | Kitchen |
| Waiter | Payment, eligible cancellation, and ready-order handoff actions | Full preparation actions | No access | Counter |

Required order workflow and authorization:

- Counter payment confirmation marks the order paid and moves it directly to `confirmed`; the UI immediately reports `Pagamento confirmado; pedido enviado para a cozinha.` and the card moves to the kitchen-progress column. There is no second `Enviar para a cozinha` action.
- Waiters may confirm counter payments, advance `confirmed -> in_preparation -> ready`, deliver only paid ready orders, and cancel only orders allowed by the existing unpaid-cancellation rules. Directly setting `confirmed` remains forbidden because payment confirmation owns that transition.
- Chefs may list the Counter board without actions and advance only the ordered Kitchen sequence; payment confirmation, Counter cancellation, and handoff remain forbidden.
- Managers and owners are unrestricted through Management and may permanently delete cancelled orders.
- The active view chooses its own endpoint: Management uses the management order list, Counter uses the staff/service list, and Kitchen uses the kitchen list. Initial load, polling, window focus, visibility refresh, manual refresh, and stale-request protection must all follow the current URL view.

Backend files:

- `backend/services/auth_service.py`: added the shared `WAITER_ROLE` constant used by route dependencies and transition checks.
- `backend/routers/admin.py`: exposes both operational lists to every staff role, lets waiter and chef advance the ordered Kitchen sequence, keeps chef away from Counter mutations, and grants manager/owner unrestricted Management actions.
- `backend/tests/test_endpoint_smoke.py`: covers the progressive Chef -> Waiter -> Manager -> Owner order matrix, automatic payment handoff, ordered preparation, early delivery, paid cancellation, Management denial, and manager/owner deletion.

Frontend routing and role helpers:

- `frontend/src/App.tsx`: canonical dashboard route for all four roles plus compatibility redirects for `/admin/super`, `/admin/staff`, and `/admin/kitchen`.
- `frontend/src/pages/AdminLogin.tsx`: role-based post-login navigation now targets the unified console.
- `frontend/src/utils/adminOrderViews.ts`: defines dashboard tabs, `AdminOrderView`, the role/view matrix, role defaults, unauthorized-view fallback, service/kitchen capabilities, catalog capabilities, and canonical dashboard entry paths.
- `frontend/src/utils/adminOrderViews.test.ts`: tests every role's views, defaults, entry paths, catalog CRUD boundary, operational capabilities, and invalid/unauthorized URL fallback.

Frontend console and boards:

- `frontend/src/pages/AdminDashboard.tsx`: removed the separate `experience` prop; derives tabs and order views from role plus URL; loads the endpoint for the active view; protects against stale requests; keeps polling/focus refresh view-aware; wires payment, status, and delete actions into the appropriate board.
- `frontend/src/components/admin-orders/OrderViewSwitcher.tsx`: top-of-Orders mode selector with `Store`, `ChefHat`, and `ClipboardList` icons; only authorized modes are rendered and the current mode uses `role="tab"`/`aria-selected`.
- `frontend/src/pages/AdminDashboard.css`: prominent but neutral, non-gradient selector layout; responsive equal-width mode buttons; clear hover, focus, and selected states without a visible read-only badge.
- `frontend/src/components/admin-orders/StaffOrdersBoard.tsx`: accepts `readOnly` so chef retains filters, cards and details while all payment, delivery and cancellation actions are omitted.
- `frontend/src/components/admin-orders/KitchenOrdersBoard.tsx`: retains the preparation actions for every staff role.
- `frontend/src/i18n/locales/pt-PT.ts`, `frontend/src/i18n/locales/en-GB.ts`, `frontend/src/i18n/locales/de-DE.ts`: mode-selector copy and revised Counter terminology; removed the obsolete send-to-kitchen and visible read-only labels.

## 4. Split catalog reading, availability, and structural CRUD by staff level

Required behavior:

- Chef and waiter see the Products and Ingredients tabs, including active, inactive and soft-deleted records, filters, linked products, and the complete product analytics drawer.
- Their only catalog mutation is the dedicated available/unavailable action. Create/edit forms, media actions, archive/delete, restore, and drawer edit/delete actions must not render.
- Manager and owner retain full product, ingredient, category, media, archive and restore controls. The Categories tab remains hidden from chef/waiter, although they may read category metadata for product filters.
- Availability is independent from entity status: lower staff may change availability on an archived record but cannot reactivate it. Unavailable base ingredients continue to affect effective product availability.

Backend files and exact authorization split:

- `backend/routers/admin.py`: product/category/ingredient list routes, product detail/analytics, and the two dedicated availability routes use `Depends(require_role(WAITER_ROLE, CHEF_ROLE, STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE))`; structural POST/PUT/DELETE, status, restore and media routes remain `Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE))`.
- `backend/tests/test_endpoint_smoke.py`: verifies read and availability success for all four roles, structural mutation denial for chef/waiter, manager/owner retention, inactive/deleted visibility, and availability propagation.

Frontend files:

- `frontend/src/pages/AdminDashboard.tsx`: exposes Products/Ingredients to all staff; loads inactive/deleted records; uses separate view/edit capabilities; hides every structural action for chef/waiter; keeps analytics read-only; adds availability to archived product rows.
- `frontend/src/utils/adminOrderViews.ts` and its test: centralize and verify `canViewCatalog`, `canEditCatalog`, `canManageServiceOrders`, and `canManageKitchenOrders` rather than scattering role comparisons.
- `ACCESS_MATRIX.md`: source-of-truth staff table ordered progressively as Chef -> Waiter -> Manager -> Owner, based on the accessible SVG/CSS layout in `examples/MATRIZ_ACESSO.md`.

No migration or response model changes are required. Authorization dependencies may not alter the OpenAPI shape, but the target branch must still export and compare its document before considering the port complete.

Brand/browser integration included with the console refinement:

- `frontend/index.html`: replaced the nonexistent `/favicon.svg` reference with `/assets/images/bonefree-logo.png` for both `rel="icon"` and `rel="apple-touch-icon"`.
- `frontend/public/assets/images/bonefree-logo.png`: existing 512 x 512 transparent Bonefree logo used by those links; the asset itself was not modified.

No migration or response-shape change was required for the console consolidation. The OpenAPI export and generated client were checked after the authorization-only backend edits and produced no additional contract diff.

## 5. Preserve multiple guest orders and claim them after customer authentication

Required guest-access behavior:

- Replace the single `active_order_id`, `active_order_access_token`, and `active_order_access_expires_at` values with the versioned `bonefree_guest_order_accesses_v1` object. Each property is keyed by `order_id` and stores that order's token and expiry independently.
- On the first read, migrate a valid token from the three legacy keys into the collection and remove all legacy keys. Malformed, expired, invalid, or inaccessible entries are removed individually without deleting other guest orders.
- Creating another guest order appends or updates only that order. Delivered and cancelled orders remain stored and visible until their access expires; hiding the status tracker or leaving a detail page must not delete the token.
- `/orders` is a real guest-facing “My orders” page. It loads every stored order with its own `X-Order-Token`, retains partial results when one request fails, polls/focus-refreshes, and provides details, eligible cancellation, and paid receipt download. Authenticated customers visiting `/orders` are redirected to `/profile?tab=orders`.
- Show the neutral account callout `Guarde os seus pedidos para mais tarde. Inicie sessão ou crie uma conta para os gerir em qualquer dispositivo.` with login and registration links that return through `/orders`.
- The global tracker shows all non-terminal orders as separate rows with number, state, detail link, and eligible cancellation. It obtains authenticated orders from history and guest orders from the local collection; one failed guest request cannot hide the other rows. Terminal orders disappear from this compact tracker but remain on `/orders`.
- The desktop/tablet navbar shows a guest-order icon and count when local accesses exist, the mobile drawer gains “My orders”, and the mobile bottom navigation replaces the unavailable guest Profile destination with My orders. All surfaces react to same-tab custom events and cross-tab `storage` events.
- Checkout confirmation calculates the guest's active-order count from every stored access and links to `/orders`; `OrderDetails` resolves the token by its route `order_id`. The obsolete copy claiming that a guest order will not be associated automatically was replaced in all locales.

Backend contract and security:

- `backend/schemas/checkout.py` adds `GuestOrderClaimItem`, `GuestOrderClaimRequest`, and `GuestOrderClaimResponse`. The request contains 1–50 `{order_id, access_token}` pairs; the response separates `claimed_order_ids` and `rejected_order_ids`.
- `backend/routers/checkout.py` adds authenticated `POST /checkout/orders/claim` with operation ID `checkout_claim_guest_orders`, `GuestOrderClaimResponse`, and `Depends(get_current_user)`.
- Load all requested orders with one SQLAlchemy 2.x `IN (...)` statement, index them in memory, hash and constant-time-compare each submitted token, and claim only unowned orders with unexpired matching credentials. A claimed order receives the current `customer_id`; its guest token hash and expiry are cleared so the bearer credential cannot be reused.
- An order owned by another account, expired access, wrong token, or unknown ID is rejected without preventing other valid entries from being claimed. Repeating a successful request as the same owner is idempotent. Commit the batch once.
- Claiming changes ownership/history only. It must not award loyalty progress or coupons retroactively and requires no migration.

Authentication and frontend data flow:

- `frontend/src/services/checkoutService.ts` wraps generated `checkoutClaimGuestOrders`; `frontend/src/types/checkout.ts` defines the domain input/result.
- `frontend/src/services/guestOrderService.ts` batches stored accesses according to the API limit, prevents concurrent duplicate claim calls, and removes claimed/rejected local credentials only after a successful response. A network/API failure leaves the complete unprocessed batch in local storage for retry.
- `frontend/src/context/AuthContext.tsx` runs cart merge and guest-order claim independently after login/registration. Existing authenticated-session hydration retries guest-order claiming, so a previous transient failure is recoverable without logging out.
- `frontend/src/components/orderStatusStorage.ts` owns collection parsing, validation, migration, expiry pruning, per-order lookup/removal, and update notification. Do not recreate token lookups directly in pages.

Frontend files to port:

- Routing/pages/styles: `frontend/src/App.tsx`, `frontend/src/pages/GuestOrders.tsx`, `frontend/src/pages/GuestOrders.css`, `frontend/src/pages/Checkout.tsx`, `frontend/src/pages/OrderDetails.tsx`, and `frontend/src/pages/Profile.tsx`.
- Shared UI/storage/authentication: `frontend/src/components/Navbar.tsx`, `frontend/src/components/OrderStatusBar.tsx`, `frontend/src/components/OrderStatusBar.css`, `frontend/src/components/orderStatusStorage.ts`, and `frontend/src/context/AuthContext.tsx`.
- Services/types/translations: `frontend/src/services/checkoutService.ts`, `frontend/src/services/guestOrderService.ts`, `frontend/src/services/index.ts`, `frontend/src/types/checkout.ts`, plus `pt-PT.ts`, `en-GB.ts`, and `de-DE.ts` under `frontend/src/i18n/locales`.
- Tests: `frontend/src/components/orderStatusStorage.test.ts`, `frontend/src/services/guestOrderService.test.ts`, and `backend/tests/test_endpoint_smoke.py` cover multi-token persistence, legacy migration, selective cleanup, successful/failed claiming, expiry, cross-account denial, token invalidation, account history, and no retroactive loyalty.

API contract files regenerated for this feature:

- `frontend/openapi/openapi.json`
- `frontend/src/api/generated/index.ts`
- `frontend/src/api/generated/sdk.gen.ts`
- `frontend/src/api/generated/types.gen.ts`

For the multi-tenant port, add tenant ownership to the batched order selection and assignment. A valid token must never move an order across tenants, even when the authenticated customer exists in another tenant. Export that branch's OpenAPI and regenerate its client rather than copying these generated files.

## 6. Keep authenticated order navigation visible and omit empty history filters

Required behavior:

- Keep the “My orders” receipt icon beside the cart after login/registration. For guests with locally stored orders it targets `/orders` and displays the local count; for authenticated customers it remains visible without a local-token badge and targets `/profile?tab=orders`.
- Add “My orders” to the authenticated account dropdown and responsive drawer so the same destination remains discoverable outside the desktop icon row.
- Never serialize blank purchase-history filters. With the default filter state, request `/profile/orders` without a query string; include only populated fields such as `status=ready` or `date_from=2026-08-01`.
- This prevents FastAPI from attempting to parse an empty string as `date`, which previously returned `422` and was incorrectly surfaced by the generic frontend error translator as “Correct the highlighted fields”. No backend validation relaxation is needed.

Files changed:

- `frontend/src/components/Navbar.tsx`: persistent authenticated order shortcut, authenticated account-menu entry, responsive drawer entry, and role-aware destination/badge behavior.
- `frontend/src/services/authService.ts`: filters out empty strings before converting camel-case filter names into the generated API query type.
- `frontend/src/api/clients.test.ts`: verifies that all-empty filters produce exactly `/profile/orders` and populated filters retain their snake-case query parameters.

The OpenAPI contract, generated client, database schema, and backend routes do not change for this correction. Apply the same frontend changes directly in the multi-tenant branch; its tenant-aware history endpoint should continue enforcing ownership server-side.

## 7. Open order tracking in the detail route and unify inaccessible-order presentation

Required navigation behavior:

- The authenticated Profile order-card action labelled “Acompanhar pedido”/“Track order” must navigate directly to `/orders/{order_id}`. Do not dispatch the old `order-status-highlight` browser event or replace navigation with the transient “A acompanhar o pedido” success message.
- The detail page's back action is role-aware: authenticated customers return to `/profile?tab=orders`; guests return to `/orders`.
- A malformed order ID, an unauthenticated visit without the matching local guest credential, an expired/invalid guest credential, or an API `401`, `403`, or `404` must render the same branded `ResourceNotFound kind="order"` page already used for authenticated nonexistent/not-owned orders.
- Keep network/server failures distinct from an inaccessible order: non-authentication failures continue to use the inline error state, allowing a genuine temporary error to be retried instead of being mislabeled as 404.
- When an invalid guest token receives `401`/`404`, remove only that order's local credential before showing the shared 404. This preserves all other locally tracked guest orders and avoids disclosing whether the requested order exists.

Detail-page presentation:

- Use a full-width branded order header with order number, creation time, and current-status badge.
- Render the normal lifecycle as an accessible five-step progress bar: `pending -> confirmed -> in_preparation -> ready -> delivered`. Completed, current, and upcoming steps must be visually distinct and the current step must expose `aria-current="step"`.
- Cancelled orders use a dedicated cancellation notice instead of implying progress through the normal delivery lifecycle.
- Each line item displays the order snapshot's `media` image in its `card` variant, resolves API-relative upload URLs through the existing image helpers, falls back to the standard product image on load failure, overlays the quantity, and retains customization and subtotal information.
- Keep cancellation, paid-receipt download, guest tracking dismissal, polling, and per-order guest token lookup behavior intact. The summary remains visible alongside the item list on desktop and becomes a normal stacked card on mobile.

Files changed:

- `frontend/src/pages/Profile.tsx`: changed `handleTrackOrder` from status-bar highlighting/message state to `navigate(\`/orders/${order.orderId}\`)`.
- `frontend/src/pages/OrderDetails.tsx`: unified missing/unauthorized guest and customer outcomes through `ResourceNotFound`; added authenticated/guest back targets, status header, lifecycle UI, cancellation state, item media, image fallback, and accessible current-step semantics.
- `frontend/src/pages/OrderDetails.css`: replaced the basic detail layout with the responsive branded header, progress rail, cancellation panel, image-led item cards, sticky desktop summary, and mobile adaptations.
- `frontend/src/utils/orderProgress.ts`: central source for lifecycle ordering and the `complete`/`current`/`upcoming` state calculation; unknown and cancelled statuses never mark the delivery lifecycle as completed.
- `frontend/src/utils/orderProgress.test.ts`: verifies progress classification for an in-preparation order and the cancelled-order safety behavior.
- `frontend/src/i18n/locales/pt-PT.ts`, `frontend/src/i18n/locales/en-GB.ts`, and `frontend/src/i18n/locales/de-DE.ts`: added the progress section label and accessible lifecycle label.

No backend route, database schema, OpenAPI document, or generated API client changes for this correction. In the multi-tenant branch, retain its tenant-scoped order ownership lookup and return the same 404 presentation for both a missing order and an order outside the authenticated customer's tenant; do not weaken backend authorization to achieve the unified frontend state.

## 8. Animate order-state changes and conditionally mounted interface surfaces

Required order-detail motion:

- Key the current-state badge and progress/cancellation panel by `order.status`, so React remounts only those small surfaces when polling or an action returns a genuinely different status. Ordinary polling responses with the same status must not restart the animation.
- On a state change, animate the status badge with a short scale/fade emphasis, ease the progress panel into place, fill completed connectors from left to right, and briefly emphasize the new current-step icon.
- Keep every connector's neutral grey base permanently visible. Animate a separate green overlay only on completed connectors; never scale or hide the base rail, otherwise future stages appear disconnected.
- Preserve each lifecycle stage's own icon after completion. Completed steps are communicated by the green styling and connector overlay; do not replace their payment, receipt, kitchen, or package icons with a generic check. The delivered stage retains its check because that is its native icon.
- Keep the progress semantics unchanged: `aria-live="polite"` announces the new status, the active list item retains `aria-current="step"`, and cancelled orders animate their dedicated cancellation panel rather than the delivery lifecycle.

Site-wide motion added where conditional UI previously appeared abruptly:

- Route changes keyed by `location.pathname` enter with a subtle opacity/vertical transition. Query-only interactions such as filters and tab selection do not remount the entire page.
- Guest-order cards and the global order tracker animate when asynchronous data first creates them; new tracker rows enter independently, while existing rows and their progress widths retain normal CSS transitions.
- Custom select menus, the navbar account menu, navigation backdrop, confirmation backdrop, cart backdrop, product customization modal, Profile order modal, administrative modals, administrative detail drawers, and selected admin popovers now have short entrance transitions appropriate to their direction.
- Do not add JavaScript timers for presentation. These are mount/state-driven CSS animations and must remain non-blocking.
- Preserve the global accessibility override in `frontend/src/styles/GlobalStyles.ts`: its `prefers-reduced-motion: reduce` rules shorten every animation and transition to effectively instant behavior.

Files changed:

- `frontend/src/App.tsx` and `frontend/src/App.css`: route-stage wrapper keyed only by pathname and the shared page-entry animation.
- `frontend/src/pages/OrderDetails.tsx` and `frontend/src/pages/OrderDetails.css`: state-keyed badge/panel, live announcement, progress connector fill, current-step emphasis, and cancellation-panel transition.
- `frontend/src/components/OrderStatusBar.css` and `frontend/src/pages/GuestOrders.css`: smooth asynchronous entry for the global tracker, individual tracked orders, its compact state, and guest order cards.
- `frontend/src/components/Navbar.tsx`: styled-component keyframes for the account popover and responsive navigation backdrop; the existing mobile drawer animation remains intact.
- `frontend/src/components/ui/CustomSelect.css` and `frontend/src/components/ui/ConfirmDialog.css`: select-menu scale/fade and confirmation-backdrop fade.
- `frontend/src/components/CustomizeProductModal.css`, `frontend/src/pages/Profile.css`, and `frontend/src/pages/Cart.css`: modal/panel and backdrop entry transitions.
- `frontend/src/pages/AdminDashboard.css`: shared backdrop, right-drawer, centred-modal, and popover entrance animations for administrative conditional surfaces.

No API, authorization, storage, database, OpenAPI, or generated-client behavior changed. Port the same selectors into the multi-tenant frontend after checking whether tenant-specific components use different class names; reuse the timing and reduced-motion behavior instead of copying selectors that do not exist there.

## 9. Translate administrative enum labels and standardize Counter filters

Required behavior:

- Keep backend/OpenAPI enum values unchanged (`counter`, `card`, `mbway`, `paid`, `unpaid`, `owner`, `manager`, `waiter`, and `chef`). Translate only their visible labels at the presentation boundary so requests, filtering, authorization, and stored role values remain stable.
- Centralize the visible payment-method, payment-status, and administrative-role labels. Known values use the `admin` namespace; an unknown future enum remains readable by replacing underscores with spaces instead of rendering an empty label.
- Payment summaries and Management filter options must use the same formatter. In Portuguese, for example, `counter`, `paid`, and `unpaid` render as `Balcão`, `Pago`, and `Por pagar`; equivalent English and German labels come from their locale resources.
- Role selectors, the Team role filter, and role badges in the Team table must render translated labels. In Portuguese the visible hierarchy is `Proprietário`, `Gerente`, `Empregado de mesa`, and `Cozinheiro`; the underlying values remain the English API enums.
- Replace the native status and payment-method `<select>` elements in the Counter view with the shared `CustomSelect` used by Management. Preserve the existing filter state, option values, filtering behavior, labels, keyboard interaction, portal positioning, and `ad-select` styling.

Files changed:

- `frontend/src/utils/adminEnumLabels.ts`: canonical list of staff roles plus formatters for payment method, payment status, and role labels with safe fallback behavior.
- `frontend/src/utils/adminEnumLabels.test.ts`: Portuguese payment translations, German role translations, and unknown-enum fallback coverage.
- `frontend/src/components/admin-orders/orderUtils.ts`: payment summaries now compose the centralized translated method/status labels while retaining the special unpaid-counter message.
- `frontend/src/components/admin-orders/StaffOrdersBoard.tsx`: Counter status and payment filters migrated from native selects to `CustomSelect`; payment method options are translated.
- `frontend/src/components/admin-orders/SuperAdminOrdersView.tsx`: Management payment method and payment status options now use the shared formatters instead of raw API values.
- `frontend/src/pages/AdminDashboard.tsx`: subscribes directly to admin-language changes, builds translated role options for create/edit/filter controls, and formats role badges in the Team table.
- `frontend/src/i18n/locales/pt-PT.ts`, `frontend/src/i18n/locales/en-GB.ts`, and `frontend/src/i18n/locales/de-DE.ts`: added the explicit role dictionary plus `mbway` and `unpaid` administrative payment labels.

No backend, schema, OpenAPI, or generated-client change is required. When porting to multi-tenant, reuse the presentation helpers and keep tenant roles/permissions represented by their existing canonical enum values; add tenant-specific roles to the label map instead of renaming values in API payloads.

## 10. Correct the order-filter and authentication-page layout regressions

Required behavior:

- Align the Management view's “Clear all filters” action with the bottom edge of the search, status, payment, and date controls. The button remains the final item in the responsive filter grid and keeps its existing action, styling, and mobile full-width behavior.
- Stack every route component's top-level children vertically inside the animated route stage. This is required for authentication pages such as Login that return their page container and `Footer` as sibling elements: the footer must render below the authentication content, never as a second horizontal column beside it.
- Keep the shared route-entry animation and route-stage width/flex behavior unchanged; the fix only defines the missing main-axis direction.

Files changed:

- `frontend/src/pages/AdminDashboard.css`: changed `.ad-order-clear` from start alignment to end alignment so its 36 px button baseline matches the compact Management filter controls.
- `frontend/src/App.css`: added `flex-direction: column` to `.app-route-stage`, preventing fragment siblings such as an authentication page and its footer from being laid out side by side.

No backend, API contract, authorization, data, OpenAPI, or generated-client behavior changed. When porting to multi-tenant, apply the route-stage direction fix wherever the animated route wrapper is shared; then apply the filter-action alignment to the equivalent Management order-filter class, even if that branch names the selector differently.

## 11. Align Counter filters and add per-column order collapsing

Required behavior:

- In both Counter and Management order views, render every filter input, shared select trigger, and “Clear all filters” action with the same 40 px control height and align the controls to the bottom of their filter-grid cells. This corrects the remaining mismatch introduced by combining the compact 36 px admin-button rule with the shared 40 px `CustomSelect` trigger.
- Keep the global “Collapse all / Expand all” action, and add a small vertical chevron control beside the count in every Counter column: awaiting payment, kitchen/in preparation, ready for delivery, completed today, and cancelled.
- A column control collapses the complete vertical body of that status column, leaving only its title, count, and downward expansion chevron visible. Expanding restores the full list with every card retaining its previous individual expanded/collapsed state. Empty-column controls remain disabled.
- Keep column visibility in a dedicated `collapsedColumnIds` set instead of adding every contained order to `collapsedOrderIds`. This prevents a column toggle from mutating individual card preferences or the existing global card action. The column body closes with a grid-row/opacity transition, is hidden from accessibility and pointer interaction while closed, and respects the global reduced-motion rule.
- Column controls expose translated accessible labels and `aria-expanded` state by composing the existing “Collapse all / Expand all” text with the translated column title.
- Apply the same complete-column collapse controls to all Kitchen columns: queued, in preparation, and ready.
- Align Kanban grid items to the start of their grid row. Without this, CSS Grid stretches a collapsed column to the height of the tallest neighbouring column, leaving a large empty panel; the previously isolated Cancelled column appeared correct only because it occupied a row by itself.
- Animate complete-column bodies, individual Counter card details, chevron rotation, and cards entering after a filter or status change. Closed content becomes non-visible and non-interactive after its transition, while the existing global reduced-motion rule reduces every new transition/animation to effectively instantaneous behavior.

Files changed:

- `frontend/src/components/admin-orders/StaffOrdersBoard.tsx`: added independent column visibility state and rendered the accessible up/down control beside each order count without changing individual card state.
- `frontend/src/components/admin-orders/KitchenOrdersBoard.tsx`: added the same independent, accessible complete-column collapsing to the three Kitchen workflow columns.
- `frontend/src/components/admin-orders/SuperAdminOrdersView.tsx`: identifies the Management filter surface with `management-order-filters` so its dimensions can be corrected without changing unrelated compact admin toolbars.
- `frontend/src/pages/AdminDashboard.css`: standardized Counter and Management filter height/alignment, with compact Management clear-action typography that fits its eighth grid track; stopped Kanban columns stretching vertically, and added animated column bodies, card details, chevrons, and card entry plus hover, keyboard focus, hidden, and disabled states.

No backend, API contract, authorization, storage, OpenAPI, generated client, or new translation key is involved. When porting to multi-tenant, copy the separate `collapsedColumnIds` behavior into the equivalent Counter board so closing a column never rewrites per-order state; apply the explicit Management filter class and 40 px override after that branch's compact-filter rules.

## 12. Default order dates to today, isolate Cancelled, and normalize collapsed columns

Required behavior:

- Initialize both `dateFrom` and `dateTo` with the browser's local calendar date whenever Counter or Management mounts. Build `YYYY-MM-DD` from local date parts rather than `toISOString()` so late-night users do not receive the adjacent UTC day. “Clear all filters” still clears both fields instead of restoring the initial date.
- Keep only the four operational Counter columns in the default/operational tabs: awaiting payment, kitchen/in preparation, ready for delivery, and completed today. Remove Cancelled from the grid underneath these columns and show it as the sole, full-width column when the existing Cancelled quick-filter tab is active.
- Selecting `cancelled` in the Counter status selector must activate the same isolated Cancelled view; choosing another status while that tab is active returns to the operational view. Global card collapsing derives IDs only from columns currently displayed, so hidden cancelled orders are never changed by an operational action.
- Give a collapsed Counter or Kitchen column the same final body height and spacing as an empty column. Replace the empty-state sentence with a translated plural summary such as `3 pedidos em “Em preparação”`, while retaining the header, count, and downward chevron.
- Keep the list and collapsed summary mounted as opposing animated grid rows. This provides a smooth height/cross-fade transition without leaving a stretched blank panel. Clicking anywhere in the collapsed column's non-interactive interior expands it; clicking its chevron continues to work once and interactive descendants never trigger the container handler.

Files changed:

- `frontend/src/components/admin-orders/orderUtils.ts`: added `localDateInputValue`, a local-time-safe formatter for native date inputs.
- `frontend/src/components/admin-orders/orderUtils.test.ts`: verifies local date formatting and zero padding without UTC conversion.
- `frontend/src/components/admin-orders/StaffOrdersBoard.tsx`: separates initial/empty filter values, initializes today's range, isolates the Cancelled column, scopes global card IDs to displayed columns, and adds the clickable animated collapsed summary.
- `frontend/src/components/admin-orders/SuperAdminOrdersView.tsx`: initializes the Management date range to today while preserving a genuinely empty clear-filter action.
- `frontend/src/components/admin-orders/KitchenOrdersBoard.tsx`: adds the same translated, clickable collapsed summary to Kitchen columns.
- `frontend/src/pages/AdminDashboard.css`: adds the one-column Cancelled layout and opposing list/summary transitions; explicit `is-empty`/`is-collapsed` column states share the same 180 px minimum height so both states finish with identical geometry instead of relying on incidental grid-row height. The animated, overflow-clipped list reserves 2 px on the right so Counter and Kitchen card borders/shadows remain fully inside the clipping boundary.
- `frontend/src/i18n/locales/pt-PT.ts`, `frontend/src/i18n/locales/en-GB.ts`, and `frontend/src/i18n/locales/de-DE.ts`: add singular/plural `collapsedColumnSummary` messages.

No backend query, API contract, authorization, storage, OpenAPI, or generated-client behavior changed. When porting to multi-tenant, preserve tenant filtering before frontend grouping, use the same local-date helper rather than UTC serialization, and ensure the isolated Cancelled tab can never expose cancelled orders belonging to another tenant.

## Multi-tenant port verification checklist

1. Reapply backend behavior while preserving tenant ownership filters on every order lookup and list.
2. Run the complete backend suite and explicitly test cross-tenant denial in addition to the role/transition cases above.
3. Export the target branch OpenAPI document, regenerate the frontend client, and review the generated diff.
4. Reapply the frontend routing, role helpers, selector, board actions, catalog capability gates, translations, access matrix, and favicon integration using the files listed above as references.
5. Test direct canonical URLs and all three legacy redirects for every role, including invalid and unauthorized query values.
6. Run frontend tests, lint, and production build before marking the branches synchronized.
7. Create at least two guest orders in one browser, verify both tokens survive, then log in/register and confirm both orders move into the same tenant-scoped customer history while the local secrets and server hashes are removed.
8. From Profile, open an active order and confirm the URL becomes `/orders/{order_id}`; then verify that nonexistent, cross-customer, cross-tenant, missing-token, and expired-token detail URLs all render the identical branded order 404 without exposing order existence.
9. Advance one order through every operational state while its detail page is open, confirm each animation runs once per actual status change, and repeat with reduced motion enabled. Open the navbar menus, selects, modals, cart, Profile details, and admin drawers to verify their entrance motion does not move focus or block interaction.
10. Switch the admin interface among Portuguese, English, and German and verify Counter/Management payment filters plus every Team role selector/badge. Inspect network requests to confirm translated labels never replace the canonical enum values sent to the API.
11. Open Login, registration, and password-recovery routes at desktop and mobile widths and verify their footers remain below the page content. In Management, verify the clear-filter button shares the lower baseline of the adjacent controls and still becomes a usable full-width grid item on narrow screens.
12. In Counter and Management, compare the exact height and baseline of every filter control. In Counter, combine individual-card, complete-column, and global card collapse controls; verify that a closed column leaves only its header visible without a stretched blank panel, restores prior card states when reopened, is absent from keyboard navigation while closed, and exposes a disabled control when empty. Repeat complete-column collapse in all three Kitchen columns, then move orders between columns and verify smooth card entry with both normal and reduced-motion settings.
13. Open Counter and Management around a known local date and confirm both ends of the initial interval equal today while clearing produces blank fields. Verify the operational Counter grid never includes Cancelled, its quick-filter/status selection opens a single Cancelled column, and global collapse does not affect hidden orders. Compare empty and collapsed column heights, validate singular/plural summaries in all three languages, and expand a collapsed Counter/Kitchen column by clicking both its chevron and summary interior.


# Changes in multi-tenant branch
Changes made in the multi-tenant that are not present in the single-tenant branch are listed below:
