from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from pathlib import Path

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session as DBSession

import models as _registered_models  # noqa: F401 - register all tenant tables
from core.base import Base
from core.config import settings
from modules.auth.models import (
    DataExport,
    DataExportKind,
    DataExportStatus,
    Organization,
    OrganizationDomain,
    OrganizationProfile,
    Session,
    SessionMode,
    User,
    UserRole,
)
from modules.auth.services.email import send_data_access_notice
from modules.restaurant.services.data_exports import (
    completed_tenant_export_exists,
    enqueue_data_export,
)
from utils.datetime_utils import to_naive_utc


PURGE_PRESERVED_TABLES = {"organization_domain", "data_export"}


class OrganizationAccessState(StrEnum):
    OPERATIONAL = "operational"
    FROZEN = "frozen"
    UNSUPPORTED = "unsupported"
    PURGED = "purged"


def utc_now() -> datetime:
    return to_naive_utc(datetime.now(UTC)) or datetime.utcnow()


def data_access_expires_at(organization: Organization) -> datetime | None:
    if organization.access_expires_at is None:
        return None
    return organization.access_expires_at + timedelta(days=settings.data_access_window_days)


def organization_access_state(
    organization: Organization,
    *,
    now: datetime | None = None,
) -> OrganizationAccessState:
    if organization.purged_at is not None:
        return OrganizationAccessState.PURGED
    if organization.access_expires_at is None:
        return OrganizationAccessState.OPERATIONAL
    moment = now or utc_now()
    if moment < organization.access_expires_at:
        return OrganizationAccessState.OPERATIONAL
    expires_at = data_access_expires_at(organization)
    if expires_at is not None and moment < expires_at:
        return OrganizationAccessState.FROZEN
    return OrganizationAccessState.UNSUPPORTED


def get_organization(db: DBSession, slug: str) -> Organization:
    organization = db.scalar(
        select(Organization)
        .where(Organization.slug == slug.strip().lower())
        .execution_options(skip_organization_scope=True)
    )
    if organization is None:
        raise ValueError(f"Organization '{slug}' was not found.")
    return organization


def _notification_recipients(db: DBSession, organization: Organization) -> list[str]:
    db.info["organization_id"] = organization.id
    owner_emails = db.scalars(
        select(User.email).where(User.role == UserRole.OWNER).order_by(User.id)
    ).all()
    privacy_contact_email = db.scalar(select(OrganizationProfile.privacy_contact_email))
    organization_contact = privacy_contact_email or organization.email
    return list(dict.fromkeys([*owner_emails, organization_contact]))


def _send_notice_to_owners(
    db: DBSession,
    organization: Organization,
    *,
    subject: str,
    message: str,
) -> bool:
    recipients = _notification_recipients(db, organization)
    delivery_results = [
        send_data_access_notice(
            email,
            organization.name,
            subject=subject,
            message=message,
        )
        for email in recipients
    ]
    return bool(delivery_results) and all(delivery_results)


def _send_initial_notice(
    db: DBSession,
    organization: Organization,
    *,
    moment: datetime,
) -> None:
    access_expires_at = organization.access_expires_at
    final_expires_at = data_access_expires_at(organization)
    if access_expires_at is None or final_expires_at is None:
        return
    if organization.access_notice_notified_at is None and _send_notice_to_owners(
        db,
        organization,
        subject="Confirmação do encerramento do serviço",
        message=(
            f"O funcionamento normal termina em {access_expires_at:%d/%m/%Y %H:%M} UTC. "
            f"Depois dessa data, apenas o proprietário poderá aceder às cópias dos dados até "
            f"{final_expires_at:%d/%m/%Y %H:%M} UTC. Mantenha o DNS do domínio apontado para "
            "a plataforma até concluir os downloads. Não enviamos ficheiros por email."
        ),
    ):
        organization.access_notice_notified_at = moment


def _reset_notification_state(organization: Organization) -> None:
    organization.access_notice_notified_at = None
    organization.data_access_started_notified_at = None
    organization.data_access_reminder_7d_notified_at = None
    organization.data_access_reminder_1d_notified_at = None
    organization.data_access_closed_notified_at = None


def cancel_organization_access(
    db: DBSession,
    organization: Organization,
    *,
    now: datetime | None = None,
    replace: bool = False,
) -> datetime:
    if organization.purged_at is not None:
        raise ValueError("A purged organization cannot have its access changed.")
    moment = now or utc_now()
    if organization.access_expires_at is not None and not replace:
        return organization.access_expires_at
    organization.access_expires_at = moment + timedelta(days=settings.cancellation_notice_days)
    _reset_notification_state(organization)
    db.info["organization_id"] = organization.id
    _send_initial_notice(db, organization, moment=moment)
    db.commit()
    return organization.access_expires_at


def freeze_organization_now(
    db: DBSession,
    organization: Organization,
    *,
    now: datetime | None = None,
) -> datetime:
    if organization.purged_at is not None:
        raise ValueError("A purged organization cannot have its access changed.")
    moment = now or utc_now()
    organization.access_expires_at = moment
    _reset_notification_state(organization)
    db.info["organization_id"] = organization.id
    db.execute(
        update(Session)
        .where(
            Session.organization_id == organization.id,
            Session.mode == SessionMode.OPERATIONAL,
        )
        .values(revoked=True)
    )
    _send_initial_notice(db, organization, moment=moment)
    db.commit()
    return organization.access_expires_at


def restore_organization_access(db: DBSession, organization: Organization) -> None:
    if organization.purged_at is not None:
        raise ValueError("A purged organization cannot be restored.")
    db.info["organization_id"] = organization.id
    organization.access_expires_at = None
    _reset_notification_state(organization)
    db.execute(
        update(Session)
        .where(
            Session.organization_id == organization.id,
            Session.mode == SessionMode.DATA_ACCESS,
        )
        .values(revoked=True)
    )
    db.commit()


def _ensure_frozen_export(db: DBSession, organization: Organization) -> None:
    existing = db.scalar(
        select(DataExport.id).where(
            DataExport.organization_id == organization.id,
            DataExport.kind == DataExportKind.TENANT,
            DataExport.status.in_(
                (DataExportStatus.PENDING, DataExportStatus.PROCESSING, DataExportStatus.READY)
            ),
        )
    )
    if existing is None:
        enqueue_data_export(
            db,
            organization_id=organization.id,
            kind=DataExportKind.TENANT,
        )


@dataclass(frozen=True)
class PurgePlan:
    organization_id: int
    slug: str
    eligible: bool
    blockers: list[str]
    operational_rows: dict[str, int]

    def to_dict(self) -> dict:
        return asdict(self)


def build_purge_plan(db: DBSession, organization: Organization) -> PurgePlan:
    db.info["organization_id"] = organization.id
    blockers: list[str] = []
    state = organization_access_state(organization)
    if state not in {OrganizationAccessState.UNSUPPORTED, OrganizationAccessState.PURGED}:
        blockers.append("data_access_window_open")
    if organization.purged_at is not None:
        blockers.append("organization_already_purged")
    if not completed_tenant_export_exists(db, organization.id):
        blockers.append("completed_tenant_export_required")
    notification_fields = (
        organization.access_notice_notified_at,
        organization.data_access_started_notified_at,
        organization.data_access_reminder_7d_notified_at,
        organization.data_access_reminder_1d_notified_at,
        organization.data_access_closed_notified_at,
    )
    if any(value is None for value in notification_fields):
        blockers.append("data_access_notifications_incomplete")
    counts: dict[str, int] = {}
    for table in Base.metadata.sorted_tables:
        if "organization_id" not in table.c or table.name in PURGE_PRESERVED_TABLES:
            continue
        counts[table.name] = int(
            db.scalar(
                select(func.count())
                .select_from(table)
                .where(table.c.organization_id == organization.id)
                .execution_options(skip_organization_scope=True)
            )
            or 0
        )
    return PurgePlan(
        organization_id=organization.id,
        slug=organization.slug,
        eligible=not blockers,
        blockers=blockers,
        operational_rows=counts,
    )


def purge_organization(db: DBSession, organization: Organization) -> PurgePlan:
    plan = build_purge_plan(db, organization)
    if not plan.eligible:
        raise ValueError(f"Purge blocked: {', '.join(plan.blockers)}")
    moment = utc_now()
    db.info["organization_id"] = organization.id

    exports = db.scalars(select(DataExport)).all()
    for export in exports:
        if export.storage_path:
            Path(export.storage_path).unlink(missing_ok=True)
        export.storage_path = None
        export.file_name = None
        export.status = DataExportStatus.EXPIRED

    for table in reversed(Base.metadata.sorted_tables):
        if "organization_id" not in table.c or table.name in PURGE_PRESERVED_TABLES:
            continue
        db.execute(
            delete(table)
            .where(table.c.organization_id == organization.id)
            .execution_options(skip_organization_scope=True)
        )

    domains = db.scalars(
        select(OrganizationDomain).where(OrganizationDomain.organization_id == organization.id)
    ).all()
    for domain in domains:
        domain.deactivated_at = moment
    organization.name = f"Purged organization {organization.id}"
    organization.email = f"purged-{organization.id}@invalid.example"
    organization.phone = None
    organization.purged_at = moment
    db.commit()
    return plan


def send_due_data_access_notifications(
    db: DBSession,
    *,
    now: datetime | None = None,
) -> int:
    moment = now or utc_now()
    organizations = db.scalars(
        select(Organization)
        .where(
            Organization.access_expires_at.is_not(None),
            Organization.purged_at.is_(None),
        )
        .execution_options(skip_organization_scope=True)
    ).all()
    sent = 0
    for organization in organizations:
        db.info["organization_id"] = organization.id
        state = organization_access_state(organization, now=moment)
        final_expires_at = data_access_expires_at(organization)
        if final_expires_at is None:
            continue

        if organization.access_notice_notified_at is None:
            _send_initial_notice(db, organization, moment=moment)
            if organization.access_notice_notified_at is not None:
                db.commit()
                sent += 1
            continue

        if state == OrganizationAccessState.FROZEN:
            db.execute(
                update(Session)
                .where(
                    Session.organization_id == organization.id,
                    Session.mode == SessionMode.OPERATIONAL,
                    Session.revoked.is_(False),
                )
                .values(revoked=True)
            )
            _ensure_frozen_export(db, organization)

        remaining = final_expires_at - moment
        subject: str | None = None
        message: str | None = None
        timestamp_field: str | None = None
        if state == OrganizationAccessState.FROZEN and organization.data_access_started_notified_at is None:
            subject = "Acesso restrito aos dados iniciado"
            message = (
                "A loja e as operações normais foram encerradas. O proprietário pode entrar "
                f"em /admin/login no domínio habitual e guardar as cópias até "
                f"{final_expires_at:%d/%m/%Y %H:%M} UTC."
            )
            timestamp_field = "data_access_started_notified_at"
        elif state == OrganizationAccessState.UNSUPPORTED and organization.data_access_closed_notified_at is None:
            db.execute(
                update(Session)
                .where(
                    Session.organization_id == organization.id,
                    Session.revoked.is_(False),
                )
                .values(revoked=True)
            )
            latest = db.scalar(
                select(DataExport)
                .where(DataExport.kind == DataExportKind.TENANT)
                .order_by(DataExport.created_at.desc())
            )
            identifier = latest.public_id if latest else "not-available"
            digest = latest.sha256 if latest and latest.sha256 else "not-available"
            subject = "Acesso aos dados encerrado"
            message = (
                "A janela contratual de devolução terminou. O domínio deve agora ser removido "
                f"da hospedagem. Pacote disponibilizado: {identifier}; SHA-256: {digest}."
            )
            timestamp_field = "data_access_closed_notified_at"
        elif remaining <= timedelta(days=1) and organization.data_access_reminder_1d_notified_at is None:
            subject = "Último dia para guardar os dados"
            message = f"O acesso aos dados termina em {final_expires_at:%d/%m/%Y %H:%M} UTC."
            timestamp_field = "data_access_reminder_1d_notified_at"
        elif remaining <= timedelta(days=7) and organization.data_access_reminder_7d_notified_at is None:
            subject = "Sete dias para guardar os dados"
            message = f"O acesso aos dados termina em {final_expires_at:%d/%m/%Y %H:%M} UTC."
            timestamp_field = "data_access_reminder_7d_notified_at"

        if subject and message and timestamp_field and _send_notice_to_owners(
            db, organization, subject=subject, message=message
        ):
            setattr(organization, timestamp_field, moment)
            sent += 1
        db.commit()
    return sent


def hosting_plan_rows(db: DBSession) -> list[dict[str, str | int | bool]]:
    moment = utc_now()
    rows = db.execute(
        select(Organization, OrganizationDomain)
        .join(OrganizationDomain, OrganizationDomain.organization_id == Organization.id)
        .order_by(Organization.slug, OrganizationDomain.domain)
        .execution_options(skip_organization_scope=True)
    ).all()
    report: list[dict[str, str | int | bool]] = []
    for organization, domain in rows:
        organization_state = organization_access_state(organization, now=moment)
        detached = (
            not domain.is_verified
            or domain.deactivated_at is not None
            or organization_state in {
                OrganizationAccessState.UNSUPPORTED,
                OrganizationAccessState.PURGED,
            }
        )
        state = (
            "detached"
            if detached
            else "frozen"
            if organization_state == OrganizationAccessState.FROZEN
            else "storefront"
        )
        report.append(
            {
                "organization_id": organization.id,
                "organization_slug": organization.slug,
                "hostname": domain.domain,
                "verified": domain.is_verified,
                "hosting_state": state,
            }
        )
    return report
