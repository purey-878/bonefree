from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from dependencies import require_role
from services.auth_service import SUPER_ADMIN_ROLE
from database import get_db
from schemas.enums import EntityStatus
from models import Admin, Product
from core.rate_limit import RATE_LIMIT_OPENAPI_RESPONSES
from core.errors import AppHTTPException
from schemas.site_settings import (
    ChefSpecialSettings,
    CompanyDetailsSettings,
    EventsSettings,
    LoyaltyCouponSettings,
    OrganizationProfileResponse,
    OrganizationProfileUpdate,
    SiteThemeResponse,
    SiteThemeSettings,
    SocialMediaSettings,
)
from services.site_settings import (
    get_chef_special_settings,
    get_company_details_settings,
    get_events_settings,
    get_loyalty_coupon_settings,
    get_organization_profile,
    get_social_media_settings,
    get_site_theme,
    save_chef_special_settings,
    save_company_details_settings,
    save_events_settings,
    save_loyalty_coupon_settings,
    save_organization_profile,
    save_social_media_settings,
    save_site_theme,
)


public_router = APIRouter(prefix="/site-settings", tags=["Site Settings"])
admin_router = APIRouter(
    prefix="/admin/site-settings",
    tags=["Site Settings"],
    responses=RATE_LIMIT_OPENAPI_RESPONSES,
)


@public_router.get(
    "/theme",
    response_model=SiteThemeResponse,
    operation_id="site_settings_read_public_site_theme",
)
def read_public_site_theme(db: Session = Depends(get_db)):
    return get_site_theme(db)


@public_router.get(
    "/chef-special",
    response_model=ChefSpecialSettings,
    operation_id="site_settings_read_public_chef_special",
)
def read_public_chef_special(db: Session = Depends(get_db)):
    return get_chef_special_settings(db)


@public_router.get(
    "/loyalty-coupons",
    response_model=LoyaltyCouponSettings,
    operation_id="site_settings_read_public_loyalty_coupon_settings",
)
def read_public_loyalty_coupon_settings(db: Session = Depends(get_db)):
    return get_loyalty_coupon_settings(db)


@public_router.get(
    "/company-details",
    response_model=CompanyDetailsSettings,
    operation_id="site_settings_read_public_company_details",
)
def read_public_company_details(db: Session = Depends(get_db)):
    return get_company_details_settings(db)


@public_router.get(
    "/social-media",
    response_model=SocialMediaSettings,
    operation_id="site_settings_read_public_social_media",
)
def read_public_social_media(db: Session = Depends(get_db)):
    return get_social_media_settings(db)


@public_router.get(
    "/events",
    response_model=EventsSettings,
    operation_id="site_settings_read_public_events",
)
def read_public_events(db: Session = Depends(get_db)):
    return get_events_settings(db)


@admin_router.get(
    "/theme",
    response_model=SiteThemeResponse,
    operation_id="site_settings_read_admin_site_theme",
)
def read_admin_site_theme(
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return get_site_theme(db)


@admin_router.put(
    "/theme",
    response_model=SiteThemeResponse,
    operation_id="site_settings_update_admin_site_theme",
)
def update_admin_site_theme(
    settings: SiteThemeSettings,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return save_site_theme(db, settings)


@admin_router.get(
    "/chef-special",
    response_model=ChefSpecialSettings,
    operation_id="site_settings_read_admin_chef_special",
)
def read_admin_chef_special(
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return get_chef_special_settings(db)


@admin_router.put(
    "/chef-special",
    response_model=ChefSpecialSettings,
    operation_id="site_settings_update_admin_chef_special",
)
def update_admin_chef_special(
    settings: ChefSpecialSettings,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    if settings.product_id:
        product = db.scalar(
            select(Product).where(
                Product.product_id == settings.product_id,
                or_(Product.status == EntityStatus.ACTIVE, Product.status.is_(None)),
                Product.deleted_at.is_(None),
            ).limit(1)
        )
        if not product:
            raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})
    return save_chef_special_settings(db, settings)


@admin_router.get(
    "/loyalty-coupons",
    response_model=LoyaltyCouponSettings,
    operation_id="site_settings_read_admin_loyalty_coupon_settings",
)
def read_admin_loyalty_coupon_settings(
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return get_loyalty_coupon_settings(db)


@admin_router.put(
    "/loyalty-coupons",
    response_model=LoyaltyCouponSettings,
    operation_id="site_settings_update_admin_loyalty_coupon_settings",
)
def update_admin_loyalty_coupon_settings(
    settings: LoyaltyCouponSettings,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return save_loyalty_coupon_settings(db, settings)


@admin_router.get(
    "/company-details",
    response_model=CompanyDetailsSettings,
    operation_id="site_settings_read_admin_company_details",
)
def read_admin_company_details(
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return get_company_details_settings(db)


@admin_router.put(
    "/company-details",
    response_model=CompanyDetailsSettings,
    operation_id="site_settings_update_admin_company_details",
)
def update_admin_company_details(
    settings: CompanyDetailsSettings,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return save_company_details_settings(db, settings)


@admin_router.get(
    "/social-media",
    response_model=SocialMediaSettings,
    operation_id="site_settings_read_admin_social_media",
)
def read_admin_social_media(
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return get_social_media_settings(db)


@admin_router.put(
    "/social-media",
    response_model=SocialMediaSettings,
    operation_id="site_settings_update_admin_social_media",
)
def update_admin_social_media(
    settings: SocialMediaSettings,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return save_social_media_settings(db, settings)


@admin_router.get(
    "/organization-profile",
    response_model=OrganizationProfileResponse,
    operation_id="site_settings_read_admin_organization_profile",
)
def read_admin_organization_profile(
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return get_organization_profile(db)


@admin_router.patch(
    "/organization-profile",
    response_model=OrganizationProfileResponse,
    operation_id="site_settings_update_admin_organization_profile",
)
def update_admin_organization_profile(
    settings: OrganizationProfileUpdate,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return save_organization_profile(db, settings)


@admin_router.get(
    "/events",
    response_model=EventsSettings,
    operation_id="site_settings_read_admin_events",
)
def read_admin_events(
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return get_events_settings(db)


@admin_router.put(
    "/events",
    response_model=EventsSettings,
    operation_id="site_settings_update_admin_events",
)
def update_admin_events(
    settings: EventsSettings,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return save_events_settings(db, settings)
