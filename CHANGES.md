
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

## 13. Restore ingredient-card visibility and blur the complete admin modal background

Final-state note: section 15 supersedes the linked-product popover described below with a dedicated modal. Keep this section as the record of the original overlap cause, but implement section 15 when synchronizing the current interface.

Required behavior:

- Keep each ingredient's linked-product popover hidden until its own trigger is hovered or focused. The popover remains in the DOM to preserve hover/focus continuity, so it must use its existing opacity/pointer-event transition rather than the shared mount animation used by conditionally rendered popovers.
- Remove `.ad-ingredient-products-popover` from the unconditional `ad-surface-popover-in` animation. That animation's `both` fill mode permanently applied its final `opacity: 1`, causing every ingredient's product list to cover neighbouring ingredient cards immediately after the global motion pass.
- Place product and ingredient modal backdrops above the sticky admin topbar (`z-index: 1130`) and place the modal itself above that backdrop. The topbar, sidebar, and page content must therefore share one continuous dimmed/blurred background instead of leaving a sharp, unaffected header strip.
- Animate the modal backdrop from zero blur/opacity to a 6 px saturated blur over 220 ms. Keep drawer backdrops on the existing opacity-only animation and continue honoring the global reduced-motion rule.

File changed:

- `frontend/src/pages/AdminDashboard.css`: restored linked-product popover visibility control, raised modal backdrop/modal stacking to `1300`/`1310`, and added the dedicated blur-entry keyframes.

No React behavior, backend, API contract, authorization, storage, OpenAPI, or generated-client code changed. When porting to multi-tenant, compare the target topbar/sidebar z-indexes before copying the exact values; the required invariant is `page chrome < modal backdrop < modal`, and persistent hover popovers must never receive an animation that fills to visible while idle.

## 14. Paginate every growing collection with server-side filters and URL state

Required behavior and shared contract:

- Replace bare arrays on growing collection endpoints with the typed envelope `{ items, page, per_page, total, total_pages }`. The API defaults to `page=1` and `per_page=20`, accepts `1 <= per_page <= 100`, and the interface offers 10, 20, 50, and 100. Empty collections remain on page 1; if a mutation or filter leaves the selected page beyond the last page, the interface corrects it to the last available page.
- Count the filtered result set before applying `offset`/`limit`, keep ordering deterministic with an ID tie-breaker, and perform search, filters, summaries, and facets in SQL. Do not restore client-side slicing over an already incomplete page.
- Paginate `GET /products/`, `GET /products/{product_id}/reviews`, `GET /profile/orders`, `GET /checkout/orders/history`, `GET /checkout/coupons`, `GET /admin/products`, `GET /admin/ingredients`, `GET /admin/categories`, `GET /admin/orders`, `GET /admin/customers`, and `GET /admin/staff`.
- Add owner-only `GET /admin/reviews` so the review directory is one paginated, filtered query instead of one product request plus N review requests. Add all-staff `GET /admin/ingredients/{ingredient_id}/products` for paginated, on-demand ingredient relationships. Add customer-only `GET /profile/overview` for database-calculated historical order totals, average, latest order, favorites, and loyalty progress.
- Keep `GET /admin/staff/orders` and `GET /admin/kitchen/orders` as complete operational arrays and remove their previous artificial limits. Counter and Kitchen remain live boards without result pagination.
- Public product pages support server-side search, category, visible promotional-price bounds, special filters, sort, and optional ID lookup. Their response also carries catalog-wide product count, maximum visible price, and category counts so Menu and Home never need a full catalog download for facets.
- Review filters (rating/text), order filters (search/status/payment/date/personalization), and administrative directory filters (search/status/role/type and each existing selector) execute before count and pagination. Category rows carry the active-product count, ingredient rows carry the linked-product count, and Management-order/review responses carry summaries over the complete filtered result rather than only the visible page.
- Active and archived products are two independently paginated queries. Do not fetch archived products until that section is expanded. Auxiliary form selectors intentionally walk all pages through service helpers because they are not result lists.

Frontend behavior:

- Use the shared `Pagination` component with `storefront` and `admin` variants. It renders the controlled `CustomSelect` instead of a native HTML `<select>` for page size, with variant-specific storefront/admin styling, keyboard support, outside-click dismissal, an animated chevron, and animated menu entry and exit. It also renders the visible range/total, previous/next arrows, numeric pages, ellipses, and a clamped manual page field with an “Ir/Go/Los” action that submits on Enter. The token sequence always includes the first three pages, last two pages, and current-page neighbors.
- Hide pagination completely for an empty collection. When all results fit on one page, render only the localized result range/count and omit the page-size selector, arrows, page number, ellipses, and manual “Ir” field; render the complete control set only when `total_pages > 1`. This rule lives in the shared component and therefore applies equally to storefront, profile, guest, related-product, and administrative collections.
- Treat the URL as the source of truth, including browser back/forward navigation. Menu, product reviews, Profile orders/coupons, guest orders, and every administrative result tab read and write page, page size, sort, and filters without discarding unrelated `tab`/`view` values. Filtering or changing page size returns that collection to page 1. Search inputs are debounced and stale responses cannot replace a newer request.
- Preserve the current scroll position when only query parameters change. Pagination buttons, the manual “Ir” action, page-size selectors, filters, sort controls, and administrative view/tab state update the URL in place without the global route handler scrolling to the top; actual pathname or hash navigation keeps the existing top/anchor behavior.
- Guest orders are sorted from locally stored metadata, then only tokens for the visible page are requested. Invalid/expired tokens are removed individually and later valid entries refill the page; one failed token cannot discard the other orders.
- Menu, product reviews, Profile, guest orders, Products, archived Products, Ingredients, Categories, Reviews, Customers, Team, and Management orders show pagination. Cart contents, order line items, Home highlights, Counter, and Kitchen intentionally do not.
- Avoid unrelated complete loads: Home/Menu highlights and checkout upsells request bounded pages, cart lookups request explicit IDs, Profile uses `/profile/overview`, and tracking helpers explicitly walk paginated history only where the complete active-order set is operationally required.

Backend files changed:

- `backend/schemas/pagination.py`: generic `PaginatedResponse[T]` and the shared total-page calculation.
- `backend/schemas/product.py`, `backend/schemas/review.py`, `backend/schemas/checkout.py`, and `backend/schemas/admin.py`: paginated envelopes, product facets, administrative counts/summaries, ingredient-product response, and profile-overview models.
- `backend/routers/products.py`: public product filtering/facets/pagination and deterministic ordering.
- `backend/routers/reviews.py`: paginated product reviews and the owner review directory with filtered summary.
- `backend/routers/profile.py`: paginated customer orders plus aggregate overview queries.
- `backend/routers/checkout.py`: paginated authenticated history/coupons while preserving guest detail behavior.
- `backend/routers/admin.py`: paginated administrative directories and Management orders, related ingredient products, filtered summaries/counts, and unlimited operational Counter/Kitchen queries.
- `backend/tests/test_endpoint_smoke.py`: envelope, permissions, empty/out-of-range pages, `per_page` validation, related-product/overview endpoints, and unchanged operational-array coverage.
- `backend/tests/test_sqlalchemy2_behavior.py`: updated bounded-query expectations for the new count/facet queries.

Frontend files changed:

- `frontend/src/types/pagination.ts`, `frontend/src/components/ui/Pagination.tsx`, `frontend/src/components/ui/Pagination.css`, `frontend/src/components/ui/paginationRange.ts`, `frontend/src/components/ui/Pagination.test.ts`, and `frontend/src/components/ui/index.ts`: shared types, component, modern per-page dropdown in two visual variants, page-token algorithm, exports, and tests.
- `frontend/src/components/ui/CustomSelect.tsx` and `CustomSelect.css`: optional compact portal-menu width and delayed animated closing used by both pagination variants; existing administrative selects inherit the same smoother close behavior.
- `frontend/src/services/productService.ts`, `frontend/src/services/checkoutService.ts`, `frontend/src/services/authService.ts`, `frontend/src/services/adminService.ts`, and `frontend/src/services/cartService.ts`: consume envelopes, pass server filters, provide explicit all-page helpers only for auxiliary/operational consumers, and expose the three new endpoints.
- `frontend/src/types/product.ts` and `frontend/src/types/admin.ts`: facet/count/summary types consumed outside generated models.
- `frontend/src/pages/Menu.tsx`, `frontend/src/pages/ProductDetail.tsx`, `frontend/src/pages/Profile.tsx`, `frontend/src/pages/GuestOrders.tsx`, and `frontend/src/pages/AdminDashboard.tsx`: per-collection pagination, URL hydration/write-back, page correction, debounced requests, independent archived products, on-demand ingredient relationships, and use of global summaries/facets.
- `frontend/src/App.tsx`: limits automatic top scrolling to pathname/hash navigation so query-only pagination and filtering remain at the user's current viewport.
- `frontend/src/pages/AdminDashboard.tsx`: makes the query string the single source of truth for sidebar navigation. Sidebar clicks now update `tab`/`view` first and URL hydration selects the panel; the post-auth canonicalization effect no longer reacts to the transient local tab update and therefore cannot reset a valid click to the owner dashboard. Preserve this URL-first ordering when porting pagination to the multi-tenant console, or sidebar links can appear to navigate and immediately bounce back to `/admin/dashboard`.
- `frontend/src/components/orderStatusStorage.ts` and `frontend/src/components/orderStatusStorage.test.ts`: preserve optional guest-order creation timestamps without breaking legacy records, allowing `/orders` to sort local accesses before requesting only the selected page.
- `frontend/src/components/admin-orders/SuperAdminOrdersView.tsx`: server-controlled Management filters, page controls, and global filtered summary. Administrative paginator layout lives in the shared `Pagination.css`; the pre-existing `frontend/src/pages/AdminDashboard.css` changes remain exclusively the ingredient-popover/modal corrections documented in section 13 and were not overwritten by this work.
- `frontend/src/pages/Home.tsx`, `frontend/src/components/MenuSection.tsx`, `frontend/src/pages/Checkout.tsx`, `frontend/src/components/OrderStatusBar.tsx`, and the cart service: replace accidental full-catalog/history requests with bounded, ID-based, or deliberate all-page operational calls.
- `frontend/src/i18n/locales/pt-PT.ts`, `frontend/src/i18n/locales/en-GB.ts`, and `frontend/src/i18n/locales/de-DE.ts`: pagination labels, page ranges, page-size text, navigation labels, and manual-page actions.
- `frontend/openapi/openapi.json` and `frontend/src/api/generated/{index.ts,sdk.gen.ts,types.gen.ts}`: regenerated from the FastAPI source after the intentional list-contract changes. Never port these files by hand; regenerate them in the target branch.

Multi-tenant synchronization notes:

- Apply the tenant predicate to both the page query and every companion count, facet, aggregate, summary, related-product, and auxiliary all-page query. A correct `items` query with an unscoped `total`, price maximum, category count, review summary, ingredient relationship, or profile overview still leaks cross-tenant information.
- Preserve tenant scoping on the non-paginated Counter/Kitchen endpoints before removing limits. The absence of pagination is deliberate only for the current tenant's operational working set.
- Keep the target branch's tenant-aware product URL/media mapping and ownership joins when transferring the pagination helpers. No migration is required.
- Verification completed here: FastAPI OpenAPI/client generation succeeded; all 135 backend tests passed with one skipped; all 54 frontend tests passed; ESLint passed; and the production TypeScript/Vite build passed (the existing large-chunk advisory remains non-fatal).

## 15. Present ingredient-related products in a dedicated responsive modal

Required behavior:

- Clicking the product count on an ingredient card opens a centred administrative modal instead of inserting a paginated popover inside the narrow ingredient card. The ingredient grid must keep its original dimensions and no related-product content may be clipped by, overlap, or resize neighbouring cards.
- Open the modal immediately in a loading state, retain the existing result page while another page is loading, and never reopen a modal that the user closed while its request was still in flight. Backdrop, close-button, and Escape-key actions dismiss it; selecting a related product closes it before navigating to the Products tab and opening that product's analytical detail.
- Show the ingredient name and global relationship count in the header. Render related products as responsive cards with display ID, name, category display ID, price, activity/availability state, and a clear hover/focus treatment. Use two columns when space permits and one column on narrow viewports.
- Keep related-product pagination server-driven through `GET /admin/ingredients/{ingredient_id}/products`. For multiple pages, the shared admin paginator is stacked beneath the modal list so its summary, page buttons, page-size selector, and manual page field are never compressed into the ingredient-card width; for one page, only the result count is shown.
- Reuse the existing administrative modal backdrop, blur, entry animation, colour variables, dark theme, and reduced-motion behavior. No backend contract, authorization, generated client, or migration changes are required.

Files changed:

- `frontend/src/pages/AdminDashboard.tsx`: moves related-product rendering out of each ingredient card, adds race-safe modal loading state, preserves per-ingredient paginated results, and closes the modal before product navigation.
- `frontend/src/pages/AdminDashboard.css`: adds the responsive modal, product-card grid, empty/loading states, compact stacked paginator layout, and light/dark theme-compatible interaction styling.

For the multi-tenant port, retain the target branch's tenant-scoped related-product endpoint and product identifiers/media conventions. Copy the modal behavior and styles, but do not replace the tenant predicate or fetch all related products locally.

## 16. Refine administrative product cards, actions, and analytics presentation

Required behavior:

- Active product cards use a clean semantic surface behind transparent product images. Remove the former grey/dark gradients, overlay veil, image opacity reduction, white title, and heavy title shadow; keep the ID fixed at the upper-left and the three-dot action at the upper-right, raise and constrain the image to its own area, and reserve a separate lower area for up to two title lines so image and text never overlap in either admin theme.
- Replace the active-card native `<details>` action menu with controlled React state. Only one menu may be open; pointer interaction outside it, Escape, tab navigation, opening analytics, deletion, or opening another menu closes it. Keep the menu mounted but inert/hidden while closed so opacity/scale/translation transitions animate both entrance and exit. The three-dot trigger and menu rows use theme-tinted hover/focus states instead of turning solid white.
- Product analytics share one content component with desktop `drawer` and `modal` presentations. Store the last desktop preference under `admin_product_analytics_view_mode`; accept only `drawer`/`modal` and default invalid or missing values to `drawer`. Switching presentation retains the selected product, range, and loaded response and must not issue a new analytics request.
- The desktop drawer has no backdrop and does not lock document scrolling. It owns only the fixed right-hand region, has independent scrolling, and is visually separated by its semantic surface, the same subtle one-pixel border used elsewhere in the console, and a soft lateral shadow; products and controls outside it remain interactive. The modal uses a full-shell blurred backdrop above the topbar/sidebar, locks background scrolling, and closes through its button, Escape, or backdrop.
- At `max-width: 760px`, resolve either stored desktop preference to one presentation that fills only the administrative content area below the persistent topbar, without rewriting storage or covering/blurring the mobile header. Put a borderless, heavier close icon in its own toolbar above the product image; let the image span the same content width as the metrics below. Hide the desktop view toggle because both desktop modes converge on this mobile presentation.
- Animate drawer, modal, full-screen panel, and modal backdrop on entrance and exit, delaying data-panel unmount until the panel's own exit animation completes. Ignore descendant animation events and honor reduced-motion preferences.
- Increase the product create/edit modal desktop maximum width from 1040 px to 1160 px. Existing tablet and phone width constraints remain authoritative.

Frontend files changed:

- `frontend/src/pages/AdminDashboard.tsx` and `frontend/src/pages/AdminDashboard.css`: controlled action menu, outside/Escape cleanup, dual analytics presentation, blocking/non-blocking behavior, mobile full-screen layout, animations, clean cards, and larger desktop editor.
- `frontend/src/utils/productAnalyticsView.ts` and `frontend/src/utils/productAnalyticsView.test.ts`: preference type, storage key, invalid-value normalization, mobile presentation resolution, and unit coverage.
- `frontend/src/i18n/adminPhrases.ts`: Portuguese, English, and German accessible labels/titles for the analytics view toggle.

No backend, database, OpenAPI, generated client, role capability, or analytics response changed. For the multi-tenant port, keep that branch's tenant-filtered analytics endpoint and product models; port the frontend state/presentation layer only, reuse the same storage key, and reconcile any tenant-console topbar/sidebar z-index differences while preserving `shell < modal backdrop < analytics modal`.

## 17. Reuse one adaptive modal/sidebar surface for administrative editors

Required behavior:

- Use one controlled React `AdaptivePanel` for product analytics and the category, ingredient, customer, and staff create/edit flows. The component owns presentation resolution, the segmented drawer/modal toggle, responsive mobile behavior, Escape handling, backdrop dismissal, background scroll locking, independent drawer scrolling, accessible roles/labels, and delayed unmount after exit animation.
- Desktop drawer mode is non-blocking and keeps the underlying directory interactive. Desktop modal mode renders a blurred full-console backdrop and locks background scrolling. At `max-width: 760px`, both preferences resolve to the content area below the persistent administrative topbar, without hiding or blurring that header or overwriting the saved desktop preference.
- Store the shared category/ingredient/customer/staff editor preference under `admin_editor_view_mode`, accepting only `drawer` or `modal` and falling back to `drawer`. Product analytics retains its existing `admin_product_analytics_view_mode` key while consuming the same adaptive presentation component.
- Category, customer, and staff editors no longer render as inline cards. Ingredient editing no longer owns a separate hard-coded modal implementation. All four editors share the same heading hierarchy, semantic surfaces, subtle drawer border/shadow, modal blur, close paths, entry/exit motion, responsive action layout, and reduced-motion behavior.
- Customer editing exposes the already-supported contact and billing payload fields together: name, surname, email, optional replacement password, phone, status, tax ID, city, postal code, and address. Existing API calls and payload shapes remain unchanged.
- Filter checkboxes and their labels use a pointer cursor when enabled and a not-allowed cursor when disabled. Checkbox dimensions, padding, background, and shadow are explicitly isolated from generic text-input focus rules so selecting a filter cannot produce a tall rectangular outline; keyboard focus is conveyed by the surrounding filter label instead. Conditional panel opening, closing, and presentation changes animate without prematurely unmounting their content.

Frontend files changed:

- `frontend/src/components/admin/AdaptivePanel.tsx` and `AdaptivePanel.css`: reusable controlled adaptive surface, viewport resolution, toggle/close controls, backdrop and scroll policy, event cleanup, animation lifecycle, responsive layout, and reduced-motion support.
- `frontend/src/utils/adaptivePanelMode.ts` and `adaptivePanelMode.test.ts`: shared mode types, invalid-storage normalization, mobile presentation resolution, and unit coverage.
- `frontend/src/pages/AdminDashboard.tsx`: product analytics migration, shared editor preference, animated category/ingredient/customer/staff lifecycles, and complete customer form fields.
- `frontend/src/pages/AdminDashboard.css`: editor-specific widths/headings/actions plus checkbox cursor, focus, and transition states.
- `frontend/src/i18n/adminPhrases.ts`: Portuguese, English, and German accessible labels for editor presentation and close controls.

No backend, migration, OpenAPI, generated-client, or authorization change is required. In the multi-tenant branch, reuse the component and state lifecycle rather than copying the former inline forms; preserve tenant-aware customer/catalog service calls and verify that its topbar height variable keeps the mobile panel below the visible header.

## 18. Make public product queries portable to PostgreSQL

Required behavior and cause:

- The Docker deployment returned `500 Internal Server Error` for `GET /products/`; browsers reported that response as a CORS failure because the unhandled database exception did not include `Access-Control-Allow-Origin`. The configured origins were already correct.
- PostgreSQL does not accept comparisons such as `boolean_column = 1`. Public product filters and the default/popular ordering now express boolean predicates with SQLAlchemy's `.is_(True)`, preserving the existing filtering and ranking while generating native Boolean SQL on PostgreSQL and SQLite.
- Removable-ingredient validation in cart and product customization uses the same portable Boolean predicate, preventing the equivalent runtime failure when loading customization options.

Backend files changed:

- `backend/routers/products.py`: PostgreSQL-safe predicates for gluten-free, alcohol, featured-product ranking, and removable product ingredients.
- `backend/routers/cart.py`: PostgreSQL-safe predicate when loading removable ingredients for cart validation.

No migration, response schema, OpenAPI document, generated client, frontend request, or CORS setting changed. For the multi-tenant port, apply the same predicate replacements inside the tenant-scoped product/catalog and cart queries without removing tenant ownership filters. Validate against PostgreSQL—not only the SQLite test database—and confirm `/products/?sort=popular` returns `200` with the requesting origin in `Access-Control-Allow-Origin`.

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
14. Open Ingredients without activating any product count and confirm no linked-product content covers the grid. Open both product and ingredient editors and verify the blur animates continuously across the admin topbar, sidebar, and content in light/dark themes and with reduced motion enabled.
15. For every paginated endpoint, compare `items`, `total`, `total_pages`, facets, summaries, and related counts against the same tenant-scoped filters. Exercise first/last/empty/out-of-range pages and `per_page` limits; then use back/forward navigation on every paginated frontend surface, independently expand archived products, invalidate one guest token, and confirm Counter/Kitchen still return their complete tenant-scoped operational sets without paginator controls.
16. Click related-product counts on ingredients near every grid edge and confirm the grid remains unchanged while a centred modal opens. Test loading, empty, multi-page, page-size, narrow viewport, dark theme, backdrop/close dismissal, and product-detail navigation; close the modal before a delayed request resolves and confirm it stays closed.
17. Inspect active product cards in light/dark themes, exercise the three-dot menu through pointer and keyboard closure paths, and switch loaded analytics between drawer and modal without another request. Confirm drawer background interaction and independent scrolling, modal blur/scroll lock across topbar/sidebar, remembered desktop preference, mobile full-screen image/close alignment, exit animations with reduced motion, and the 1160 px desktop product editor.
18. Open create and edit flows for categories, ingredients, customers, and staff, alternate each between drawer and modal, and confirm the shared preference survives reload. Test Escape, backdrop, close and Cancel paths, delayed animated unmount, underlying-page interaction in drawer mode, full-console blur/scroll lock in modal mode, persistent mobile topbar, every customer billing field, enabled/disabled filter-checkbox cursors, compact checkbox focus without a text-input outline, dark theme, and reduced motion.
19. Run the public product list and customization/cart queries against PostgreSQL with Boolean filters and both default/popular ordering. Confirm they return `200`, retain tenant scoping in the multi-tenant branch, and expose the expected CORS header instead of masking a database `500` as a browser CORS error.


# Changes in multi-tenant branch
Changes made in the multi-tenant that are not present in the single-tenant branch are listed below:
