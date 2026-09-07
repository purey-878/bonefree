from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.errors import AppHTTPException
from database import get_db
from modules.auth.dependencies import require_organization_header_context, require_organization_role as require_role
from modules.auth.models import Organization, OrganizationLegalDocument, User, UserRole
from modules.auth.schemas.legal_documents import (
    LegalDocumentListResponse, LegalDocumentResponse, LegalDocumentType,
    LegalDocumentWrite, LegalLocale, PublicLegalDocumentResponse,
)
from modules.auth.services.legal_documents import organization_variables

admin_router = APIRouter(prefix="/admin/legal-documents", tags=["Legal Documents"])
public_router = APIRouter(prefix="/public/legal-documents", tags=["Legal Documents"])


@admin_router.get("", response_model=LegalDocumentListResponse, operation_id="legal_documents_list_admin")
def list_documents(db: Session = Depends(get_db), owner: User = Depends(require_role(UserRole.OWNER))):
    documents = db.scalars(select(OrganizationLegalDocument).order_by(OrganizationLegalDocument.document_type, OrganizationLegalDocument.locale)).all()
    return LegalDocumentListResponse(items=[LegalDocumentResponse.model_validate(item) for item in documents], **organization_variables(db))


@admin_router.put("/{document_type}/{locale}", response_model=LegalDocumentResponse, operation_id="legal_documents_publish")
def publish_document(document_type: LegalDocumentType, locale: LegalLocale, body: LegalDocumentWrite,
                     db: Session = Depends(get_db), owner: User = Depends(require_role(UserRole.OWNER))):
    # Serialise first publication as well as subsequent updates for this tenant.
    db.scalar(select(Organization.id).where(Organization.id == owner.organization_id).with_for_update())
    document = db.scalar(select(OrganizationLegalDocument).where(
        OrganizationLegalDocument.document_type == document_type, OrganizationLegalDocument.locale == locale,
    ))
    if document is None:
        document = OrganizationLegalDocument(document_type=document_type, locale=locale)
        db.add(document)
    for key, value in body.model_dump(exclude_none=True, by_alias=True).items():
        setattr(document, key, value)
    db.commit()
    db.refresh(document)
    return LegalDocumentResponse.model_validate(document)


@public_router.get("/{document_type}", response_model=PublicLegalDocumentResponse, operation_id="legal_documents_read_public")
def read_document(document_type: LegalDocumentType, response: Response, locale: LegalLocale = "en-GB",
                  organization_id: int = Depends(require_organization_header_context), db: Session = Depends(get_db)):
    documents = db.scalars(select(OrganizationLegalDocument).where(
        OrganizationLegalDocument.document_type == document_type,
        OrganizationLegalDocument.locale.in_({locale, "en-GB"}),
    )).all()
    by_locale = {item.locale: item for item in documents}
    document = by_locale.get(locale) or by_locale.get("en-GB")
    if document is None:
        raise AppHTTPException(status_code=404, error="legal_document_not_found", message="Legal document not found.")
    response.headers["Cache-Control"] = "no-store"
    return PublicLegalDocumentResponse(document=LegalDocumentResponse.model_validate(document),
        requested_locale=locale, is_fallback=document.locale != locale, **organization_variables(db))
