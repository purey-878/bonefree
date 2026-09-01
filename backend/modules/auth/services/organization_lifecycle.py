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
    DataExportStatus,
    Organization,
    OrganizationDomain,
    OrganizationProfile,
    Session,
    User,
    UserRole,
)
from modules.auth.services.email import send_organization_access_notice
from utils.datetime_utils import to_naive_utc


PURGE_PRESERVED_TABLES = {"organization_domain", "data_export"}


class OrganizationAccessState(StrEnum):
    OPERATIONAL = "operational"
    EXPIRED = "expired"
    PURGED = "purged"


def utc_now() -> datetime:
    return to_naive_utc(datetime.now(UTC)) or datetime.utcnow()


def organization_access_state(
    organization: Organization,
    *,
    now: datetime | None = None,
) -> OrganizationAccessState:
    if organization.purged_at is not None:
        return OrganizationAccessState.PURGED
    if organization.access_expires_at is None:
        return OrganizationAccessState.OPERATIONAL
    if (now or utc_now()) < organization.access_expires_at:
        return OrganizationAccessState.OPERATIONAL
    return OrganizationAccessState.EXPIRED


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
        send_organization_access_notice(
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
    expires_at = organization.access_expires_at
    if expires_at is None:
        return
    if organization.access_notice_notified_at is None and _send_notice_to_owners(
        db,
        organization,
        subject="Confirmação do encerramento do serviço",
        message=(
            f"A plataforma continuará disponível para uso normal até "
            f"{expires_at:%d/%m/%Y %H:%M} UTC. Guarde antes dessa data as cópias de que "
            "necessita na área Dados e privacidade. Depois do prazo, a loja, o painel, "
            "os downloads e todas as operações serão bloqueados. Não enviamos ficheiros por email."
        ),
    ):
        organization.access_notice_notified_at = moment


def _reset_notification_state(organization: Organization) -> None:
    organization.access_notice_notified_at = None
    organization.access_reminder_7d_notified_at = None
    organization.access_reminder_1d_notified_at = None
    organization.access_closed_notified_at = None


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
    if (
        organization.access_expires_at is not None
        and moment >= organization.access_expires_at
    ):
        raise ValueError("An expired organization cannot have its deadline replaced.")
    organization.access_expires_at = moment + timedelta(days=settings.cancellation_notice_days)
    _reset_notification_state(organization)
    db.info["organization_id"] = organization.id
    _send_initial_notice(db, organization, moment=moment)
    db.commit()
    return organization.access_expires_at


def restore_organization_access(
    db: DBSession,
    organization: Organization,
    *,
    now: datetime | None = None,
) -> None:
    if organization.purged_at is not None:
        raise ValueError("A purged organization cannot be restored.")
    moment = now or utc_now()
    if (
        organization.access_expires_at is not None
        and moment >= organization.access_expires_at
    ):
        raise ValueError("An expired organization cannot be restored.")
    db.info["organization_id"] = organization.id
    organization.access_expires_at = None
    _reset_notification_state(organization)
    db.commit()


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
    if state not in {OrganizationAccessState.EXPIRED, OrganizationAccessState.PURGED}:
        blockers.append("access_period_open")
    if organization.purged_at is not None:
        blockers.append("organization_already_purged")
    if (
        organization.access_notice_notified_at is None
        or organization.access_closed_notified_at is None
    ):
        blockers.append("access_notifications_incomplete")
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


def send_due_access_notifications(
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
        expires_at = organization.access_expires_at
        if expires_at is None:
            continue

        if organization.access_notice_notified_at is None:
            _send_initial_notice(db, organization, moment=moment)
            if organization.access_notice_notified_at is not None:
                db.commit()
                sent += 1
            continue

        remaining = expires_at - moment
        subject: str | None = None
        message: str | None = None
        timestamp_fields: list[str] = []
        if remaining <= timedelta(0) and organization.access_closed_notified_at is None:
            db.execute(
                update(Session)
                .where(
                    Session.organization_id == organization.id,
                    Session.revoked.is_(False),
                )
                .values(revoked=True)
            )
            subject = "Acesso à plataforma encerrado"
            message = (
                "O prazo terminou. A loja, o painel, os downloads e todas as operações estão "
                "bloqueados. O hostname pode agora ser removido do provedor de hospedagem."
            )
            timestamp_fields = ["access_closed_notified_at"]
        elif remaining <= timedelta(days=1) and organization.access_reminder_1d_notified_at is None:
            subject = "Último dia de acesso à plataforma"
            message = (
                f"O funcionamento e os downloads terminam em {expires_at:%d/%m/%Y %H:%M} UTC. "
                "Guarde hoje as cópias de que necessita."
            )
            timestamp_fields = ["access_reminder_1d_notified_at"]
            if organization.access_reminder_7d_notified_at is None:
                timestamp_fields.append("access_reminder_7d_notified_at")
        elif remaining <= timedelta(days=7) and organization.access_reminder_7d_notified_at is None:
            subject = "Sete dias para o encerramento da plataforma"
            message = (
                f"O funcionamento e os downloads terminam em {expires_at:%d/%m/%Y %H:%M} UTC. "
                "Use a área Dados e privacidade para guardar as cópias necessárias."
            )
            timestamp_fields = ["access_reminder_7d_notified_at"]

        if subject and message and timestamp_fields and _send_notice_to_owners(
            db, organization, subject=subject, message=message
        ):
            for timestamp_field in timestamp_fields:
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
        detached = (
            not domain.is_verified
            or domain.deactivated_at is not None
            or organization_access_state(organization, now=moment)
            != OrganizationAccessState.OPERATIONAL
        )
        report.append(
            {
                "organization_id": organization.id,
                "organization_slug": organization.slug,
                "hostname": domain.domain,
                "verified": domain.is_verified,
                "hosting_state": "detached" if detached else "storefront",
            }
        )
    return report
