import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from dependencies import get_current_user, get_db
from enums import UserRole, UserStatus
from models import Customer
from schemas.user import (
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
from services.auth_email import send_password_reset_email, send_welcome_email
from services.auth_service import authenticate_customer, create_customer_session, get_client_ip, hash_password
from services.password_reset import can_reset_password, clear_password_reset, start_password_reset, verify_password_reset_code

router = APIRouter(tags=["Auth"])
logger = logging.getLogger(__name__)

RATE_LIMIT_WINDOW_SECONDS = 15 * 60
RATE_LIMIT_MAX_ATTEMPTS = 10
_auth_attempts: dict[str, list[float]] = {}


def _rate_limit_auth(request: Request, action: str) -> None:
    now = datetime.utcnow().timestamp()
    client = request.client.host if request.client else "unknown"
    key = f"{action}:{client}"
    attempts = [timestamp for timestamp in _auth_attempts.get(key, []) if now - timestamp < RATE_LIMIT_WINDOW_SECONDS]
    if len(attempts) >= RATE_LIMIT_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Demasiadas tentativas. Tente novamente mais tarde.")
    attempts.append(now)
    _auth_attempts[key] = attempts


def _send_welcome_email_background(email: str, name: str | None = None) -> None:
    try:
        sent = send_welcome_email(email, name, raise_errors=True)
    except Exception:
        logger.exception("Welcome email background task failed for %s.", email)
        return

    if not sent:
        logger.error("Welcome email background task failed for %s. Check auth email service logs for details.", email)


@router.post("/register", response_model=TokenResponse)
def register(user: UserRegister, background_tasks: BackgroundTasks, request: Request, db: Session = Depends(get_db)):
    """Register a new user"""
    _rate_limit_auth(request, "register")

    existing = db.query(Customer).filter(Customer.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Este email já está registado.")

    if user.tax_id:
        existing_nif = db.query(Customer).filter(Customer.tax_id == user.tax_id).first()
        if existing_nif:
            raise HTTPException(status_code=400, detail="Este NIF já está em uso.")

    new_user = Customer(
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


@router.post("/password/forgot", response_model=MessageResponse)
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Start a password reset and email a six-digit code."""
    generic_message = "Se existir uma conta com este email, foi enviado um código de redefinição."
    db_user = db.query(Customer).filter(Customer.email == body.email).first()
    if not db_user or db_user.status == UserStatus.SUSPENDED:
        return {"message": generic_message}

    code = start_password_reset(db_user)
    db.commit()

    display_name = f"{db_user.name or ''} {db_user.last_name or ''}".strip() or db_user.name
    if not send_password_reset_email(db_user.email, code, display_name):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível enviar o email com o código de redefinição. Verifique a configuração do serviço de email.",
        )

    return {"message": generic_message}


@router.post("/password/verify-otp", response_model=VerifyOTPResponse)
def verify_password_otp(body: VerifyOTPRequest, db: Session = Depends(get_db)):
    """Verify a password reset code and return a short-lived reset token."""
    db_user = db.query(Customer).filter(Customer.email == body.email).first()
    if not db_user:
        raise HTTPException(status_code=400, detail="Pedido de redefinição inválido.")

    valid, message, reset_token = verify_password_reset_code(db_user, body.code)
    db.commit()
    if not valid or not reset_token:
        raise HTTPException(status_code=400, detail=message)

    return {"message": message, "reset_token": reset_token}


@router.post("/password/reset", response_model=MessageResponse)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset a password after OTP verification."""
    db_user = db.query(Customer).filter(Customer.email == body.email).first()
    if not db_user:
        raise HTTPException(status_code=400, detail="Pedido de redefinição inválido.")

    allowed, message = can_reset_password(db_user, body.reset_token)
    if not allowed:
        raise HTTPException(status_code=400, detail=message)

    db_user.password = hash_password(body.new_password)
    clear_password_reset(db_user)
    db.commit()

    return {"message": "A palavra-passe foi redefinida."}


@router.post("/login", response_model=TokenResponse)
def login(user: UserAuth, request: Request, db: Session = Depends(get_db)):
    """Login user"""
    _rate_limit_auth(request, "login")
    db_user = db.query(Customer).filter(Customer.email == user.email).first()
    db_user, access_token = authenticate_customer(db, db_user, user.password, request)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(db_user),
    }


@router.get("/me", response_model=UserResponse)
def get_me(current_user: Customer = Depends(get_current_user)):
    """Get current logged in user"""
    return UserResponse.model_validate(current_user)