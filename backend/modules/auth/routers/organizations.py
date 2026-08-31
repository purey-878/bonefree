from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from core.errors import AppHTTPException
from core.organizations import normalize_hostname
from database import get_db
from modules.auth.dependencies import require_organization_header_context
from modules.auth.models import (
    Organization,
    OrganizationDomain,
    OrganizationExperience,
    OrganizationFeatureEntitlement,
    OrganizationProfile,
)
from modules.auth.services.organization_lifecycle import (
    OrganizationAccessState,
    data_access_expires_at,
    organization_access_state,
)
from modules.auth.schemas.organization import (
    PageConfiguration,
    PublicExperienceConfiguration,
    PublicOrganizationExperienceResponse,
    PublicOrganizationIdentity,
    PublicOrganizationProfile,
    PublicThemeConfiguration,
    ResolvedOrganizationResponse,
)


router = APIRouter(prefix="/public/organizations", tags=["Organizations"])
experience_router = APIRouter(prefix="/public", tags=["Organizations"])


@router.get(
    "/resolve",
    response_model=ResolvedOrganizationResponse,
    operation_id="organizations_resolve",
)
def resolve_organization(
    hostname: str,
    db: DBSession = Depends(get_db),
) -> ResolvedOrganizationResponse:
    try:
        normalized_hostname = normalize_hostname(hostname)
    except ValueError as exc:
        raise AppHTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error="invalid_hostname",
            message=str(exc),
            details={"hostname": hostname},
        ) from exc

    organization = db.scalar(
        select(Organization)
        .join(OrganizationDomain)
        .where(
            OrganizationDomain.domain == normalized_hostname,
            OrganizationDomain.is_verified.is_(True),
            OrganizationDomain.deactivated_at.is_(None),
            Organization.purged_at.is_(None),
        )
        .execution_options(skip_organization_scope=True)
    )
    if organization is None or organization_access_state(organization) not in {
        OrganizationAccessState.OPERATIONAL,
        OrganizationAccessState.FROZEN,
    }:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="organization_not_found",
            message="Organization not found.",
            details={"hostname": normalized_hostname},
        )

    access_state = organization_access_state(organization)
    return ResolvedOrganizationResponse(
        slug=organization.slug,
        name=organization.name,
        state=access_state.value,
        data_access_expires_at=(
            data_access_expires_at(organization)
            if access_state == OrganizationAccessState.FROZEN
            else None
        ),
    )


@experience_router.get(
    "/organization-experience",
    response_model=PublicOrganizationExperienceResponse,
    operation_id="organizations_get_public_experience",
)
def get_public_organization_experience(
    organization_id: int = Depends(require_organization_header_context),
    db: DBSession = Depends(get_db),
) -> PublicOrganizationExperienceResponse:
    organization = db.scalar(
        select(Organization).where(Organization.id == organization_id)
    )
    profile = db.scalar(select(OrganizationProfile))
    experience = db.scalar(select(OrganizationExperience))
    capabilities = db.scalars(
        select(OrganizationFeatureEntitlement.feature_key)
        .where(OrganizationFeatureEntitlement.enabled.is_(True))
        .order_by(OrganizationFeatureEntitlement.feature_key)
    ).all()

    if organization is None or profile is None or experience is None:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="organization_experience_not_configured",
            message="Organization experience is not configured.",
        )

    try:
        pages = {
            key: PageConfiguration.model_validate(value)
            for key, value in (experience.pages or {}).items()
        }
        return PublicOrganizationExperienceResponse(
            schema_version=experience.schema_version,
            organization=PublicOrganizationIdentity(
                slug=organization.slug,
                name=organization.name,
            ),
            profile=PublicOrganizationProfile(
                display_name=profile.display_name,
                description=profile.description,
                about_text=profile.about_text,
                email=profile.email,
                privacy_contact_email=profile.privacy_contact_email,
                phone=profile.phone,
                address_line_1=profile.address_line_1,
                address_line_2=profile.address_line_2,
                city=profile.city,
                postal_code=profile.postal_code,
                country=profile.country,
                logo_url=profile.logo_url,
                currency_code=profile.currency_code,
                opening_hours=profile.opening_hours or {},
                social_links=profile.social_links or {},
            ),
            capabilities=list(capabilities),
            experience=PublicExperienceConfiguration(
                theme=PublicThemeConfiguration(
                    key=experience.theme_key,
                    mode=experience.theme_mode,
                    decoration_preset=experience.decoration_preset,
                    token_overrides=experience.token_overrides or {},
                ),
                assets=experience.assets or {},
                navigation=experience.navigation or [],
                pages=pages,
                variant_overrides=experience.variant_overrides or {},
            ),
        )
    except (TypeError, ValueError) as exc:
        raise AppHTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error="organization_experience_invalid",
            message="Organization experience is invalid.",
        ) from exc
