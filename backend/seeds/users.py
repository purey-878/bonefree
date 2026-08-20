from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from database import SessionLocal
from schemas.enums import UserRole, UserStatus
from models import User
from services.auth_service import hash_password

logger = logging.getLogger(__name__)

TEST_USER_PASSWORD = "Test123!"


@dataclass(frozen=True)
class TestUserSeed:
    role: UserRole
    email: str
    name: str
    last_name: str


TEST_USERS: tuple[TestUserSeed, ...] = (
    TestUserSeed(UserRole.OWNER, "owner@test.com", "Test", "Owner"),
    TestUserSeed(UserRole.MANAGER, "manager@test.com", "Test", "Manager"),
    TestUserSeed(UserRole.WAITER, "waiter@test.com", "Test", "Waiter"),
    TestUserSeed(UserRole.CHEF, "chef@test.com", "Test", "Chef"),
    TestUserSeed(UserRole.CLIENT, "client@test.com", "Test", "Client"),
)


def _ensure_test_user(db: DBSession, seed: TestUserSeed) -> bool:
    user = db.scalar(select(User).where(User.email == seed.email))

    if user is None:
        db.add(
            User(
                email=seed.email,
                password=hash_password(TEST_USER_PASSWORD),
                name=seed.name,
                last_name=seed.last_name,
                role=seed.role,
                status=UserStatus.ACTIVE,
            )
        )
        return True

    changed = False

    if user.role != seed.role:
        user.role = seed.role
        changed = True

    if user.status != UserStatus.ACTIVE:
        user.status = UserStatus.ACTIVE
        changed = True

    if user.name != seed.name:
        user.name = seed.name
        changed = True

    if user.last_name != seed.last_name:
        user.last_name = seed.last_name
        changed = True

    return changed


def seed_test_users() -> None:
    """Ensure development test users exist for every system role.

    This seed is idempotent: repeated executions do not create duplicate users.
    Existing users are matched by email and only the intended test user fields are
    normalized.
    """

    db = SessionLocal()
    try:
        changed_count = 0

        for seed in TEST_USERS:
            if _ensure_test_user(db, seed):
                changed_count += 1

        db.commit()

        if changed_count:
            logger.info("Seeded or updated %s development test users.", changed_count)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()