from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from core.errors import AppHTTPException
from core.organizations import normalize_hostname
from database import get_db
from models import Organization, OrganizationDomain
from schemas.organization import ResolvedOrganizationResponse


router = APIRouter(prefix="/public/organizations", tags=["Organizations"])


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
        )
        .execution_options(skip_organization_scope=True)
    )
    if organization is None:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="organization_not_found",
            message="Organization not found.",
            details={"hostname": normalized_hostname},
        )

    return ResolvedOrganizationResponse(slug=organization.slug, name=organization.name)
