from ._shared import *  # noqa: F403 - shared router namespace

@router.get(
    "/orders",
    response_model=List[OrderResponse],
    operation_id="admin_management_list_orders",
    dependencies=ORDERING_FEATURE_DEPENDENCIES,
)
def list_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    orders = db.scalars(
        select(Order)
        .order_by(Order.ordered_at.desc())
        .offset(skip)
        .limit(limit)
    ).unique().all()

    return [_order_response(order) for order in orders]


@router.get(
    "/staff/orders",
    response_model=List[OrderResponse],
    operation_id="admin_management_list_staff_orders",
    dependencies=ORDERING_FEATURE_DEPENDENCIES,
)
def list_staff_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    orders = db.scalars(
        select(Order)
        .where(_staff_order_filter())
        .order_by(Order.ordered_at.asc())
        .offset(skip)
        .limit(limit)
    ).unique().all()

    return [_order_response(order) for order in orders]


@router.get(
    "/kitchen/orders",
    response_model=List[KitchenOrderResponse],
    operation_id="admin_management_list_kitchen_orders",
    dependencies=ORDERING_FEATURE_DEPENDENCIES,
)
def list_kitchen_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_staff: User = Depends(require_organization_role(UserRole.CHEF, UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    orders = db.scalars(
        select(Order)
        .where(
            or_(
                Order.state.in_(KITCHEN_VISIBLE_STATES),
                (
                    (Order.payment_method == PaymentMethod.COUNTER)
                    & (Order.payment_status == PaymentStatus.PAID)
                    & (Order.state.notin_((OrderState.DELIVERED, OrderState.CANCELLED)))
                ),
            )
        )
        .order_by(Order.ordered_at.asc())
        .offset(skip)
        .limit(limit)
    ).unique().all()

    return [_kitchen_order_response(order) for order in orders]


@router.get(
    "/kitchen/orders/{order_id}",
    response_model=KitchenOrderResponse,
    operation_id="admin_management_get_kitchen_order",
    dependencies=ORDERING_FEATURE_DEPENDENCIES,
)
def get_kitchen_order(
    order_id: int,
    current_staff: User = Depends(require_organization_role(UserRole.CHEF, UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    order = _get_order_or_404(db, order_id)
    if not _is_kitchen_visible(order):
        raise AppHTTPException(status_code=404, error="order_not_found", message="Order not found.", details={"reason": "request_failed"})
    return _kitchen_order_response(order)


@router.get(
    "/orders/{order_id}",
    response_model=OrderResponse,
    operation_id="admin_management_get_order",
    dependencies=ORDERING_FEATURE_DEPENDENCIES,
)
def get_order(
    order_id: int,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return _order_response(_get_order_or_404(db, order_id))


@router.patch(
    "/orders/{order_id}/status",
    response_model=OrderResponse,
    operation_id="admin_management_update_order_status",
    dependencies=ORDERING_FEATURE_DEPENDENCIES,
)
def update_order_status(
    order_id: int,
    body: OrderStatusUpdate,
    current_staff: User = Depends(require_organization_role(UserRole.CHEF, UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    order = _get_order_or_404(db, order_id)
    if current_staff.role == UserRole.CHEF and not _is_kitchen_visible(order):
        raise AppHTTPException(status_code=403, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})
    _ensure_order_status_allowed(current_staff, order, body.state)
    order.state = body.state
    order.handled_by_user_id = current_staff.id
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    return _order_response(order)


@router.post(
    "/orders/{order_id}/pay-counter",
    response_model=CounterPaymentResponse,
    operation_id="admin_management_pay_counter_order",
    dependencies=ORDERING_FEATURE_DEPENDENCIES,
)
def pay_counter_order(
    order_id: int,
    background_tasks: BackgroundTasks,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    order = _get_order_or_404(db, order_id)
    if order.payment_method != PaymentMethod.COUNTER:
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="invalid_payment_method", message="Order payment method does not allow counter payment confirmation.", details={"order_id": order.order_id, "payment_method": str(order.payment_method)})
    if order.payment_status == PaymentStatus.PAID:
        return CounterPaymentResponse(message="Counter order marked as paid.", order=_order_response(order))
    if order.state in {OrderState.CANCELLED, OrderState.DELIVERED}:
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="invalid_order_state_transition", message="This order can no longer be paid at the counter.", details={"order_id": order.order_id, "state": str(order.state)})

    was_paid = _confirm_counter_payment(db, order, current_staff)
    if order.state not in KITCHEN_VISIBLE_STATES and order.state not in {OrderState.DELIVERED, OrderState.CANCELLED}:
        order.state = OrderState.CONFIRMED
    order.handled_by_user_id = current_staff.id
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    if not was_paid:
        try:
            receipt_payload = build_saved_order_receipt_payload(order)
            background_tasks.add_task(send_purchase_receipt, receipt_payload)
        except Exception:
            logger.exception("Failed to schedule receipt email for counter order %s.", order.order_id)

    return CounterPaymentResponse(message="Counter order marked as paid.", order=_order_response(order))


# CUSTOMERS

