from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from modules.auth.dependencies import require_organization_feature, require_organization_role
from modules.auth.models import User, UserRole
from database import get_db
from modules.restaurant.models import EntityStatus
from modules.restaurant.models import Product
from core.rate_limit import RATE_LIMIT_OPENAPI_RESPONSES
from core.errors import AppHTTPException
from modules.restaurant.schemas.site_settings import (
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
from modules.restaurant.services.site_settings import (
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
owner_router = APIRouter(
    prefix="/admin/site-settings",
    tags=["Site Settings"],
    responses=RATE_LIMIT_OPENAPI_RESPONSES,
)
OWNER_SITE_SETTINGS_CONTEXT = Depends(require_organization_role(UserRole.OWNER))


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
    dependencies=[Depends(require_organization_feature("catalog"))],
)
def read_public_chef_special(db: Session = Depends(get_db)):
    return get_chef_special_settings(db)


@public_router.get(
    "/loyalty-coupons",
    response_model=LoyaltyCouponSettings,
    operation_id="site_settings_read_public_loyalty_coupon_settings",
    dependencies=[Depends(require_organization_feature("loyalty"))],
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
    dependencies=[Depends(require_organization_feature("events"))],
)
def read_public_events(db: Session = Depends(get_db)):
    return get_events_settings(db)


@owner_router.get(
    "/theme",
    response_model=SiteThemeResponse,
    operation_id="site_settings_read_admin_site_theme",
    summary="Read Admin Site Theme",
)
def read_owner_site_theme(
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return get_site_theme(db)


@owner_router.put(
    "/theme",
    response_model=SiteThemeResponse,
    operation_id="site_settings_update_admin_site_theme",
    summary="Update Admin Site Theme",
)
def update_owner_site_theme(
    settings: SiteThemeSettings,
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return save_site_theme(db, settings)


@owner_router.get(
    "/chef-special",
    response_model=ChefSpecialSettings,
    operation_id="site_settings_read_admin_chef_special",
    summary="Read Admin Chef Special",
    dependencies=[OWNER_SITE_SETTINGS_CONTEXT, Depends(require_organization_feature("catalog"))],
)
def read_owner_chef_special(
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return get_chef_special_settings(db)


@owner_router.put(
    "/chef-special",
    response_model=ChefSpecialSettings,
    operation_id="site_settings_update_admin_chef_special",
    summary="Update Admin Chef Special",
    dependencies=[OWNER_SITE_SETTINGS_CONTEXT, Depends(require_organization_feature("catalog"))],
)
def update_owner_chef_special(
    settings: ChefSpecialSettings,
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
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


@owner_router.get(
    "/loyalty-coupons",
    response_model=LoyaltyCouponSettings,
    operation_id="site_settings_read_admin_loyalty_coupon_settings",
    summary="Read Admin Loyalty Coupon Settings",
    dependencies=[OWNER_SITE_SETTINGS_CONTEXT, Depends(require_organization_feature("loyalty"))],
)
def read_owner_loyalty_coupon_settings(
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return get_loyalty_coupon_settings(db)


@owner_router.put(
    "/loyalty-coupons",
    response_model=LoyaltyCouponSettings,
    operation_id="site_settings_update_admin_loyalty_coupon_settings",
    summary="Update Admin Loyalty Coupon Settings",
    dependencies=[OWNER_SITE_SETTINGS_CONTEXT, Depends(require_organization_feature("loyalty"))],
)
def update_owner_loyalty_coupon_settings(
    settings: LoyaltyCouponSettings,
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return save_loyalty_coupon_settings(db, settings)


@owner_router.get(
    "/company-details",
    response_model=CompanyDetailsSettings,
    operation_id="site_settings_read_admin_company_details",
    summary="Read Admin Company Details",
)
def read_owner_company_details(
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return get_company_details_settings(db)


@owner_router.put(
    "/company-details",
    response_model=CompanyDetailsSettings,
    operation_id="site_settings_update_admin_company_details",
    summary="Update Admin Company Details",
)
def update_owner_company_details(
    settings: CompanyDetailsSettings,
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return save_company_details_settings(db, settings)


@owner_router.get(
    "/social-media",
    response_model=SocialMediaSettings,
    operation_id="site_settings_read_admin_social_media",
    summary="Read Admin Social Media",
)
def read_owner_social_media(
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return get_social_media_settings(db)


@owner_router.put(
    "/social-media",
    response_model=SocialMediaSettings,
    operation_id="site_settings_update_admin_social_media",
    summary="Update Admin Social Media",
)
def update_owner_social_media(
    settings: SocialMediaSettings,
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return save_social_media_settings(db, settings)


@owner_router.get(
    "/organization-profile",
    response_model=OrganizationProfileResponse,
    operation_id="site_settings_read_admin_organization_profile",
    summary="Read Admin Organization Profile",
)
def read_owner_organization_profile(
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return get_organization_profile(db)


@owner_router.patch(
    "/organization-profile",
    response_model=OrganizationProfileResponse,
    operation_id="site_settings_update_admin_organization_profile",
    summary="Update Admin Organization Profile",
)
def update_owner_organization_profile(
    settings: OrganizationProfileUpdate,
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return save_organization_profile(db, settings)


@owner_router.get(
    "/events",
    response_model=EventsSettings,
    operation_id="site_settings_read_admin_events",
    summary="Read Admin Events",
    dependencies=[OWNER_SITE_SETTINGS_CONTEXT, Depends(require_organization_feature("events"))],
)
def read_owner_events(
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return get_events_settings(db)


@owner_router.put(
    "/events",
    response_model=EventsSettings,
    operation_id="site_settings_update_admin_events",
    summary="Update Admin Events",
    dependencies=[OWNER_SITE_SETTINGS_CONTEXT, Depends(require_organization_feature("events"))],
)
def update_owner_events(
    settings: EventsSettings,
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    return save_events_settings(db, settings)
