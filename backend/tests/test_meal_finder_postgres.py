"""Run the HTTP workflow on migrated PostgreSQL, in a named disposable database.

MEAL_FINDER_TEST_DATABASE_URL must point at localhost/bonefree_meal_finder_test.
This suite owns and resets that test database's public schema.
"""
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from tests import test_meal_finder as workflow
from tests import test_endpoint_smoke as smoke
from database import Base
from models import User, Category, Product
from schemas.enums import EntityStatus, UserRole, UserStatus

URL = os.environ.get('MEAL_FINDER_TEST_DATABASE_URL')


@unittest.skipUnless(URL, 'MEAL_FINDER_TEST_DATABASE_URL is required for PostgreSQL workflow tests')
class MealFinderPostgresTests(workflow.MealFinderTests):
    @classmethod
    def setUpClass(cls):
        cls.pg_engine = create_engine(URL)
        if cls.pg_engine.url.database != 'bonefree_meal_finder_test' or cls.pg_engine.url.host not in {'localhost','127.0.0.1'}:
            raise RuntimeError('Only the disposable local bonefree_meal_finder_test database is allowed.')
        with cls.pg_engine.begin() as connection:
            connection.execute(text('DROP SCHEMA public CASCADE'))
            connection.execute(text('CREATE SCHEMA public'))
        cls.upgrade('20261108_0004')
        with Session(cls.pg_engine) as db:
            user=User(email='preserve@finder.test',password='preserved',role=UserRole.OWNER,status=UserStatus.ACTIVE)
            db.add(user);db.flush()
            category=Category(category_name='Preserved food',admin_id=user.id,status=EntityStatus.ACTIVE)
            db.add(category);db.flush()
            product=Product(name='Preserved dish',price=12.34,category_id=category.id,admin_id=user.id,status=EntityStatus.ACTIVE)
            db.add(product);db.flush();cls.preserved_id=product.id;db.commit()
        cls.upgrade('head');cls.upgrade('head')
        with cls.pg_engine.connect() as connection:
            diff=compare_metadata(MigrationContext.configure(connection,opts={'compare_type':True}),Base.metadata)
            if diff:
                raise AssertionError(diff)
        # Reuse the complete HTTP workflow fixture, but on real PostgreSQL.
        with patch.object(smoke,'create_engine',return_value=cls.pg_engine):
            super().setUpClass()

    @classmethod
    def upgrade(cls,revision):
        subprocess.run([sys.executable,'-m','alembic','upgrade',revision],cwd=Path(__file__).resolve().parents[1],env={**os.environ,'DATABASE_URL':URL,'AUTO_APPLY_MIGRATIONS':'false'},check=True,capture_output=True,text=True)

    def test_migration_preserves_data_and_feature_only_downgrade(self):
        with Session(self.pg_engine) as db:
            product=db.get(Product,self.preserved_id)
            self.assertEqual(product.name,'Preserved dish')
            self.assertEqual(str(product.price),'12.34')
        subprocess.run([sys.executable,'-m','alembic','downgrade','20261108_0004'],cwd=Path(__file__).resolve().parents[1],env={**os.environ,'DATABASE_URL':URL},check=True,capture_output=True,text=True)
        with self.pg_engine.connect() as connection:
            self.assertIn('reservation',inspect(connection).get_table_names())
            self.assertEqual(connection.scalar(select(Product.name).where(Product.id==self.preserved_id)),'Preserved dish')
        self.upgrade('head');self.upgrade('head')
