from ._shared import *  # noqa: F403 - shared router namespace

# STAFF ADMINS

@router.get(
    "/staff",
    response_model=StaffAdminPageResponse,
    operation_id="admin_management_list_staff_admins",
    summary="List Staff Admins",
)
def list_staff_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=160),
    role: Optional[UserRole] = Query(None),
    status_filter: Optional[UserStatus] = Query(None, alias="status"),
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    del current_owner
    filters = [User.role.in_(ORGANIZATION_STAFF_ROLES)]
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        filters.append(or_(
            func.cast(User.id, String).ilike(pattern),
            User.name.ilike(pattern),
            User.email.ilike(pattern),
        ))
    if role is not None:
        filters.append(User.role == role)
    if status_filter is not None:
        filters.append(User.status == status_filter)

    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0
    staff_users = db.scalars(
        select(User)
        .where(*filters)
        .order_by(User.id.asc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).all()
    for staff_user in staff_users:
        staff_user.role = normalize_user_role(staff_user.role)
    return StaffAdminPageResponse(
        items=[AdminResponse.model_validate(staff_user) for staff_user in staff_users],
        page=page,
        per_page=per_page,
        total=int(total),
        total_pages=total_pages(int(total), per_page),
    )


@router.post(
    "/staff",
    response_model=AdminResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="admin_management_create_staff_admin",
    summary="Create Staff Admin",
)
def create_staff_user(
    body: StaffAdminCreate,
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="duplicate_admin_email", message="This email is already associated with an existing admin.", details={"email": email})

    staff_user = User(
        name=body.name,
        email=email,
        password=hash_password(body.password),
        created_at=datetime.utcnow().date(),
        status=body.status,
        role=body.role,
    )
    db.add(staff_user)
    db.commit()
    db.refresh(staff_user)
    return staff_user


@router.put(
    "/staff/{admin_id}",
    response_model=AdminResponse,
    operation_id="admin_management_update_staff_admin",
    summary="Update Staff Admin",
)
def update_staff_user(
    admin_id: int,
    body: StaffAdminUpdate,
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    staff_user = db.scalar(select(User).where(User.id == admin_id, User.role.in_(ORGANIZATION_STAFF_ROLES)))
    if not staff_user:
        raise AppHTTPException(status_code=404, error="admin_not_found", message="Admin not found.", details={"reason": "request_failed"})

    if body.email is not None:
        email = body.email.strip().lower()
        existing = db.scalar(select(User).where(User.email == email, User.id != admin_id))
        if existing:
            raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="duplicate_admin_email", message="This email is already associated with an existing admin.", details={"email": email})
        staff_user.email = email
    if body.name is not None:
        staff_user.name = body.name
    if body.role is not None:
        staff_user.role = body.role
    if body.status is not None:
        staff_user.status = body.status
    if body.password:
        staff_user.password = hash_password(body.password)

    db.commit()
    db.refresh(staff_user)
    return staff_user


@router.delete(
    "/staff/{admin_id}",
    response_model=AdminResponse,
    operation_id="admin_management_delete_staff_admin",
    summary="Delete Staff Admin",
)
def delete_staff_user(
    admin_id: int,
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    if admin_id == current_owner.id:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="cannot_delete_current_admin", message="Current admin account cannot be deleted.", details={"admin_id": admin_id})
    staff_user = db.scalar(select(User).where(User.id == admin_id, User.role.in_(ORGANIZATION_STAFF_ROLES)))
    if not staff_user:
        raise AppHTTPException(status_code=404, error="admin_not_found", message="Admin not found.", details={"reason": "request_failed"})
    staff_user.status = UserStatus.SUSPENDED
    db.commit()
    db.refresh(staff_user)
    return staff_user


# ─────────────────────────────────────────────────────────────
# ANALYTICS
# ─────────────────────────────────────────────────────────────

