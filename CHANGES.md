
# Changes in single-tenant branch
Changes made in the single-tenant that are not present in the multi-tenant branch are listed below:

- Removed the guest-browser expiry/account-linking notice from the order details frontend, including its translations and unused styles.
- Allowed owners to change an order to any valid status from the owner dashboard, independently of payment status; operational payment restrictions remain in place for managers and chefs.
- Kept administrative cancellation metadata consistent when an order is cancelled or restored to another status.
- Added an owner-only API endpoint that permanently deletes an order only after it has been cancelled.
- Added a confirmed "Delete" action for cancelled orders in both owner order dashboard layouts.
- Regenerated the OpenAPI document and generated frontend API client for the cancelled-order deletion endpoint.
- Added backend coverage for unrestricted owner status changes, manager payment restrictions, cancelled-order deletion rules, authorization, and related-record cleanup.


# Changes in multi-tenant branch
Changes made in the multi-tenant that are not present in the single-tenant branch are listed below:
