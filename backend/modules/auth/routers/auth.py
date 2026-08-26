import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from modules.auth.dependencies import (
    get_current_user,
    get_db,
    require_organization_context,
    require_organization_header_context,
    get_session_token_optional,
    rate_limit_login,
    rate_limit_register,
)
from modules.auth.models import Session, User, UserRole, UserStatus
from modules.auth.schemas.user import (
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserAuth,
    UserRegister,
    UserResponse,
    VerifyOTPRequest,
    VerifyOTPResponse,
)
from modules.auth.services.email import send_password_reset_email, send_welcome_email
from modules.auth.services.authentication import authenticate_customer, create_customer_session, get_client_ip, hash_password, hash_session_token
from modules.auth.services.password_reset import can_reset_password, clear_password_reset, start_password_reset, verify_password_reset_code
from core.errors import AppHTTPException
from core.rate_limit import RATE_LIMIT_OPENAPI_RESPONSES

router = APIRouter(tags=["Auth"])
logger = logging.getLogger(__name__)

LOGOUT_DESC = "Revokes the current session token when provided."


def _send_welcome_email_background(email: str, name: str | None = None) -> None:
    try:
        sent = send_welcome_email(email, name, raise_errors=True)
    except Exception:
        logger.exception("Welcome email background task failed for %s.", email)
        return

    if not sent:
        logger.error("Welcome email background task failed for %s. Check auth email service logs for details.", email)


@router.post(
    "/register",
    response_model=TokenResponse,
    responses=RATE_LIMIT_OPENAPI_RESPONSES,
    dependencies=[Depends(require_organization_header_context)],
    operation_id="auth_register",
)
def register(
    background_tasks: BackgroundTasks,
    request: Request,
    user: UserRegister = Depends(rate_limit_register),
    db: DBSession = Depends(get_db),
):
    """Register a new user"""

    existing = db.scalar(select(User).where(User.email == user.email))
    if existing:
        raise AppHTTPException(
            status_code=status.HTTP_409_CONFLICT,
            error="duplicate_email",
            message="This email is already associated with an existing account.",
            details={"email": user.email},
        )

    if user.tax_id:
        existing_tax_id = db.scalar(select(User).where(User.tax_id == user.tax_id))
        if existing_tax_id:
            raise AppHTTPException(
                status_code=status.HTTP_409_CONFLICT,
                error="duplicate_tax_id",
                message="This tax ID is already associated with an existing account.",
                details={"tax_id": user.tax_id},
            )

    new_user = User(
        email=user.email,
        password=hash_password(user.password),
        name=user.name or "User",
        last_name=user.last_name or user.email.split("@")[0],
        phone=user.phone,
        tax_id=user.tax_id,
        status=UserStatus.ACTIVE,
        role=UserRole.CLIENT,
        created_at=datetime.utcnow(),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    background_tasks.add_task(_send_welcome_email_background, new_user.email, new_user.name)

    access_token = create_customer_session(
        db,
        new_user.id,
        get_client_ip(request),
        request.headers.get("user-agent"),
    )
    db.commit()

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(new_user),
    }


@router.post("/password/forgot", response_model=MessageResponse, operation_id="auth_forgot_password", dependencies=[Depends(require_organization_header_context)])
def forgot_password(body: ForgotPasswordRequest, db: DBSession = Depends(get_db)):
    """Start a password reset and email a six-digit code."""
    generic_message = "If an account exists for this email, a password reset code has been sent."
    db_user = db.scalar(select(User).where(User.email == body.email))
    if not db_user or db_user.status == UserStatus.SUSPENDED:
        return {"message": generic_message}

    code = start_password_reset(db_user)
    db.commit()

    display_name = f"{db_user.name or ''} {db_user.last_name or ''}".strip() or db_user.name
    if not send_password_reset_email(db_user.email, code, display_name):
        raise AppHTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, error="service_unavailable", message="Service unavailable.", details={"reason": "request_failed"})

    return {"message": generic_message}


@router.post("/password/verify-otp", response_model=VerifyOTPResponse, operation_id="auth_verify_password_otp", dependencies=[Depends(require_organization_header_context)])
def verify_password_otp(body: VerifyOTPRequest, db: DBSession = Depends(get_db)):
    """Verify a password reset code and return a short-lived reset token."""
    db_user = db.scalar(select(User).where(User.email == body.email))
    if not db_user:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="account_not_found",
            message="Account not found.",
            details={"email": body.email},
        )

    valid, message, reset_token = verify_password_reset_code(db_user, body.code)
    db.commit()
    if not valid or not reset_token:
        raise AppHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error="invalid_password_reset_code",
            message="Invalid or expired password reset code.",
            details={"email": body.email, "source_message": str(message)},
        )

    return {"message": message, "reset_token": reset_token}


@router.post("/password/reset", response_model=MessageResponse, operation_id="auth_reset_password", dependencies=[Depends(require_organization_header_context)])
def reset_password(body: ResetPasswordRequest, db: DBSession = Depends(get_db)):
    """Reset a password after OTP verification."""
    db_user = db.scalar(select(User).where(User.email == body.email))
    if not db_user:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="account_not_found",
            message="Account not found.",
            details={"email": body.email},
        )

    allowed, message = can_reset_password(db_user, body.reset_token)
    if not allowed:
        raise AppHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error="invalid_password_reset_token",
            message="Invalid or expired password reset token.",
            details={"email": body.email, "source_message": str(message)},
        )

    db_user.password = hash_password(body.new_password)
    clear_password_reset(db_user)
    db.commit()

    return {"message": "Password reset successfully."}


@router.post(
    "/login",
    response_model=TokenResponse,
    responses=RATE_LIMIT_OPENAPI_RESPONSES,
    dependencies=[Depends(require_organization_header_context)],
    operation_id="auth_login",
)
def login(
    request: Request,
    user: UserAuth = Depends(rate_limit_login),
    db: DBSession = Depends(get_db),
):
    """Login user"""
    db_user = db.scalar(select(User).where(User.email == user.email))
    db_user, access_token = authenticate_customer(db, db_user, user.password, request)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(db_user),
    }


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    description=LOGOUT_DESC,
    operation_id="auth_logout",
)
def logout(
    _organization_id: int = Depends(require_organization_context),
    token: str | None = Depends(get_session_token_optional),
    db: DBSession = Depends(get_db),
) -> Response:
    if token is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    session = db.scalar(
        select(Session).where(
            Session.token_hash == hash_session_token(token)
        )
    )
    if session is not None:
        session.revoked = True
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserResponse, operation_id="auth_get_me")
def get_me(current_user: User = Depends(get_current_user)):
    """Get current logged in user"""
    return UserResponse.model_validate(current_user)
