"""Meal Finder switch storage, plus preserved historical metadata tables."""
from sqlalchemy import CheckConstraint, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class MealFinderSettings(Base):
    __tablename__ = 'meal_finder_settings'
    __table_args__ = (CheckConstraint('id = 1', name='ck_meal_finder_singleton'),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    config: Mapped[dict] = mapped_column(JSON, nullable=False)


class ProductMealFinder(Base):
    """Historical records only. Fixed recommendations do not read this table."""
    __tablename__ = 'product_meal_finder'
    product_id: Mapped[int] = mapped_column(ForeignKey('product.id', ondelete='CASCADE'), primary_key=True)
    attributes: Mapped[dict] = mapped_column(JSON, nullable=False)
