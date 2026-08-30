from ._shared import *  # noqa: F403 - shared router namespace

@router.get(
    "/orders",
    response_model=AdminOrderPageResponse,
    operation_id="admin_management_list_orders",
    dependencies=ORDERING_FEATURE_DEPENDENCIES,
)
def list_orders(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=160),
    state: Optional[OrderState] = Query(None),
    payment_method: Optional[PaymentMethod] = Query(None),
    payment_status: Optional[PaymentStatus] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    customization: str = Query("all", pattern="^(all|customized|plain)$"),
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    del current_staff
    filters = []
    if state is not None:
        filters.append(Order.state == state)
    if payment_method is not None:
        filters.append(Order.payment_method == payment_method)
    if payment_status is not None:
        filters.append(Order.payment_status == payment_status)
    if date_from is not None:
        filters.append(Order.ordered_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        filters.append(Order.ordered_at <= datetime.combine(date_to, datetime.max.time()))

    customized_exists = exists().where(
        OrderProduct.order_id == Order.order_id,
        func.length(func.trim(func.coalesce(OrderProduct.customization, ""))) > 0,
    )
    if customization == "customized":
        filters.append(customized_exists)
    elif customization == "plain":
        filters.append(~customized_exists)

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        item_match = exists().where(
            OrderProduct.order_id == Order.order_id,
            or_(
                OrderProduct.product_name_snapshot.ilike(pattern),
                func.cast(OrderProduct.product_id, String).ilike(pattern),
            ),
        )
        filters.append(or_(
            func.cast(Order.order_id, String).ilike(pattern),
            Order.customer_first_name.ilike(pattern),
            Order.customer_last_name.ilike(pattern),
            Order.customer_email.ilike(pattern),
            Order.customer_phone.ilike(pattern),
            item_match,
        ))

    total = db.scalar(select(func.count(Order.order_id)).where(*filters)) or 0
    orders = db.scalars(
        select(Order)
        .options(
            selectinload(Order.items).joinedload(OrderProduct.product),
            joinedload(Order.customer),
        )
        .where(*filters)
        .order_by(Order.ordered_at.desc(), Order.order_id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).unique().all()
    pending, preparing, ready, completed, revenue = db.execute(
        select(
            func.sum(case((Order.state == OrderState.PENDING, 1), else_=0)),
            func.sum(case((Order.state == OrderState.IN_PREPARATION, 1), else_=0)),
            func.sum(case((Order.state == OrderState.READY, 1), else_=0)),
            func.sum(case((Order.state == OrderState.DELIVERED, 1), else_=0)),
            func.sum(case((Order.state == OrderState.DELIVERED, Order.total), else_=0)),
        ).where(*filters)
    ).one()
    return AdminOrderPageResponse(
        items=[_order_response(order) for order in orders],
        page=page,
        per_page=per_page,
        total=int(total),
        total_pages=total_pages(int(total), per_page),
        summary=AdminOrderSummary(
            pending=int(pending or 0),
            preparing=int(preparing or 0),
            ready=int(ready or 0),
            completed=int(completed or 0),
            revenue=float(revenue or 0),
        ),
    )


@router.get(
    "/staff/orders",
    response_model=List[OrderResponse],
    operation_id="admin_management_list_staff_orders",
    dependencies=ORDERING_FEATURE_DEPENDENCIES,
)
def list_staff_orders(
    current_staff: User = Depends(require_organization_role(*ORGANIZATION_STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    orders = db.scalars(
        select(Order)
        .options(
            selectinload(Order.items).joinedload(OrderProduct.product),
            joinedload(Order.customer),
        )
        .where(_staff_order_filter())
        .order_by(Order.ordered_at.asc(), Order.order_id.asc())
    ).unique().all()

    return [_order_response(order) for order in orders]


@router.get(
    "/kitchen/orders",
    response_model=List[KitchenOrderResponse],
    operation_id="admin_management_list_kitchen_orders",
    dependencies=ORDERING_FEATURE_DEPENDENCIES,
)
def list_kitchen_orders(
    current_staff: User = Depends(require_organization_role(*ORGANIZATION_STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    orders = db.scalars(
        select(Order)
        .options(selectinload(Order.items).joinedload(OrderProduct.product))
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
        .order_by(Order.ordered_at.asc(), Order.order_id.asc())
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
    current_staff: User = Depends(require_organization_role(*ORGANIZATION_STAFF_ROLES)),
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


@router.delete(
    "/orders/{order_id}",
    response_model=MessageResponse,
    operation_id="admin_management_delete_cancelled_order",
    dependencies=ORDERING_FEATURE_DEPENDENCIES,
)
def delete_cancelled_order(
    order_id: int,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    del current_staff
    order = _get_order_or_404(db, order_id)
    if order.state != OrderState.CANCELLED:
        raise AppHTTPException(
            status_code=status.HTTP_409_CONFLICT,
            error="order_must_be_cancelled",
            message="Only a cancelled order can be deleted.",
            details={"order_id": order.order_id, "state": str(order.state)},
        )
    db.delete(order)
    db.commit()
    return MessageResponse(message="Order deleted successfully.")


@router.patch(
    "/orders/{order_id}/status",
    response_model=OrderResponse,
    operation_id="admin_management_update_order_status",
    dependencies=ORDERING_FEATURE_DEPENDENCIES,
)
def update_order_status(
    order_id: int,
    body: OrderStatusUpdate,
    current_staff: User = Depends(require_organization_role(*ORGANIZATION_STAFF_ROLES)),
    db: Session = Depends(get_db),
):
    order = _get_order_or_404(db, order_id)
    role = normalize_user_role(current_staff.role)
    if role == UserRole.CHEF and not _is_kitchen_visible(order):
        raise AppHTTPException(status_code=403, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})
    _ensure_order_status_allowed(current_staff, order, body.state)
    previous_state = order.state
    now = datetime.utcnow()
    order.state = body.state
    if body.state == OrderState.CANCELLED:
        order.canceled_at = order.canceled_at or now
        order.cancellation_origin = CancellationOrigin.ADMIN
    elif previous_state == OrderState.CANCELLED:
        order.canceled_at = None
        order.cancellation_origin = None
    order.handled_by_user_id = current_staff.id
    order.updated_at = now
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
    current_staff: User = Depends(require_organization_role(UserRole.WAITER, UserRole.MANAGER, UserRole.OWNER)),
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

