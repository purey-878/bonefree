from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from auth import require_super_admin
from database import get_db
from models import Admin, Produto
from schemas.site_settings import (
    ChefSpecialSettings,
    CompanyDetailsSettings,
    EventsSettings,
    LoyaltyCouponSettings,
    SiteThemeResponse,
    SiteThemeSettings,
    SocialMediaSettings,
)
from services.site_settings import (
    get_chef_special_settings,
    get_company_details_settings,
    get_events_settings,
    get_loyalty_coupon_settings,
    get_social_media_settings,
    get_site_theme,
    save_chef_special_settings,
    save_company_details_settings,
    save_events_settings,
    save_loyalty_coupon_settings,
    save_social_media_settings,
    save_site_theme,
)


public_router = APIRouter(prefix="/site-settings", tags=["Site Settings"])
admin_router = APIRouter(prefix="/admin/site-settings", tags=["Site Settings"])


@public_router.get("/theme", response_model=SiteThemeResponse)
def read_public_site_theme(db: Session = Depends(get_db)):
    return get_site_theme(db)


@public_router.get("/chef-special", response_model=ChefSpecialSettings)
def read_public_chef_special(db: Session = Depends(get_db)):
    return get_chef_special_settings(db)


@public_router.get("/loyalty-coupons", response_model=LoyaltyCouponSettings)
def read_public_loyalty_coupon_settings(db: Session = Depends(get_db)):
    return get_loyalty_coupon_settings(db)


@public_router.get("/company-details", response_model=CompanyDetailsSettings)
def read_public_company_details(db: Session = Depends(get_db)):
    return get_company_details_settings(db)


@public_router.get("/social-media", response_model=SocialMediaSettings)
def read_public_social_media(db: Session = Depends(get_db)):
    return get_social_media_settings(db)


@public_router.get("/events", response_model=EventsSettings)
def read_public_events(db: Session = Depends(get_db)):
    return get_events_settings(db)


@admin_router.get("/theme", response_model=SiteThemeResponse)
def read_admin_site_theme(
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    return get_site_theme(db)


@admin_router.put("/theme", response_model=SiteThemeResponse)
def update_admin_site_theme(
    settings: SiteThemeSettings,
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    return save_site_theme(db, settings)


@admin_router.get("/chef-special", response_model=ChefSpecialSettings)
def read_admin_chef_special(
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    return get_chef_special_settings(db)


@admin_router.put("/chef-special", response_model=ChefSpecialSettings)
def update_admin_chef_special(
    settings: ChefSpecialSettings,
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    if settings.product_id:
        product = (
            db.query(Produto)
            .filter(
                Produto.id_produto == settings.product_id,
                or_(Produto.status == 1, Produto.status.is_(None)),
                Produto.deleted_at.is_(None),
            )
            .first()
        )
        if not product:
            raise HTTPException(status_code=404, detail="Produto especial do chef não encontrado.")
    return save_chef_special_settings(db, settings)


@admin_router.get("/loyalty-coupons", response_model=LoyaltyCouponSettings)
def read_admin_loyalty_coupon_settings(
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    return get_loyalty_coupon_settings(db)


@admin_router.put("/loyalty-coupons", response_model=LoyaltyCouponSettings)
def update_admin_loyalty_coupon_settings(
    settings: LoyaltyCouponSettings,
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    return save_loyalty_coupon_settings(db, settings)


@admin_router.get("/company-details", response_model=CompanyDetailsSettings)
def read_admin_company_details(
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    return get_company_details_settings(db)


@admin_router.put("/company-details", response_model=CompanyDetailsSettings)
def update_admin_company_details(
    settings: CompanyDetailsSettings,
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    return save_company_details_settings(db, settings)


@admin_router.get("/social-media", response_model=SocialMediaSettings)
def read_admin_social_media(
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    return get_social_media_settings(db)


@admin_router.put("/social-media", response_model=SocialMediaSettings)
def update_admin_social_media(
    settings: SocialMediaSettings,
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    return save_social_media_settings(db, settings)


@admin_router.get("/events", response_model=EventsSettings)
def read_admin_events(
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    return get_events_settings(db)


@admin_router.put("/events", response_model=EventsSettings)
def update_admin_events(
    settings: EventsSettings,
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    return save_events_settings(db, settings)
