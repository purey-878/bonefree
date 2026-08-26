"""Interactively create the first production owner account."""

from __future__ import annotations

import argparse
from getpass import getpass
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import exists, select, text
from sqlalchemy.orm import Session

from core.config import settings
from core.organizations import bind_session_to_organization
from database import SessionLocal, engine
from models import User
from modules.auth.models import UserRole, UserStatus
from modules.auth.services.authentication import hash_password
from utils.validation import validate_email, validate_name, validate_password


class OwnerBootstrapError(RuntimeError):
    pass


def create_first_owner(
    db: Session,
    *,
    name: str,
    last_name: str,
    email: str,
    password: str,
    organization_slug: str = "bonefree",
) -> User:
    normalized_name = validate_name(name)
    normalized_last_name = validate_name(last_name)
    normalized_email = validate_email(email)
    validate_password(password)
    if normalized_name is None or normalized_last_name is None:
        raise ValueError("Name and last name are required.")

    bind_session_to_organization(db, organization_slug)
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(text('LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE'))

    owner_exists = db.scalar(select(exists().where(User.role == UserRole.OWNER)))
    if owner_exists:
        raise OwnerBootstrapError(
            "An owner account already exists. Use the administration interface to manage staff."
        )

    email_exists = db.scalar(select(exists().where(User.email == normalized_email)))
    if email_exists:
        raise OwnerBootstrapError("This email is already associated with an account.")

    owner = User(
        name=normalized_name,
        last_name=normalized_last_name,
        email=normalized_email,
        password=hash_password(password),
        role=UserRole.OWNER,
        status=UserStatus.ACTIVE,
    )
    db.add(owner)
    db.flush()
    return owner


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--organization-slug",
        default="bonefree",
        help="Organization that will own the account (default: bonefree).",
    )
    args = parser.parse_args()

    if settings.environment != "production":
        raise SystemExit("Error: ENVIRONMENT must be production.")
    if engine.dialect.name != "postgresql":
        raise SystemExit("Error: the production owner command requires PostgreSQL.")

    print("Create the first Bonefree owner. Password input is hidden.")
    name = input("First name: ")
    last_name = input("Last name: ")
    email = input("Email: ")
    password = getpass("Password: ")
    password_confirmation = getpass("Confirm password: ")
    if password != password_confirmation:
        raise SystemExit("Error: passwords do not match.")

    db = SessionLocal()
    try:
        owner = create_first_owner(
            db,
            name=name,
            last_name=last_name,
            email=email,
            password=password,
            organization_slug=args.organization_slug,
        )
        db.commit()
        print(f"Owner created successfully: {owner.email}")
    except (OwnerBootstrapError, ValueError) as exc:
        db.rollback()
        raise SystemExit(f"Error: {exc}") from exc
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
