from core.env_loader import load_env_files

load_env_files()

import logging

from fastapi import BackgroundTasks, FastAPI, Request
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from database import SessionLocal
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Literal, Optional
from database import engine
from schema_migrations import apply_schema_migrations
from routes.admin import router as admin_router
from routes.carrinho import alias_router as carrinho_alias_router
from routes.carrinho import router as carrinho_router
from routes.checkout import router as checkout_router
from routes.produtos import router as produtos_router
from routes.profile import router as profile_router
from routes.reviews import router as reviews_router
from routes.site_settings import admin_router as site_settings_admin_router
from routes.site_settings import public_router as site_settings_public_router
from auth import hash_password, verify_password, create_access_token, get_current_user
from models import Cliente
from schemas.usuario import (
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
from services.auth_email import send_password_reset_email, send_welcome_email, validate_email_config
from services.password_reset import can_reset_password, clear_password_reset, start_password_reset, verify_password_reset_code
from datetime import datetime




logger = logging.getLogger(__name__)

apply_schema_migrations(engine)

missing_email_config = validate_email_config()
if missing_email_config:
    logger.warning("Auth email SMTP configuration is missing or empty: %s", ", ".join(missing_email_config))



class Product(BaseModel):
    id: int
    category: str
    name: str
    description: str
    image: str | None = None

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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



app = FastAPI(
    title='Prey API',
    version='0.1.0',
    description='Backend API for the Prey project',
)

origins = [
    'http://127.0.0.1:8000',
    'http://localhost:5173',
    'http://127.0.0.1',
    'http://127.0.0.1:5174',

    # Production frontend
    'https://bonefree.pt',
    'https://www.bonefree.pt',
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=["Content-Disposition"],
)

@app.get('/', tags=['Health'])
def root():
    return {'status': 'running'}

@app.get('/health', tags=['Health'])
def health_check():
    return {'status': 'healthy'}


@app.post("/register", response_model=TokenResponse, tags=['Auth'])
def register(user: UserRegister, background_tasks: BackgroundTasks, request: Request, db: Session = Depends(get_db)):
    """Register a new user"""
    _rate_limit_auth(request, "register")
    # Check if email already exists
    existing = db.query(Cliente).filter(Cliente.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Este email já está registado.")
    if user.nif:
        existing_nif = db.query(Cliente).filter(Cliente.nif == user.nif).first()
        if existing_nif:
            raise HTTPException(status_code=400, detail="Este NIF já está em uso.")
    
    # Create new user
    new_user = Cliente(
        email=user.email,
        palavra_passe=hash_password(user.password),
        nome=user.nome or "User",
        apelido=user.apelido or user.email.split("@")[0],
        telefone=user.telefone,
        nif=user.nif,
        status=1,
        data_criacao=datetime.utcnow()
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    background_tasks.add_task(_send_welcome_email_background, new_user.email, new_user.nome)
    
    # Create token
    access_token = create_access_token(data={"sub": new_user.email})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(new_user)
    }


@app.post("/password/forgot", response_model=MessageResponse, tags=['Auth'])
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Start a password reset and email a six-digit code."""
    generic_message = "Se existir uma conta com este email, foi enviado um código de redefinição."
    db_user = db.query(Cliente).filter(Cliente.email == body.email).first()
    if not db_user or db_user.status == 0:
        return {"message": generic_message}

    code = start_password_reset(db_user)
    db.commit()

    display_name = f"{db_user.nome or ''} {db_user.apelido or ''}".strip() or db_user.nome
    if not send_password_reset_email(db_user.email, code, display_name):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível enviar o email com o código de redefinição. Verifique a configuração do serviço de email.",
        )

    return {"message": generic_message}


@app.post("/password/verify-otp", response_model=VerifyOTPResponse, tags=['Auth'])
def verify_password_otp(body: VerifyOTPRequest, db: Session = Depends(get_db)):
    """Verify a password reset code and return a short-lived reset token."""
    db_user = db.query(Cliente).filter(Cliente.email == body.email).first()
    if not db_user:
        raise HTTPException(status_code=400, detail="Pedido de redefinição inválido.")

    valid, message, reset_token = verify_password_reset_code(db_user, body.code)
    db.commit()
    if not valid or not reset_token:
        raise HTTPException(status_code=400, detail=message)

    return {"message": message, "reset_token": reset_token}


@app.post("/password/reset", response_model=MessageResponse, tags=['Auth'])
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset a password after OTP verification."""
    db_user = db.query(Cliente).filter(Cliente.email == body.email).first()
    if not db_user:
        raise HTTPException(status_code=400, detail="Pedido de redefinição inválido.")

    allowed, message = can_reset_password(db_user, body.reset_token)
    if not allowed:
        raise HTTPException(status_code=400, detail=message)

    db_user.palavra_passe = hash_password(body.new_password)
    clear_password_reset(db_user)
    db.commit()

    return {"message": "A palavra-passe foi redefinida."}


@app.post("/login", response_model=TokenResponse, tags=['Auth'])
def login(user: UserAuth, request: Request, db: Session = Depends(get_db)):
    """Login user"""
    _rate_limit_auth(request, "login")
    # Find user by email
    db_user = db.query(Cliente).filter(Cliente.email == user.email).first()
    
    if not db_user:
        raise HTTPException(status_code=401, detail="Email ou palavra-passe inválido.")
    
    # Verify password
    if not verify_password(user.password, db_user.palavra_passe):
        raise HTTPException(status_code=401, detail="Email ou palavra-passe inválido.")

    if db_user.status == 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="A conta de cliente está inativa.")
    
    # Create token
    access_token = create_access_token(data={"sub": db_user.email})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(db_user)
    }


@app.get("/me", response_model=UserResponse, tags=['Auth'])
def get_me(current_user: Cliente = Depends(get_current_user)):
    """Get current logged in user"""
    return UserResponse.model_validate(current_user)


app.include_router(produtos_router, prefix='/products', tags=['Produtos'])
app.include_router(carrinho_router)
app.include_router(carrinho_alias_router)
app.include_router(checkout_router)
app.include_router(profile_router)
app.include_router(reviews_router)
app.include_router(admin_router)
app.include_router(site_settings_public_router)
app.include_router(site_settings_admin_router)


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.environ.get("PORT", 8000))

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=port,
    )
