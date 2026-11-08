"""Pricing for informational portions and extras, not purchase customizations."""
from decimal import Decimal
from sqlalchemy import Numeric, case, cast, exists, func, select
from services.product_pricing import discounted_product_price
from core.errors import AppHTTPException


def starting_price(product):
    portions = [item for item in getattr(product, "pricing_options", []) if item.kind == "portion"]
    if not portions:
        return discounted_product_price(product)
    return min((item.price for item in portions if item.is_available), default=None)


def has_available_portion(product):
    portions = [item for item in getattr(product, "pricing_options", []) if item.kind == "portion"]
    return not portions or any(item.is_available for item in portions)


def starting_price_expression(*, discount_legacy=True):
    from models import Product, ProductPricingOption
    portion = ProductPricingOption
    has_portions = exists(select(portion.id).where(portion.product_id == Product.id, portion.kind == "portion"))
    cheapest = select(func.min(portion.price)).where(
        portion.product_id == Product.id, portion.kind == "portion", portion.is_available.is_(True),
    ).correlate(Product).scalar_subquery()
    legacy = cast(func.round(Product.price * (1 - func.coalesce(Product.discount_percentage, 0) / Decimal("100")), 2), Numeric(10, 2))
    return case((has_portions, cheapest), else_=legacy if discount_legacy else Product.price)


def pricing_responses(product, locale="pt-PT", admin=False):
    from schemas.pricing import AdminExtraResponse, AdminPortionResponse, ExtraResponse, PortionResponse
    portions, extras = [], []
    for option in getattr(product, "pricing_options", []):
        translated = {item.locale: {"name": item.name} for item in option.translations}
        label = (translated.get(locale, {}).get("name") or option.label) if locale != "pt-PT" else option.label
        data = dict(id=option.id, label=label, display_order=option.display_order, is_available=option.is_available)
        if admin:
            data["label"] = option.label
            data["translations"] = translated
        if option.kind == "portion":
            portions.append((AdminPortionResponse if admin else PortionResponse)(**data, price=float(option.price)))
        else:
            extras.append((AdminExtraResponse if admin else ExtraResponse)(**data, type=option.kind, price_delta=float(option.price)))
    return portions, extras


def sync_pricing_options(db, product, portions, extras):
    from models import ProductPricingOption, ProductPricingOptionTranslation
    groups = [(portions, True), (extras, False)]
    existing = {item.id: item for item in product.pricing_options}
    # Verify all ownership/type constraints before changing any option.
    for values, is_portion in groups:
        for value in values or []:
            old = existing.get(value.id)
            if value.id is not None and (old is None or (old.kind == "portion") != is_portion):
                raise AppHTTPException(status_code=422, error="invalid_pricing_option", message="Pricing option does not belong to this product and group.")
    for values, is_portion in groups:
        if values is None:
            continue
        retained = [item for item in product.pricing_options if (item.kind == "portion") != is_portion]
        ordered = sorted(enumerate(values), key=lambda pair: (pair[1].display_order if pair[1].display_order is not None else pair[0], pair[0]))
        for order, (_, value) in enumerate(ordered):
            option = existing.get(value.id) or ProductPricingOption()
            option.label = value.label
            option.price = value.price if is_portion else value.price_delta
            option.kind = "portion" if is_portion else value.type
            option.display_order = order
            option.is_available = value.is_available
            translations = {item.locale: item for item in option.translations}
            for locale, text in value.translations.items():
                if text is None or not text.name:
                    translations.pop(locale, None)
                else:
                    row = translations.get(locale) or ProductPricingOptionTranslation(locale=locale)
                    row.name = text.name
                    translations[locale] = row
            option.translations = list(translations.values())
            retained.append(option)
        product.pricing_options = retained
    db.flush()
