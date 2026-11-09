"""Run the real API against a disposable local browser-test PostgreSQL database.

Never use production credentials. --reset-reservations deletes fixture bookings.
"""
import argparse
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import subprocess
import sys

from sqlalchemy.engine import make_url


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reset-reservations', action='store_true')
    args = parser.parse_args()
    url = os.environ.get('TEST_POSTGRES_BROWSER_DATABASE_URL', '')
    if not url:
        raise SystemExit('Set TEST_POSTGRES_BROWSER_DATABASE_URL to a disposable local database.')
    parsed = make_url(url)
    if parsed.database != 'bonefree_browser' or parsed.host not in {'127.0.0.1', 'localhost'} or parsed.get_backend_name() != 'postgresql':
        raise SystemExit('Use a disposable loopback PostgreSQL database named bonefree_browser.')
    root = Path(__file__).resolve().parents[2]
    os.environ.update(ENVIRONMENT='test', DATABASE_URL=url, AUTO_APPLY_MIGRATIONS='false')
    sys.path.insert(0, str(root / 'backend'))
    subprocess.run([sys.executable, '-m', 'alembic', '-c', 'alembic.ini', 'upgrade', 'head'], cwd=root / 'backend', check=True)
    from app import create_app
    from core.config import settings
    from core.redis import InMemoryRedis
    from database import SessionLocal
    from models import Session, User
    from reservation_models import Reservation, ReservationException, ReservationPromotion, ReservationSettings
    from schemas.enums import UserRole, UserStatus
    from services.auth_service import hash_session_token
    from sqlalchemy import delete, select
    import uvicorn

    with SessionLocal() as db:
        if args.reset_reservations:
            for model in [Reservation, ReservationPromotion, ReservationException]:
                db.execute(delete(model))
            db.scalar(select(ReservationSettings).where(ReservationSettings.id == 1)).config = {'enabled': False}
        for role, token in [(UserRole.OWNER, 'reservation-test-owner'), (UserRole.MANAGER, 'reservation-test-manager')]:
            email = f'{role.value}@reservation.test'
            user = db.scalar(select(User).where(User.email == email))
            if not user:
                user = User(name='Reservation QA', email=email, password='not-a-real-password', role=role, status=UserStatus.ACTIVE)
                db.add(user)
                db.flush()
            session = db.scalar(select(Session).where(Session.token_hash == hash_session_token(token)))
            expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=6)
            if session:
                session.expires_at, session.revoked = expires, False
            else:
                db.add(Session(user_id=user.id, token_hash=hash_session_token(token), expires_at=expires, last_seen_at=datetime.now(timezone.utc).replace(tzinfo=None), revoked=False))
        db.commit()
    settings.rate_limit_enabled = False
    app = create_app(run_startup_tasks=False, public_assets_dir=root / 'frontend/public/assets', uploads_dir=Path('/tmp/bonefree-reservation-browser-uploads'))
    app.state.redis = InMemoryRedis()
    uvicorn.run(app, host='127.0.0.1', port=19102, access_log=False)


if __name__ == '__main__':
    main()
