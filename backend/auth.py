# auth.py
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Customer, Admin
from typing import Optional

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str):
    return pwd_context.hash(password)

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 4  # 1 hours

STAFF_ADMIN_ROLE = "staff_admin"
SUPER_ADMIN_ROLE = "super_admin"
CHEF_ROLE = "chef"
LEGACY_ADMIN_ROLE = "admin"
ADMIN_ROLES = {SUPER_ADMIN_ROLE, STAFF_ADMIN_ROLE, CHEF_ROLE}


def normalize_admin_role(role: str | None) -> str:
    """Map legacy admin rows to the current staff_admin role."""
    if role == LEGACY_ADMIN_ROLE:
        return STAFF_ADMIN_ROLE
    if role in ADMIN_ROLES:
        return role
    return STAFF_ADMIN_ROLE


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_access_token(token: str):
    payload = verify_access_token_payload(token)
    return payload["sub"]


def verify_access_token_payload(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.")
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Customer:
    payload = verify_access_token_payload(token)
    token_type = payload.get("type")
    if token_type and token_type != "customer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de utilizador inválido.")
    email = payload["sub"]
    user = db.query(Customer).filter(Customer.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilizador não encontrado.")
    if user.status == 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="A conta de customer está inativa.")
    return user


def get_current_user_optional(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> Optional[Customer]:
    """Optional authentication - returns user if valid Bearer token, None otherwise.
    
    Expects: Authorization: Bearer <token>
    Returns: Customer if valid, None if no token or invalid
    """
    if not authorization:
        return None
    
    try:
        # Extract token from "Bearer <token>" format
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer":
            return None
        
        if not token:
            return None
            
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        token_type = payload.get("type")
        if token_type and token_type != "customer":
            return None
        email: str = payload.get("sub")
        if not email:
            return None
            
        user = db.query(Customer).filter(Customer.email == email).first()
        if user and user.status == 0:
            return None
        return user
    except (JWTError, ValueError, IndexError):
        return None


def get_current_admin(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Admin:
    """Get current authenticated admin user."""
    payload = verify_access_token_payload(token)
    if payload.get("type") != "admin":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de administrador inválido.")
    email = payload["sub"]
    admin = db.query(Admin).filter(Admin.email == email).first()
    if not admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Administrador não encontrado.")
    if admin.status == 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="A conta de administrador está inativa.")
    admin.role = normalize_admin_role(admin.role)
    return admin


def require_admin(current_admin: Admin = Depends(get_current_admin)) -> Admin:
    """Allow any active admin account."""
    current_admin.role = normalize_admin_role(current_admin.role)
    return current_admin


def require_staff_admin_or_super_admin(current_admin: Admin = Depends(get_current_admin)) -> Admin:
    """Allow front-counter staff_admin and super_admin accounts."""
    role = normalize_admin_role(current_admin.role)
    if role not in {STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso de administrador de atendimento necessário.")
    current_admin.role = role
    return current_admin


def require_chef_or_staff_or_super_admin(current_admin: Admin = Depends(get_current_admin)) -> Admin:
    """Allow kitchen, front-counter, and super admin accounts."""
    role = normalize_admin_role(current_admin.role)
    if role not in {CHEF_ROLE, STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso de administrador necessário.")
    current_admin.role = role
    return current_admin


def require_staff_admin(current_admin: Admin = Depends(get_current_admin)) -> Admin:
    """Backward-compatible alias for staff_admin or super_admin."""
    return require_staff_admin_or_super_admin(current_admin)


def require_super_admin(current_admin: Admin = Depends(get_current_admin)) -> Admin:
    """Allow only super_admin accounts."""
    role = normalize_admin_role(current_admin.role)
    if role != SUPER_ADMIN_ROLE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso de super administrador necessário.")
    current_admin.role = role
    return current_admin
