from ._shared import *  # noqa: F403 - shared router namespace

@router.post("/login", response_model=AdminTokenResponse, operation_id="admin_management_admin_login", summary="Admin Login", dependencies=[Depends(require_organization_header_context)])
def staff_login(
    request: Request,
    credentials: AdminLogin = Depends(rate_limit_staff_login),
    db: Session = Depends(get_db),
):
    staff_user = db.scalar(select(User).where(User.email == credentials.email))
    staff_user, access_token = authenticate_staff_user(db, staff_user, credentials.password, request)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "admin": AdminResponse.model_validate(staff_user),
    }


@router.get("/me", response_model=AdminResponse, operation_id="admin_management_read_current_admin", summary="Read Current Admin")
def read_current_staff(current_staff: User = Depends(require_organization_role(*ORGANIZATION_STAFF_ROLES))):
    current_staff.role = normalize_user_role(current_staff.role)
    return current_staff


