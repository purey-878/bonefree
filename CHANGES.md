
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

## Multi-tenant port verification checklist

1. Reapply backend behavior while preserving tenant ownership filters on every order lookup and list.
2. Run the complete backend suite and explicitly test cross-tenant denial in addition to the role/transition cases above.
3. Export the target branch OpenAPI document, regenerate the frontend client, and review the generated diff.
4. Reapply the frontend routing, role helpers, selector, board actions, catalog capability gates, translations, access matrix, and favicon integration using the files listed above as references.
5. Test direct canonical URLs and all three legacy redirects for every role, including invalid and unauthorized query values.
6. Run frontend tests, lint, and production build before marking the branches synchronized.


# Changes in multi-tenant branch
Changes made in the multi-tenant that are not present in the single-tenant branch are listed below:
