"""Disposable API for legal document browser tests; never opens the application DB."""
from datetime import datetime, timedelta
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
import uvicorn

from app import create_app
from core.base import Base
from core.config import settings
from database import get_db
from modules.auth.models import OrganizationDomain, OrganizationExperience, OrganizationFeatureEntitlement, Session
from modules.auth.services.authentication import hash_session_token
from scripts.seed_production_organization import apply_production_organization
from scripts.create_first_owner import create_first_owner

settings.environment = "test"
settings.rate_limit_enabled = False
settings.cors_origins_raw = "http://127.0.0.1:5179"
temporary = TemporaryDirectory()
database_path = Path(temporary.name) / "legal-browser.db"
engine = create_engine(f"sqlite:///{database_path.as_posix()}", connect_args={"check_same_thread": False, "timeout": 30})
Base.metadata.create_all(engine)
sessions = sessionmaker(bind=engine)
with sessions() as db:
    apply_production_organization(db)
    db.add(OrganizationDomain(domain="127.0.0.1", is_primary=True, is_verified=True))
    experience = db.scalar(select(OrganizationExperience))
    experience.theme_key = "bonefree"
    experience.theme_mode = "default"
    for key in ("catalog", "ordering", "customer_accounts", "reviews", "events", "loyalty"):
        db.add(OrganizationFeatureEntitlement(feature_key=key, enabled=True, configuration={}))
    owner = create_first_owner(db, name="Browser", last_name="Owner", email="browser@example.com", password="BrowserTest123!")
    db.add(Session(user_id=owner.id, token_hash=hash_session_token("legal-browser-owner"), expires_at=datetime.now() + timedelta(hours=2)))
    db.commit()

settings.data_exports_dir = Path(temporary.name) / "exports"
app = create_app(run_startup_tasks=False, public_assets_dir=Path(temporary.name) / "assets", uploads_dir=Path(temporary.name) / "uploads")


def override_db():
    with sessions() as db:
        yield db


app.dependency_overrides[get_db] = override_db

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8019)
