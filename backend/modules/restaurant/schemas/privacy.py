from datetime import datetime

from pydantic import BaseModel

from modules.auth.models import DataExportKind, DataExportStatus


class DataExportCreate(BaseModel):
    kind: DataExportKind = DataExportKind.TENANT


class DataExportResponse(BaseModel):
    export_id: str
    kind: DataExportKind
    status: DataExportStatus
    customer_id: int | None = None
    file_name: str | None = None
    sha256: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    expires_at: datetime | None = None
    downloaded_at: datetime | None = None
    can_download: bool
    error_message: str | None = None


class DataExportListResponse(BaseModel):
    items: list[DataExportResponse]


class PrivacyOverviewResponse(BaseModel):
    privacy_contact_email: str | None = None
    operational_access_expires_at: datetime | None = None
    data_access_expires_at: datetime | None = None
