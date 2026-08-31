from __future__ import annotations

import hashlib
import json
import os
import tempfile
import uuid
import zipfile
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Any

from sqlalchemy import Table, or_, select, update
from sqlalchemy.orm import Session

import models as _registered_models  # noqa: F401 - register every mapped table
from core.base import Base
from core.config import settings
from modules.auth.models import DataExport, DataExportKind, DataExportStatus, Organization, UserRole
from modules.restaurant.services.media_storage import UPLOADS_ROOT
from utils.datetime_utils import to_naive_utc


EXPORT_SCHEMA_VERSION = 1
EXPORT_PROCESSING_TIMEOUT = timedelta(hours=6)
EXCLUDED_TABLES = {
    "admin",
    "admin_session",
    "session",
    "data_access_login_challenge",
    "data_export",
}
SENSITIVE_COLUMN_FRAGMENTS = (
    "password",
    "token",
    "secret",
    "code_hash",
    "card_number",
    "cvv",
)
PARTIAL_EXPORT_TABLES: dict[DataExportKind, tuple[str, ...]] = {
    DataExportKind.CUSTOMERS: (
        "user",
        "customer_billing_address",
        "customer_loyalty",
        "coupon",
        "cart",
        "cart_product",
        "cart_product_customization",
        "product_review",
        "review_replies",
        "review_reactions",
    ),
    DataExportKind.ORDERS: (
        "customer_order",
        "order_product",
        "payment",
        "invoice",
    ),
    DataExportKind.CATALOG: (
        "category",
        "product",
        "ingredient",
        "product_ingredient",
        "product_customization_option",
    ),
    DataExportKind.MEDIA: (
        "media",
        "media_variant",
        "product_media",
    ),
}


def _now() -> datetime:
    return to_naive_utc(datetime.now(UTC)) or datetime.utcnow()


def _serialize(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds") + ("Z" if value.tzinfo is None else "")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, bytes):
        return f"sha256:{hashlib.sha256(value).hexdigest()}"
    return value


def _safe_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        key: _serialize(value)
        for key, value in row.items()
        if not any(fragment in key.casefold() for fragment in SENSITIVE_COLUMN_FRAGMENTS)
        and key not in {"storage_path"}
    }


def _rows(db: Session, table: Table, where_clause) -> list[dict[str, Any]]:
    return [
        _safe_row(dict(row))
        for row in db.execute(
            select(table).where(where_clause).execution_options(skip_organization_scope=True)
        ).mappings()
    ]


def _tenant_payloads(db: Session, organization_id: int) -> dict[str, list[dict[str, Any]]]:
    payloads: dict[str, list[dict[str, Any]]] = {}
    organization_table = Base.metadata.tables["organization"]
    organization_rows = _rows(db, organization_table, organization_table.c.id == organization_id)
    if organization_rows:
        payloads["organization"] = organization_rows

    for table in Base.metadata.sorted_tables:
        if table.name in EXCLUDED_TABLES or table.name == "organization":
            continue
        if "organization_id" not in table.c:
            continue
        payloads[table.name] = _rows(
            db,
            table,
            table.c.organization_id == organization_id,
        )
    return payloads


def _partial_payloads(
    db: Session,
    organization_id: int,
    kind: DataExportKind,
) -> dict[str, list[dict[str, Any]]]:
    payloads: dict[str, list[dict[str, Any]]] = {}
    for table_name in PARTIAL_EXPORT_TABLES[kind]:
        table = Base.metadata.tables.get(table_name)
        if table is None or "organization_id" not in table.c:
            continue
        where_clause = table.c.organization_id == organization_id
        if table_name == "user":
            where_clause &= table.c.role == UserRole.CLIENT
        payloads[table_name] = _rows(db, table, where_clause)
    return payloads


def _ids(rows: list[dict[str, Any]], field: str) -> set[int]:
    return {int(row[field]) for row in rows if row.get(field) is not None}


def _customer_payloads(
    db: Session,
    organization_id: int,
    customer_id: int,
) -> dict[str, list[dict[str, Any]]]:
    tables = Base.metadata.tables
    user_table = tables["user"]
    users = _rows(
        db,
        user_table,
        (user_table.c.organization_id == organization_id) & (user_table.c.id == customer_id),
    )
    if not users:
        raise ValueError("customer_not_found")

    payloads: dict[str, list[dict[str, Any]]] = {"user": users}
    direct_customer_tables = (
        "customer_billing_address",
        "customer_loyalty",
        "coupon",
        "cart",
        "customer_order",
        "product_review",
    )
    for table_name in direct_customer_tables:
        table = tables.get(table_name)
        if table is None or "customer_id" not in table.c:
            continue
        payloads[table_name] = _rows(
            db,
            table,
            (table.c.organization_id == organization_id) & (table.c.customer_id == customer_id),
        )

    cart_ids = _ids(payloads.get("cart", []), "cart_id")
    order_ids = _ids(payloads.get("customer_order", []), "order_id")
    review_ids = _ids(payloads.get("product_review", []), "review_id")

    dependent_filters: list[tuple[str, str, set[int]]] = [
        ("cart_product", "cart_id", cart_ids),
        ("order_product", "order_id", order_ids),
        ("payment", "order_id", order_ids),
        ("invoice", "order_id", order_ids),
        ("review_replies", "review_id", review_ids),
        ("review_reactions", "review_id", review_ids),
    ]
    for table_name, column_name, parent_ids in dependent_filters:
        table = tables.get(table_name)
        if table is None or not parent_ids:
            payloads[table_name] = []
            continue
        payloads[table_name] = _rows(
            db,
            table,
            (table.c.organization_id == organization_id) & table.c[column_name].in_(parent_ids),
        )

    cart_product_ids = _ids(payloads.get("cart_product", []), "cart_product_id")
    customization_table = tables.get("cart_product_customization")
    if customization_table is not None:
        payloads["cart_product_customization"] = (
            _rows(
                db,
                customization_table,
                (customization_table.c.organization_id == organization_id)
                & customization_table.c.cart_product_id.in_(cart_product_ids),
            )
            if cart_product_ids
            else []
        )
    return payloads


def _json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")


def _tenant_media_keys(db: Session, organization_id: int) -> list[str]:
    keys: list[str] = []
    for table_name in ("media", "media_variant"):
        table = Base.metadata.tables.get(table_name)
        if table is None:
            continue
        keys.extend(
            str(value)
            for value in db.scalars(
                select(table.c.storage_key)
                .where(table.c.organization_id == organization_id)
                .execution_options(skip_organization_scope=True)
            ).all()
            if value
        )
    return keys


def _write_export_zip(
    destination: Path,
    export: DataExport,
    payloads: dict[str, list[dict[str, Any]]],
    media_keys: list[str],
) -> None:
    file_hashes: dict[str, str] = {}
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for table_name, rows in sorted(payloads.items()):
            archive_name = f"data/{table_name}.json"
            content = _json_bytes(rows)
            archive.writestr(archive_name, content)
            file_hashes[archive_name] = hashlib.sha256(content).hexdigest()

        for storage_key in sorted(set(media_keys)):
            source = (UPLOADS_ROOT / storage_key).resolve()
            try:
                source.relative_to(UPLOADS_ROOT.resolve())
            except ValueError:
                continue
            if not source.is_file():
                continue
            archive_name = f"media/{Path(storage_key).as_posix()}"
            content = source.read_bytes()
            archive.writestr(archive_name, content)
            file_hashes[archive_name] = hashlib.sha256(content).hexdigest()

        manifest = {
            "schema_version": EXPORT_SCHEMA_VERSION,
            "export_id": export.public_id,
            "kind": export.kind.value,
            "organization_id": export.organization_id,
            "customer_id": export.customer_id,
            "generated_at": _now().isoformat(timespec="seconds") + "Z",
            "files": file_hashes,
            "security": {
                "credentials_excluded": True,
                "cross_tenant_data_excluded": True,
                "email_attachments_used": False,
            },
        }
        archive.writestr("manifest.json", _json_bytes(manifest))


def enqueue_data_export(
    db: Session,
    *,
    organization_id: int,
    kind: DataExportKind,
    requested_by_user_id: int | None = None,
    customer_id: int | None = None,
) -> DataExport:
    if kind == DataExportKind.CUSTOMER and customer_id is None:
        raise ValueError("customer_id_required")
    export = DataExport(
        public_id=str(uuid.uuid4()),
        organization_id=organization_id,
        kind=kind,
        status=DataExportStatus.PENDING,
        requested_by_user_id=requested_by_user_id,
        customer_id=customer_id,
    )
    db.add(export)
    db.flush()
    return export


def process_data_export(db: Session, export: DataExport) -> DataExport:
    export.status = DataExportStatus.PROCESSING
    export.error_message = None
    db.commit()
    final_path: Path | None = None
    try:
        if export.kind == DataExportKind.TENANT:
            payloads = _tenant_payloads(db, export.organization_id)
            media_keys = _tenant_media_keys(db, export.organization_id)
        elif export.kind == DataExportKind.CUSTOMER:
            if export.customer_id is None:
                raise ValueError("customer_id_required")
            payloads = _customer_payloads(db, export.organization_id, export.customer_id)
            media_keys = []
        elif export.kind in PARTIAL_EXPORT_TABLES:
            payloads = _partial_payloads(db, export.organization_id, export.kind)
            media_keys = (
                _tenant_media_keys(db, export.organization_id)
                if export.kind == DataExportKind.MEDIA
                else []
            )
        else:
            raise ValueError("unsupported_export_kind")

        export_dir = settings.data_exports_dir.resolve()
        export_dir.mkdir(parents=True, exist_ok=True)
        file_name = f"{export.kind.value}-{export.public_id}.zip"
        final_path = export_dir / file_name
        with tempfile.NamedTemporaryFile(dir=export_dir, suffix=".tmp", delete=False) as temporary:
            temporary_path = Path(temporary.name)
        try:
            _write_export_zip(temporary_path, export, payloads, media_keys)
            os.chmod(temporary_path, 0o600)
            temporary_path.replace(final_path)
        finally:
            temporary_path.unlink(missing_ok=True)

        digest = hashlib.sha256(final_path.read_bytes()).hexdigest()
        completed_at = _now()
        completed = db.execute(
            update(DataExport)
            .where(
                DataExport.id == export.id,
                DataExport.organization_id == export.organization_id,
                DataExport.status == DataExportStatus.PROCESSING,
            )
            .values(
                file_name=file_name,
                storage_path=str(final_path),
                sha256=digest,
                completed_at=completed_at,
                expires_at=completed_at + timedelta(hours=24),
                status=DataExportStatus.READY,
            )
            .execution_options(synchronize_session=False)
        )
        if completed.rowcount != 1:
            final_path.unlink(missing_ok=True)
        db.commit()
        db.refresh(export)
        return export
    except Exception as exc:
        if final_path is not None:
            final_path.unlink(missing_ok=True)
        db.execute(
            update(DataExport)
            .where(
                DataExport.id == export.id,
                DataExport.organization_id == export.organization_id,
                DataExport.status == DataExportStatus.PROCESSING,
            )
            .values(status=DataExportStatus.FAILED, error_message=str(exc)[:500])
            .execution_options(synchronize_session=False)
        )
        db.commit()
        db.refresh(export)
        raise


def delete_data_export_file(export: DataExport) -> None:
    """Delete only files stored inside the private export directory."""
    if export.storage_path:
        candidate = Path(export.storage_path).resolve()
        export_root = settings.data_exports_dir.resolve()
        try:
            candidate.relative_to(export_root)
        except ValueError as exc:
            raise ValueError("invalid_data_export_storage_path") from exc
        candidate.unlink(missing_ok=True)
    export.storage_path = None


def process_next_pending_export(db: Session) -> DataExport | None:
    stale_processing_before = _now() - EXPORT_PROCESSING_TIMEOUT
    export = db.scalar(
        select(DataExport)
        .where(
            or_(
                DataExport.status == DataExportStatus.PENDING,
                (
                    (DataExport.status == DataExportStatus.PROCESSING)
                    & (DataExport.updated_at < stale_processing_before)
                ),
            )
        )
        .order_by(DataExport.created_at, DataExport.id)
        .with_for_update(skip_locked=True)
        .execution_options(skip_organization_scope=True)
    )
    if export is None:
        return None
    db.info["organization_id"] = export.organization_id
    return process_data_export(db, export)


def cleanup_expired_data_exports(db: Session, *, now: datetime | None = None) -> int:
    moment = now or _now()
    exports = db.scalars(
        select(DataExport)
        .where(
            DataExport.status.in_((DataExportStatus.READY, DataExportStatus.EXPIRED)),
            DataExport.expires_at.is_not(None),
            DataExport.expires_at <= moment,
            DataExport.storage_path.is_not(None),
        )
        .execution_options(skip_organization_scope=True)
    ).all()
    export_root = settings.data_exports_dir.resolve()
    cleaned = 0
    for export in exports:
        if export.storage_path:
            candidate = Path(export.storage_path).resolve()
            try:
                candidate.relative_to(export_root)
            except ValueError:
                candidate = None
            if candidate is not None:
                candidate.unlink(missing_ok=True)
        export.storage_path = None
        export.status = DataExportStatus.EXPIRED
        cleaned += 1
    if cleaned:
        db.commit()
    return cleaned


def export_download_path(export: DataExport) -> Path | None:
    now = _now()
    if export.status != DataExportStatus.READY or export.expires_at is None:
        return None
    if export.expires_at <= now:
        export.status = DataExportStatus.EXPIRED
        return None
    if not export.storage_path:
        return None
    candidate = Path(export.storage_path).resolve()
    export_root = settings.data_exports_dir.resolve()
    try:
        candidate.relative_to(export_root)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def completed_tenant_export_exists(db: Session, organization_id: int) -> bool:
    return db.scalar(
        select(DataExport.id)
        .where(
            DataExport.organization_id == organization_id,
            DataExport.kind == DataExportKind.TENANT,
            DataExport.status.in_(
                (DataExportStatus.READY, DataExportStatus.EXPIRED, DataExportStatus.CANCELLED)
            ),
            DataExport.completed_at.is_not(None),
        )
        .execution_options(skip_organization_scope=True)
    ) is not None
