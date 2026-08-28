
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

## 2. Give owners unrestricted status control and allow deletion of cancelled orders

Required backend behavior:

- An `owner` may change an order to any valid `OrderState`, even when the payment is still unpaid. The `payment_required` and operational transition checks must continue to apply to non-owner roles.
- When an administrator changes an order to `cancelled`, set `canceled_at` if it is not already set and set `cancellation_origin` to `ADMIN`.
- When restoring an order from `cancelled` to another state, clear `canceled_at` and `cancellation_origin`.
- Add `DELETE /admin/orders/{order_id}` with operation ID `admin_management_delete_cancelled_order`, `MessageResponse`, and exact `Depends(require_role(SUPER_ADMIN_ROLE))` protection (`SUPER_ADMIN_ROLE` maps to the owner role in this branch).
- The delete endpoint must return `409 order_must_be_cancelled` unless the loaded order is already cancelled. If eligible, delete the loaded ORM entity with `db.delete(order)` and commit once so configured relationships/cascades clean up associated records.

Backend files:

- `backend/routers/admin.py`: owner bypass in `_ensure_order_status_allowed`, cancellation metadata maintenance in `update_order_status`, and the owner-only cancelled-order delete route.
- `backend/tests/test_endpoint_smoke.py`: coverage for arbitrary owner transitions, retained manager payment restrictions, cancellation metadata, authorization, active-order deletion rejection, successful cancelled-order deletion, and cleanup of related rows.

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
| Manager | Full actions | Full actions | No access | Counter |
| Chef | No access | Full preparation actions | No access | Kitchen |
| Waiter | Payment, eligible cancellation, and ready-order handoff actions | Visible without preparation actions | No access | Counter |

Required order workflow and authorization:

- Counter payment confirmation marks the order paid and moves it directly to `confirmed`; the UI immediately reports `Pagamento confirmado; pedido enviado para a cozinha.` and the card moves to the kitchen-progress column. There is no second `Enviar para a cozinha` action.
- Waiters may list Counter orders, list/read Kitchen orders, confirm counter payments, change `ready -> delivered` only for paid orders, and cancel only orders allowed by the existing unpaid-cancellation rules.
- Direct waiter attempts to set `confirmed`, `in_preparation`, or `ready` must return `403 permission_denied`; early/unpaid handoff and paid cancellation must keep returning the relevant `409` transition errors.
- Owners remain unrestricted. Managers retain operational Counter/Kitchen actions. Chefs remain limited to kitchen-visible orders and kitchen preparation states.
- The active view chooses its own endpoint: Management uses the management order list, Counter uses the staff/service list, and Kitchen uses the kitchen list. Initial load, polling, window focus, visibility refresh, manual refresh, and stale-request protection must all follow the current URL view.

Backend files:

- `backend/services/auth_service.py`: added the shared `WAITER_ROLE` constant used by route dependencies and transition checks.
- `backend/routers/admin.py`: allowed waiters on the staff/service list, kitchen list/detail, counter-payment, and generic status endpoints; added waiter-specific allowed states and transition validation without broadening chef/manager permissions.
- `backend/tests/test_endpoint_smoke.py`: added the full waiter flow and rejection matrix, including Management denial, Kitchen read-only API behavior, automatic payment handoff, invalid preparation transitions, early delivery, paid cancellation, and chef restrictions.

Frontend routing and role helpers:

- `frontend/src/App.tsx`: canonical dashboard route for all four roles plus compatibility redirects for `/admin/super`, `/admin/staff`, and `/admin/kitchen`.
- `frontend/src/pages/AdminLogin.tsx`: role-based post-login navigation now targets the unified console.
- `frontend/src/utils/adminOrderViews.ts`: defines `AdminOrderView`, the role/view matrix, role defaults, unauthorized-view fallback, kitchen action capability, and canonical dashboard entry paths.
- `frontend/src/utils/adminOrderViews.test.ts`: tests every role's available views, defaults, entry paths, kitchen read-only capability, and invalid/unauthorized URL fallback.

Frontend console and boards:

- `frontend/src/pages/AdminDashboard.tsx`: removed the separate `experience` prop; derives tabs and order views from role plus URL; loads the endpoint for the active view; protects against stale requests; keeps polling/focus refresh view-aware; wires payment, status, and delete actions into the appropriate board.
- `frontend/src/components/admin-orders/OrderViewSwitcher.tsx`: top-of-Orders mode selector with `Store`, `ChefHat`, and `ClipboardList` icons; only authorized modes are rendered and the current mode uses `role="tab"`/`aria-selected`.
- `frontend/src/pages/AdminDashboard.css`: prominent but neutral, non-gradient selector layout; responsive equal-width mode buttons; clear hover, focus, and selected states without a visible read-only badge.
- `frontend/src/components/admin-orders/StaffOrdersBoard.tsx`: removed the unreachable `pending + paid` send-to-kitchen button; retains payment confirmation and ready handoff; adds cancellation for eligible unpaid/non-final orders.
- `frontend/src/components/admin-orders/KitchenOrdersBoard.tsx`: accepts `readOnly`; waiter still sees orders, ages, articles, notes, and details, but preparation buttons are not rendered.
- `frontend/src/i18n/locales/pt-PT.ts`, `frontend/src/i18n/locales/en-GB.ts`, `frontend/src/i18n/locales/de-DE.ts`: mode-selector copy and revised Counter terminology; removed the obsolete send-to-kitchen and visible read-only labels.

Brand/browser integration included with the console refinement:

- `frontend/index.html`: replaced the nonexistent `/favicon.svg` reference with `/assets/images/bonefree-logo.png` for both `rel="icon"` and `rel="apple-touch-icon"`.
- `frontend/public/assets/images/bonefree-logo.png`: existing 512 x 512 transparent Bonefree logo used by those links; the asset itself was not modified.

No migration or response-shape change was required for the console consolidation. The OpenAPI export and generated client were checked after the authorization-only backend edits and produced no additional contract diff.

## Multi-tenant port verification checklist

1. Reapply backend behavior while preserving tenant ownership filters on every order lookup and list.
2. Run the complete backend suite and explicitly test cross-tenant denial in addition to the role/transition cases above.
3. Export the target branch OpenAPI document, regenerate the frontend client, and review the generated diff.
4. Reapply the frontend routing, role helpers, selector, board actions, translations, and favicon integration using the files listed above as references.
5. Test direct canonical URLs and all three legacy redirects for every role, including invalid and unauthorized query values.
6. Run frontend tests, lint, and production build before marking the branches synchronized.


# Changes in multi-tenant branch
Changes made in the multi-tenant that are not present in the single-tenant branch are listed below:
