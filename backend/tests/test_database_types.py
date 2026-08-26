from enum import StrEnum
import unittest

from sqlalchemy import Integer, String, create_engine, func, select, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import StatementError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.schema import CreateTable

from core.database_types import StrEnumType
from modules.admin.models import Admin
from modules.auth.models import Organization, User
from modules.restaurant.models import (
    CartProductCustomization,
    Category,
    Coupon,
    Ingredient,
    Media,
    MediaVariant,
    Order,
    Payment,
    Product,
    ProductCustomizationOption,
    ProductReview,
    ReviewReaction,
    SiteSetting,
)


class ExampleStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class OtherStatus(StrEnum):
    ACTIVE = "active"


class LongStatus(StrEnum):
    TOO_LONG = "too-long"


class TestBase(DeclarativeBase):
    pass


class EnumRecord(TestBase):
    __tablename__ = "enum_record"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    status: Mapped[ExampleStatus] = mapped_column(
        StrEnumType(ExampleStatus, length=50),
        nullable=True,
    )


ENUM_COLUMNS = {
    Organization: ("organization_type",),
    User: ("status", "role"),
    Admin: ("status",),
    Category: ("status",),
    SiteSetting: ("key",),
    Product: ("status",),
    Media: ("owner_type",),
    MediaVariant: ("kind",),
    Coupon: ("type",),
    Ingredient: ("type", "status"),
    ProductCustomizationOption: ("type", "status"),
    CartProductCustomization: ("action",),
    Order: ("state", "payment_method", "payment_status", "cancellation_origin"),
    ProductReview: ("status",),
    ReviewReaction: ("type",),
    Payment: ("method", "state"),
}


class StrEnumTypeTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        TestBase.metadata.create_all(self.engine)

    def tearDown(self):
        self.engine.dispose()

    def test_constructor_validates_enum_class_and_length(self):
        with self.assertRaisesRegex(TypeError, "StrEnum subclass"):
            StrEnumType(str)  # type: ignore[arg-type]
        for invalid_length in (0, -1, True, 1.5):
            with self.subTest(length=invalid_length):
                with self.assertRaisesRegex(ValueError, "positive integer"):
                    StrEnumType(ExampleStatus, length=invalid_length)  # type: ignore[arg-type]
        with self.assertRaisesRegex(ValueError, "longer than 3"):
            StrEnumType(LongStatus, length=3)

    def test_bind_validation_accepts_only_the_target_enum_or_valid_string(self):
        enum_type = StrEnumType(ExampleStatus)
        dialect = self.engine.dialect

        self.assertIsNone(enum_type.process_bind_param(None, dialect))
        self.assertEqual(
            enum_type.process_bind_param(ExampleStatus.ACTIVE, dialect),
            "active",
        )
        self.assertEqual(enum_type.process_bind_param("suspended", dialect), "suspended")
        for invalid_value in ("unknown", 1, OtherStatus.ACTIVE):
            with self.subTest(value=invalid_value):
                with self.assertRaisesRegex(ValueError, "not a valid ExampleStatus"):
                    enum_type.process_bind_param(invalid_value, dialect)  # type: ignore[arg-type]

    def test_round_trip_filters_and_invalid_write(self):
        with Session(self.engine) as db:
            db.add_all(
                [
                    EnumRecord(status=ExampleStatus.ACTIVE),
                    EnumRecord(status="suspended"),  # type: ignore[arg-type]
                    EnumRecord(status=None),  # type: ignore[arg-type]
                ]
            )
            db.commit()

            records = db.scalars(select(EnumRecord).order_by(EnumRecord.id)).all()
            self.assertEqual(
                [record.status for record in records],
                [ExampleStatus.ACTIVE, ExampleStatus.SUSPENDED, None],
            )
            self.assertIsInstance(records[0].status, ExampleStatus)
            self.assertEqual(
                db.scalar(
                    select(EnumRecord.status).where(EnumRecord.status == "active")
                ),
                ExampleStatus.ACTIVE,
            )

            db.add(EnumRecord(status="unknown"))  # type: ignore[arg-type]
            with self.assertRaises(StatementError) as raised:
                db.flush()
            self.assertIsInstance(raised.exception.orig, ValueError)
            db.rollback()
            self.assertEqual(db.scalar(select(func.count(EnumRecord.id))), 3)

    def test_unknown_database_value_fails_on_read(self):
        with self.engine.begin() as connection:
            connection.execute(
                text("INSERT INTO enum_record (id, status) VALUES (1, 'corrupt')")
            )

        with Session(self.engine) as db:
            with self.assertRaisesRegex(ValueError, "Database value 'corrupt'"):
                db.scalar(select(EnumRecord))

    def test_compiles_to_varchar_and_exposes_python_type(self):
        enum_type = EnumRecord.__table__.c.status.type
        self.assertIsInstance(enum_type, StrEnumType)
        self.assertIs(enum_type.python_type, ExampleStatus)
        self.assertEqual(enum_type.length, 50)
        ddl = str(CreateTable(EnumRecord.__table__).compile(dialect=postgresql.dialect()))
        self.assertIn("VARCHAR(50)", ddl)
        self.assertNotIn("CREATE TYPE", ddl)

    def test_all_mapped_enum_columns_use_str_enum_type(self):
        column_count = 0
        for model, column_names in ENUM_COLUMNS.items():
            for column_name in column_names:
                with self.subTest(model=model.__name__, column=column_name):
                    column_type = model.__table__.c[column_name].type
                    self.assertIsInstance(column_type, StrEnumType)
                    self.assertIsInstance(column_type.impl, String)
                    self.assertEqual(column_type.length, 50)
                    column_count += 1
        self.assertEqual(column_count, 23)


if __name__ == "__main__":
    unittest.main()
