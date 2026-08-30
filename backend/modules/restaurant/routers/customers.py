from ._shared import *  # noqa: F403 - shared router namespace
from typing import TypedDict


class CustomerAddressPayload(TypedDict):
    address: str | None
    postal_code: str | None
    city: str | None


def _customer_address_payload(
    body: CustomerAdminCreate | CustomerAdminUpdate,
) -> CustomerAddressPayload:
    return {
        "address": getattr(body, "address", None),
        "postal_code": getattr(body, "postal_code", None),
        "city": getattr(body, "city", None),
    }


def _customer_address_has_data(payload: CustomerAddressPayload) -> bool:
    return any(str(payload.get(field) or "").strip() for field in ("address", "postal_code", "city"))


def _sync_customer_invoice_address(
    db: Session,
    customer: User,
    payload: CustomerAddressPayload,
) -> None:
    current_address = customer.billing_address
    if not _customer_address_has_data(payload):
        if current_address:
            db.delete(current_address)
            customer.billing_address = None
        return

    address = current_address or CustomerBillingAddress(customer_id=customer.id)
    address.address = payload.get("address") or None
    address.postal_code = payload.get("postal_code") or None
    address.city = payload.get("city") or None
    address.country = "Portugal"
    if not current_address:
        db.add(address)
        customer.billing_address = address


def _customer_owner_response(customer: User) -> CustomerAdminResponse:
    address = customer.billing_address
    return CustomerAdminResponse(
        customer_id=customer.id,
        name=customer.name,
        last_name=customer.last_name,
        email=customer.email,
        phone=customer.phone,
        tax_id=customer.tax_id,
        address=address.address if address else None,
        postal_code=address.postal_code if address else None,
        city=address.city if address else None,
        status=customer.status,
        created_at=customer.created_at,
    )


@router.get(
    "/customers",
    response_model=CustomerAdminPageResponse,
    operation_id="admin_management_list_customers",
    dependencies=CUSTOMER_ACCOUNT_FEATURE_DEPENDENCIES,
)
def list_customers(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str = Query(None),
    status_filter: Optional[UserStatus] = Query(None, alias="status"),
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    del current_owner
    filters = [User.role == UserRole.CLIENT]
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        filters.append(or_(
            func.cast(User.id, String).ilike(pattern),
            User.name.ilike(pattern),
            User.last_name.ilike(pattern),
            User.email.ilike(pattern),
            User.phone.ilike(pattern),
            User.tax_id.ilike(pattern),
        ))
    if status_filter is not None:
        filters.append(User.status == status_filter)

    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0
    customers = db.scalars(
        select(User)
        .options(joinedload(User.billing_address))
        .where(*filters)
        .order_by(User.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).unique().all()
    return CustomerAdminPageResponse(
        items=[_customer_owner_response(customer) for customer in customers],
        page=page,
        per_page=per_page,
        total=int(total),
        total_pages=total_pages(int(total), per_page),
    )


@router.post(
    "/customers",
    response_model=CustomerAdminResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="admin_management_create_customer",
    dependencies=CUSTOMER_ACCOUNT_FEATURE_DEPENDENCIES,
)
def create_customer(
    body: CustomerAdminCreate,
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="duplicate_customer_email", message="This email is already associated with an existing customer.", details={"email": email})

    customer = User(
        name=body.name,
        last_name=body.last_name,
        email=email,
        password=hash_password(body.password),
        phone=body.phone,
        tax_id=body.tax_id,
        status=body.status,
        role=UserRole.CLIENT,
        created_at=datetime.utcnow(),
    )
    db.add(customer)
    db.flush()
    _sync_customer_invoice_address(db, customer, _customer_address_payload(body))
    db.commit()
    db.refresh(customer)
    return _customer_owner_response(customer)


@router.put(
    "/customers/{customer_id}",
    response_model=CustomerAdminResponse,
    operation_id="admin_management_update_customer",
    dependencies=CUSTOMER_ACCOUNT_FEATURE_DEPENDENCIES,
)
def update_customer(
    customer_id: int,
    body: CustomerAdminUpdate,
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    customer = db.scalar(
        select(User)
        .options(joinedload(User.billing_address))
        .where(User.id == customer_id, User.role == UserRole.CLIENT)
        .limit(1)
    )
    if not customer:
        raise AppHTTPException(status_code=404, error="customer_not_found", message="Customer not found.", details={"reason": "request_failed"})

    if body.email is not None:
        email = body.email.strip().lower()
        existing = db.scalar(
            select(User).where(User.email == email, User.id != customer_id)
        )
        if existing:
            raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="duplicate_customer_email", message="This email is already associated with an existing customer.", details={"email": email})
        customer.email = email

    for field in ("name", "last_name", "phone", "tax_id", "status"):
        value = getattr(body, field)
        if value is not None:
            setattr(customer, field, value)
    if {"address", "postal_code", "city"}.intersection(body.model_fields_set):
        _sync_customer_invoice_address(db, customer, _customer_address_payload(body))
    if body.password:
        customer.password = hash_password(body.password)

    db.commit()
    db.refresh(customer)
    return _customer_owner_response(customer)


@router.delete(
    "/customers/{customer_id}",
    response_model=CustomerAdminResponse,
    operation_id="admin_management_delete_customer",
    dependencies=CUSTOMER_ACCOUNT_FEATURE_DEPENDENCIES,
)
def delete_customer(
    customer_id: int,
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    customer = db.scalar(
        select(User)
        .options(joinedload(User.billing_address))
        .where(User.id == customer_id, User.role == UserRole.CLIENT)
        .limit(1)
    )
    if not customer:
        raise AppHTTPException(status_code=404, error="customer_not_found", message="Customer not found.", details={"reason": "request_failed"})
    customer.status = UserStatus.SUSPENDED
    db.commit()
    db.refresh(customer)
    return _customer_owner_response(customer)


