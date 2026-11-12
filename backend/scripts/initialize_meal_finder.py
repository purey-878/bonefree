"""Idempotently initialize the disabled Meal Finder switch, after Alembic upgrade.

Preserves existing settings. Questions and matching rules are fixed in code.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from database import SessionLocal
from meal_finder_models import MealFinderSettings
from services.meal_finder import default_settings


def initialize(db):
    if db.scalar(select(MealFinderSettings.id).where(MealFinderSettings.id == 1)) is not None:
        return False
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
    insert = pg_insert if db.bind.dialect.name == 'postgresql' else sqlite_insert
    db.execute(insert(MealFinderSettings).values(id=1, version=1, config=default_settings(db).model_dump(mode='json')).on_conflict_do_nothing(index_elements=['id']))
    db.commit()
    return True


if __name__ == '__main__':
    with SessionLocal() as db:
        initialize(db)
    print('Meal Finder initialized; existing administrator configuration preserved.')
