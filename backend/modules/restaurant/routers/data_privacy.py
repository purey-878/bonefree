from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from core.config import settings
from core.errors import AppHTTPException
from database import get_db
from modules.auth.dependencies import require_organization_role
from modules.auth.models import (
    DataExport,
    DataExportKind,
    DataExportStatus,
    Organization,
    OrganizationProfile,
    User,
    UserRole,
)
from modules.restaurant.schemas.privacy import (
    DataExportCreate,
    DataExportListResponse,
    DataExportResponse,
    PrivacyOverviewResponse,
)
from modules.restaurant.services.data_exports import (
    delete_data_export_file,
    enqueue_data_export,
    export_download_path,
    process_data_export,
)
from utils.datetime_utils import to_naive_utc


admin_router = APIRouter(prefix="/admin", tags=["Data and Privacy"])
BULK_EXPORT_KINDS = frozenset(
    {
        DataExportKind.TENANT,
        DataExportKind.CUSTOMERS,
        DataExportKind.ORDERS,
        DataExportKind.CATALOG,
        DataExportKind.MEDIA,
    }
)


def _now() -> datetime:
    return to_naive_utc(datetime.now(UTC)) or datetime.utcnow()


def _export_response(export: DataExport) -> DataExportResponse:
    path_exists = bool(export.storage_path and Path(export.storage_path).is_file())
    can_download = bool(
        export.status == DataExportStatus.READY
        and export.expires_at is not None
        and export.expires_at > _now()
        and path_exists
    )
    return DataExportResponse(
        export_id=export.public_id,
        kind=export.kind,
        status=export.status,
        customer_id=export.customer_id,
        file_name=export.file_name,
        sha256=export.sha256,
        created_at=export.created_at,
        completed_at=export.completed_at,
        expires_at=export.expires_at,
        downloaded_at=export.downloaded_at,
        can_download=can_download,
        error_message=(
            "Export generation failed."
            if export.status == DataExportStatus.FAILED
            else None
        ),
    )


def _list_exports(db: Session) -> DataExportListResponse:
    if settings.environment == "development":
        pending_exports = db.scalars(
            select(DataExport)
            .where(DataExport.status == DataExportStatus.PENDING)
            .order_by(DataExport.created_at, DataExport.id)
        ).all()
        pending_by_subject: dict[tuple[DataExportKind, int | None], DataExport] = {}
        for pending_export in pending_exports:
            key = (pending_export.kind, pending_export.customer_id)
            if key in pending_by_subject:
                # Old local versions could create one pending row per click.
                # Pending rows have no file, so keep only the first request.
                db.delete(pending_export)
                continue
            pending_by_subject[key] = pending_export
        db.flush()
        for pending_export in pending_by_subject.values():
            try:
                process_data_export(db, pending_export)
            except Exception:
                # process_data_export records the failure. Keep listing the
                # remaining items so the local UI can explain each outcome.
                continue
    exports = db.scalars(select(DataExport).order_by(DataExport.created_at.desc())).all()
    return DataExportListResponse(items=[_export_response(item) for item in exports])


def _create_export(
    db: Session,
    owner: User,
    kind: DataExportKind,
    customer_id: int | None = None,
) -> DataExportResponse:
    if kind == DataExportKind.CUSTOMER:
        if customer_id is None or db.scalar(
            select(User.id).where(User.id == customer_id, User.role == UserRole.CLIENT)
        ) is None:
            raise AppHTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                error="customer_not_found",
                message="Customer not found.",
            )

    # Serialize export creation per organization so repeated clicks, multiple
    # tabs, or concurrent requests cannot queue the same work more than once.
    db.scalar(
        select(Organization.id)
        .where(Organization.id == owner.organization_id)
        .with_for_update()
    )
    customer_filter = (
        DataExport.customer_id.is_(None)
        if customer_id is None
        else DataExport.customer_id == customer_id
    )
    existing = db.scalar(
        select(DataExport)
        .where(
            DataExport.organization_id == owner.organization_id,
            DataExport.kind == kind,
            customer_filter,
            DataExport.status.in_((DataExportStatus.PENDING, DataExportStatus.PROCESSING)),
        )
        .order_by(DataExport.created_at, DataExport.id)
    )
    if existing is not None:
        if settings.environment == "development" and existing.status == DataExportStatus.PENDING:
            existing = process_data_export(db, existing)
        return _export_response(existing)

    # Reuse a complete copy throughout its 24-hour window. For an individual
    # customer, reuse the ready file until the owner downloads it. This keeps
    # repeated clicks from creating multiple copies of the same personal data.
    ready_filters = [
        DataExport.organization_id == owner.organization_id,
        DataExport.kind == kind,
        customer_filter,
        DataExport.status == DataExportStatus.READY,
        DataExport.expires_at.is_not(None),
        DataExport.expires_at > _now(),
    ]
    if kind == DataExportKind.CUSTOMER:
        ready_filters.append(DataExport.downloaded_at.is_(None))
    ready_exports = db.scalars(
        select(DataExport)
        .where(*ready_filters)
        .order_by(DataExport.completed_at.desc(), DataExport.id.desc())
    ).all()
    for ready_export in ready_exports:
        if export_download_path(ready_export) is not None:
            return _export_response(ready_export)
        ready_export.status = DataExportStatus.EXPIRED
        ready_export.storage_path = None

    if kind in BULK_EXPORT_KINDS:
        conflicting_kinds = (
            BULK_EXPORT_KINDS - {kind}
            if kind == DataExportKind.TENANT
            else {DataExportKind.TENANT}
        )
        blocking_kinds = conflicting_kinds | {kind}
        conflicting_export = db.scalar(
            select(DataExport.id).where(
                DataExport.organization_id == owner.organization_id,
                DataExport.kind.in_(blocking_kinds),
                or_(
                    DataExport.status.in_((DataExportStatus.PENDING, DataExportStatus.PROCESSING)),
                    (
                        (DataExport.status == DataExportStatus.READY)
                        & (DataExport.expires_at.is_not(None))
                        & (DataExport.expires_at > _now())
                    ),
                    (
                        (DataExport.status == DataExportStatus.CANCELLED)
                        & (DataExport.expires_at.is_not(None))
                        & (DataExport.expires_at > _now())
                    ),
                ),
            )
        )
        if conflicting_export is not None:
            raise AppHTTPException(
                status_code=status.HTTP_409_CONFLICT,
                error="data_export_daily_limit",
                message="This data selection is unavailable until the current 24-hour export window ends.",
            )

    export = enqueue_data_export(
        db,
        organization_id=owner.organization_id,
        kind=kind,
        requested_by_user_id=owner.id,
        customer_id=customer_id,
    )
    if settings.environment == "development":
        return _export_response(process_data_export(db, export))
    db.commit()
    db.refresh(export)
    return _export_response(export)


def _regenerate_export(db: Session, owner: User, export_id: str) -> DataExportResponse:
    previous = db.scalar(select(DataExport).where(DataExport.public_id == export_id))
    if previous is None:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="data_export_not_found",
            message="Data export not found.",
        )
    return _create_export(db, owner, previous.kind, previous.customer_id)


def _cancel_export(db: Session, owner: User, export_id: str) -> DataExportResponse:
    export = db.scalar(
        select(DataExport)
        .where(
            DataExport.public_id == export_id,
            DataExport.organization_id == owner.organization_id,
        )
        .with_for_update()
    )
    if export is None:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="data_export_not_found",
            message="Data export not found.",
        )
    if export.status == DataExportStatus.CANCELLED:
        return _export_response(export)
    if export.status not in (
        DataExportStatus.PENDING,
        DataExportStatus.PROCESSING,
        DataExportStatus.READY,
    ):
        raise AppHTTPException(
            status_code=status.HTTP_409_CONFLICT,
            error="data_export_cannot_be_cancelled",
            message="Only queued, processing, or downloadable exports can be cancelled.",
        )

    delete_data_export_file(export)
    if export.expires_at is None:
        export.expires_at = export.created_at + timedelta(hours=24)
    export.status = DataExportStatus.CANCELLED
    export.error_message = None
    db.commit()
    db.refresh(export)
    return _export_response(export)


def _download_export(db: Session, export_id: str) -> FileResponse:
    export = db.scalar(select(DataExport).where(DataExport.public_id == export_id))
    if export is None:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="data_export_not_found",
            message="Data export not found.",
        )
    path = export_download_path(export)
    if path is None:
        db.commit()
        raise AppHTTPException(
            status_code=status.HTTP_410_GONE,
            error="data_export_unavailable",
            message="The data export is not ready or has expired.",
        )
    export.downloaded_at = _now()
    db.commit()
    return FileResponse(
        path,
        media_type="application/zip",
        filename=export.file_name or path.name,
        headers={"Cache-Control": "private, no-store"},
    )


def _privacy_overview(db: Session) -> PrivacyOverviewResponse:
    profile = db.scalar(select(OrganizationProfile))
    organization_id = db.info.get("organization_id")
    organization = db.scalar(select(Organization).where(Organization.id == organization_id))
    return PrivacyOverviewResponse(
        privacy_contact_email=profile.privacy_contact_email if profile else None,
        access_expires_at=organization.access_expires_at if organization else None,
    )


@admin_router.get(
    "/data-privacy",
    response_model=PrivacyOverviewResponse,
    operation_id="admin_data_privacy_read_overview",
)
def read_admin_privacy_overview(
    _owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
) -> PrivacyOverviewResponse:
    return _privacy_overview(db)


@admin_router.get(
    "/data-exports",
    response_model=DataExportListResponse,
    operation_id="admin_data_privacy_list_exports",
)
def list_admin_exports(
    _owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
) -> DataExportListResponse:
    return _list_exports(db)


@admin_router.post(
    "/data-exports",
    response_model=DataExportResponse,
    status_code=status.HTTP_202_ACCEPTED,
    operation_id="admin_data_privacy_create_tenant_export",
)
def create_admin_export(
    body: DataExportCreate,
    owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
) -> DataExportResponse:
    if body.kind not in BULK_EXPORT_KINDS:
        raise AppHTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error="invalid_export_kind",
            message="Use the customer export endpoint for an individual customer export.",
        )
    return _create_export(db, owner, body.kind)


@admin_router.post(
    "/customers/{customer_id}/data-export",
    response_model=DataExportResponse,
    status_code=status.HTTP_202_ACCEPTED,
    operation_id="admin_data_privacy_create_customer_export",
)
def create_admin_customer_export(
    customer_id: int,
    owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
) -> DataExportResponse:
    return _create_export(db, owner, DataExportKind.CUSTOMER, customer_id)


@admin_router.post(
    "/data-exports/{export_id}/regenerate",
    response_model=DataExportResponse,
    status_code=status.HTTP_202_ACCEPTED,
    operation_id="admin_data_privacy_regenerate_export",
)
def regenerate_admin_export(
    export_id: str,
    owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
) -> DataExportResponse:
    return _regenerate_export(db, owner, export_id)


@admin_router.delete(
    "/data-exports/{export_id}",
    response_model=DataExportResponse,
    operation_id="admin_data_privacy_cancel_export",
)
def cancel_admin_export(
    export_id: str,
    owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
) -> DataExportResponse:
    return _cancel_export(db, owner, export_id)


@admin_router.get(
    "/data-exports/{export_id}/download",
    response_model=None,
    response_class=FileResponse,
    responses={
        200: {
            "content": {"application/zip": {"schema": {"type": "string", "format": "binary"}}},
            "description": "Private ZIP export",
        }
    },
    operation_id="admin_data_privacy_download_export",
)
def download_admin_export(
    export_id: str,
    _owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db),
) -> Response:
    return _download_export(db, export_id)


__all__ = ["admin_router"]
