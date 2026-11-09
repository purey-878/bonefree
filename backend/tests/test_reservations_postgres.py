"""Real PostgreSQL tests; CI supplies its disposable bonefree_test database."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
import os
from pathlib import Path
import secrets
import subprocess
import sys
import threading
import unittest
from sqlalchemy import create_engine, delete, func, inspect, select, text
from sqlalchemy.orm import sessionmaker
from core.errors import AppHTTPException
from reservation_models import Reservation, ReservationException, ReservationPromotion, ReservationSettings
from schemas.reservations import BookingInput, BookingSettings
from services.reservations import cancel_booking, configuration, create_booking, now_local


@unittest.skipUnless(os.environ.get('TEST_POSTGRES_DATABASE_URL'), 'TEST_POSTGRES_DATABASE_URL is required')
class ReservationPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.url = os.environ['TEST_POSTGRES_DATABASE_URL']
        cls.engine = create_engine(cls.url, pool_size=12, max_overflow=12)
        if cls.engine.url.database != 'bonefree_test' or cls.engine.url.host not in {'localhost','127.0.0.1','postgres'}:
            raise RuntimeError('Reservation integration tests require the isolated local bonefree_test database')
        cls.Session = sessionmaker(bind=cls.engine)
        cls.migrate('upgrade','head')

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()

    @classmethod
    def migrate(cls, *args):
        env = {**os.environ, 'ENVIRONMENT':'test', 'AUTO_APPLY_MIGRATIONS':'false', 'DATABASE_URL':cls.url}
        subprocess.run([sys.executable,'-m','alembic','-c','alembic.ini',*args],cwd=Path(__file__).resolve().parents[1],env=env,check=True,capture_output=True,text=True)

    def setUp(self):
        self.day = now_local().date()+timedelta(days=3)
        config = BookingSettings(enabled=True, weekly={day:[{'start':'18:00','end':'20:00'}] for day in range(7)},minimum_notice_minutes=0,max_guests=2,max_guests_per_slot=2,max_reservations_per_slot=1)
        with self.Session() as db:
            db.execute(delete(Reservation)); db.execute(delete(ReservationPromotion)); db.execute(delete(ReservationException))
            db.scalar(select(ReservationSettings).where(ReservationSettings.id==1)).config=config.model_dump(mode='json')
            db.commit()

    def payload(self, key=None):
        return BookingInput(name='Postgres fixture',day=self.day,time='18:00',guests=2,idempotency_key=key or secrets.token_hex(32))

    def test_simultaneous_final_slot_has_exactly_one_winner(self):
        barrier=threading.Barrier(12)
        def attempt(_):
            with self.Session() as db:
                barrier.wait(timeout=20)
                try:
                    row,_=create_booking(db,self.payload()); result=row.reference; db.commit(); return result
                except AppHTTPException as error:
                    db.rollback(); return error.error
        with ThreadPoolExecutor(max_workers=12) as pool: results=list(pool.map(attempt,range(12)))
        self.assertEqual(sum(value.startswith('BF-') for value in results),1)
        self.assertEqual(results.count('reservation_unavailable'),11)
        with self.Session() as db: self.assertEqual(db.scalar(select(func.sum(Reservation.guests))),2)

    def test_concurrent_retries_return_one_durable_booking_and_token(self):
        key=secrets.token_hex(32); barrier=threading.Barrier(8)
        def attempt(_):
            with self.Session() as db:
                barrier.wait(timeout=20)
                row,token=create_booking(db,self.payload(key)); result=(row.id,token); db.commit(); return result
        with ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(attempt,range(8)))
        self.assertEqual(len(set(results)),1)
        with self.Session() as db: self.assertEqual(db.scalar(select(func.count(Reservation.id))),1)

    def test_pause_and_cancellation_serialize_with_new_allocations(self):
        with self.Session() as db:
            row,_=configuration(db,lock=True)
            row.config={**row.config,'enabled':False}
            with ThreadPoolExecutor(max_workers=1) as pool:
                def attempt():
                    with self.Session() as other:
                        try:
                            create_booking(other,self.payload());other.commit();return 'booked'
                        except AppHTTPException as error:
                            other.rollback();return error.error
                pending=pool.submit(attempt)
                self.assertFalse(pending.done())
                db.commit()
                self.assertEqual(pending.result(timeout=20),'reservations_paused')
        self.setUp()
        with self.Session() as db:
            booking,token=create_booking(db,self.payload()); booking_id=booking.id;db.commit()
        with self.Session() as db:
            cancel_booking(db, token)
            with ThreadPoolExecutor(max_workers=1) as pool:
                pending=pool.submit(attempt)
                db.commit()
                self.assertEqual(pending.result(timeout=20),'booked')
        with self.Session() as db: self.assertEqual(db.scalar(select(func.count(Reservation.id)).where(Reservation.status=='confirmed')),1)

    def test_customer_cancellation_retries_serialize_and_release_capacity(self):
        with self.Session() as db:
            booking, token = create_booking(db, self.payload())
            booking_id = booking.id
            db.commit()
        barrier = threading.Barrier(8)
        def cancel(_):
            with self.Session() as db:
                barrier.wait(timeout=20)
                row = cancel_booking(db, token)
                result = (row.id, row.status)
                db.commit()
                return result
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(cancel, range(8)))
        self.assertEqual(set(results), {(booking_id, 'cancelled')})
        with self.Session() as db:
            replacement, _ = create_booking(db, self.payload())
            db.commit()
            self.assertNotEqual(replacement.id, booking_id)
            self.assertEqual(db.scalar(select(func.count(Reservation.id)).where(Reservation.status == 'confirmed')), 1)

    def test_migration_is_repeatable_preserves_catalog_and_matches_models(self):
        from models import Category, Product, User
        from schemas.enums import UserRole,UserStatus,EntityStatus
        from alembic.autogenerate import compare_metadata
        from alembic.migration import MigrationContext
        from database import Base
        with self.Session() as db:
            owner=User(email=secrets.token_hex(8)+'@pg.test',password='fixture',role=UserRole.OWNER,status=UserStatus.ACTIVE,name='Fixture')
            db.add(owner);db.flush()
            category=Category(category_name='Reservation migration fixture',admin_id=owner.id,status=EntityStatus.ACTIVE)
            db.add(category);db.flush()
            product=Product(name='Preserved catalog',price=Decimal('8.50'),category_id=category.id,admin_id=owner.id)
            db.add(product);db.flush(); product_id=product.id
            booking,_=create_booking(db,self.payload());reference=booking.reference;db.commit()
        self.migrate('upgrade','head');self.migrate('upgrade','head')
        with self.Session() as db:
            self.assertEqual(db.scalar(select(Reservation.reference)),reference)
            self.assertTrue(db.scalar(select(ReservationSettings.config))['enabled'])
            self.assertEqual(db.scalar(select(Product.price).where(Product.id==product_id)),Decimal('8.50'))
        with self.engine.connect() as connection:
            self.assertEqual(compare_metadata(MigrationContext.configure(connection,opts={'compare_type':True}),Base.metadata),[])
        self.migrate('downgrade','20261108_0003')
        self.assertNotIn('reservation',inspect(self.engine).get_table_names())
        with self.Session() as db: self.assertEqual(db.scalar(select(Product.price).where(Product.id==product_id)),Decimal('8.50'))
        self.migrate('upgrade','head');self.migrate('upgrade','head')
        with self.Session() as db:
            self.assertFalse(db.scalar(select(ReservationSettings.config))['enabled'])
            self.assertEqual(db.scalar(text('SELECT version_num FROM alembic_version')),'20261108_0004')
