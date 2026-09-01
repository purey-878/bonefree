"""Unified organization, domain, access-expiry, and hosting commands."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

if __package__ in (None, ""):
    backend_root = Path(__file__).resolve().parents[1]
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))

from sqlalchemy import select

from core.organizations import normalize_hostname
from database import SessionLocal
from modules.auth.models import (
    OrganizationDomain,
    OrganizationProfile,
    OrganizationType,
)
from modules.auth.services.organization_lifecycle import (
    build_purge_plan,
    cancel_organization_access,
    get_organization,
    hosting_plan_rows,
    purge_organization,
    restore_organization_access,
    send_due_access_notifications,
)
from scripts.add_organization_domain import add_organization_domain
from scripts.create_organization import create_organization, normalize_email


def _datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _organization_parser(subparsers) -> None:
    organization = subparsers.add_parser(
        "organization",
        help="Criar, atualizar, encerrar, restaurar ou eliminar uma organização.",
        description="Gere o ciclo de vida e os dados principais de uma organização.",
    )
    actions = organization.add_subparsers(
        dest="action",
        required=True,
        title="ações disponíveis",
        metavar="AÇÃO",
    )

    create = actions.add_parser(
        "create",
        help="Criar uma organização e o respetivo perfil.",
        description="Cria uma nova organização de restaurante e o seu perfil inicial.",
    )
    create.add_argument("--name", required=True, help="Nome apresentado da organização.")
    create.add_argument("--slug", required=True, help="Identificador único e imutável.")
    create.add_argument("--email", required=True, help="E-mail principal da organização.")
    create.add_argument("--privacy-contact-email", help="E-mail separado para assuntos de privacidade.")
    create.add_argument("--phone", help="Telefone principal.")
    create.add_argument("--legal-name", help="Nome legal ou firma.")
    create.add_argument("--tax-id", help="NIF da organização.")
    create.add_argument("--country", default="Portugal", help="País. Padrão: Portugal.")
    create.add_argument("--currency-code", default="EUR", help="Moeda ISO. Padrão: EUR.")

    update = actions.add_parser(
        "update",
        help="Alterar os contactos ou o nome de uma organização.",
        description="Atualiza somente os campos informados; o slug nunca é alterado.",
    )
    update.add_argument("--slug", required=True, help="Identificador imutável da organização.")
    update.add_argument("--name", help="Novo nome apresentado.")
    update.add_argument("--email", help="Novo e-mail principal.")
    update.add_argument("--privacy-contact-email", help="Novo e-mail de privacidade.")
    update.add_argument("--phone", help="Novo telefone principal.")

    restore = actions.add_parser(
        "restore-access",
        help="Cancelar o encerramento antes de o prazo terminar.",
        description=(
            "Limpa access_expires_at enquanto a organização ainda funciona normalmente. "
            "Depois do vencimento, o encerramento é definitivo."
        ),
    )
    restore.add_argument("--slug", required=True, help="Organização que voltará ao funcionamento normal.")

    purge_plan = actions.add_parser(
        "purge-plan",
        help="Verificar se a organização já pode ser eliminada.",
        description="Mostra prazos, bloqueios, notificações e cópias exigidas sem apagar nada.",
    )
    purge_plan.add_argument("--slug", required=True, help="Organização a analisar.")

    cancel = actions.add_parser(
        "cancel-access",
        help="Iniciar o encerramento com aviso prévio.",
        description=(
            "Define access_expires_at para a data atual mais CANCELLATION_NOTICE_DAYS. "
            "Até essa data tudo funciona normalmente; depois, todo o acesso é bloqueado. "
            "É idempotente: repetir o comando não prolonga o prazo."
        ),
    )
    cancel.add_argument("--slug", required=True, help="Organização cujo encerramento será iniciado.")
    cancel.add_argument(
        "--replace",
        action="store_true",
        help="Substituir explicitamente um prazo que já existe; exige --confirm.",
    )
    cancel.add_argument(
        "--confirm",
        help="Com --replace, repetir exatamente o slug da organização.",
    )

    purge = actions.add_parser(
        "purge",
        help="Eliminar ou anonimizar definitivamente os dados operacionais.",
        description=(
            "Executa o plano de eliminação depois do prazo. Não exige que o proprietário "
            "tenha gerado ou baixado uma cópia. Após purged_at, não há restauração."
        ),
    )
    purge.add_argument("--slug", required=True, help="Organização a eliminar.")
    purge.add_argument(
        "--confirm",
        required=True,
        help="Repetir exatamente o slug para confirmar a eliminação destrutiva.",
    )

    notifications = actions.add_parser(
        "send-notifications",
        help="Enviar avisos de encerramento que estejam pendentes.",
        description="Processa o aviso inicial, os lembretes e a confirmação de encerramento.",
    )
    notifications.add_argument(
        "--at",
        help="Data/hora ISO opcional para testes controlados; por padrão usa a hora atual.",
    )


def _domain_parser(subparsers) -> None:
    domain = subparsers.add_parser(
        "domain",
        help="Criar, alterar, desativar ou reativar um hostname.",
        description="Gere os domínios associados às organizações.",
    )
    actions = domain.add_subparsers(
        dest="action",
        required=True,
        title="ações disponíveis",
        metavar="AÇÃO",
    )
    create = actions.add_parser(
        "create",
        help="Associar um novo hostname a uma organização.",
        description="Cria a associação do domínio; a verificação e o domínio primário são opcionais.",
    )
    create.add_argument("--organization-slug", required=True, help="Slug da organização proprietária.")
    create.add_argument("--domain", required=True, help="Hostname, sem caminho, por exemplo loja.exemplo.pt.")
    create.add_argument("--verified", action="store_true", help="Marcar o hostname como verificado.")
    create.add_argument("--primary", action="store_true", help="Tornar este o domínio primário.")

    update = actions.add_parser(
        "update",
        help="Alterar a verificação ou a definição de domínio primário.",
        description="Atualiza somente as opções fornecidas; o hostname é imutável.",
    )
    update.add_argument("--domain", required=True, help="Hostname imutável a atualizar.")
    update.add_argument(
        "--verified",
        action=argparse.BooleanOptionalAction,
        help="Usar --verified ou --no-verified.",
    )
    update.add_argument(
        "--primary",
        action=argparse.BooleanOptionalAction,
        help="Usar --primary ou --no-primary.",
    )

    deactivate = actions.add_parser(
        "deactivate",
        help="Desativar manualmente um domínio sem apagar o registo.",
        description="Preenche deactivated_at; o domínio deixa de resolver na aplicação.",
    )
    deactivate.add_argument("--domain", required=True, help="Hostname a desativar.")

    reactivate = actions.add_parser(
        "reactivate",
        help="Reativar um domínio anteriormente desativado.",
        description="Limpa deactivated_at e volta a permitir a resolução do hostname.",
    )
    reactivate.add_argument("--domain", required=True, help="Hostname a reativar.")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gestão unificada de organizações, domínios, encerramento e hospedagem.",
        epilog=(
            "Pode executar como módulo ou diretamente a partir da pasta backend:\n"
            "  python -m scripts.manage_organizations --help\n"
            "  python scripts/manage_organizations.py --help\n\n"
            "Exemplos:\n"
            "  python -m scripts.manage_organizations organization cancel-access --slug bonefree\n"
            "  python -m scripts.manage_organizations domain create --organization-slug bonefree --domain bonefree.pt --verified --primary\n"
            "  python -m scripts.manage_organizations hosting-plan --format table\n\n"
            "Use '<comando> --help' para ver os detalhes de cada operação."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(
        dest="scope",
        required=True,
        title="comandos disponíveis",
        metavar="COMANDO",
    )
    _organization_parser(subparsers)
    _domain_parser(subparsers)
    hosting = subparsers.add_parser(
        "hosting-plan",
        help="Listar o estado de hospedagem de todos os hostnames.",
        description=(
            "Mostra quais domínios devem servir a loja ou ser removidos manualmente "
            "do provedor de hospedagem."
        ),
    )
    hosting.add_argument(
        "--format",
        choices=("table", "json"),
        default="table",
        help="Formato da saída. Padrão: table.",
    )
    return parser.parse_args(argv)


def _domain_by_name(db, value: str) -> OrganizationDomain:
    hostname = normalize_hostname(value)
    domain = db.scalar(
        select(OrganizationDomain)
        .where(OrganizationDomain.domain == hostname)
        .execution_options(skip_organization_scope=True)
    )
    if domain is None:
        raise ValueError(f"Domain '{hostname}' was not found.")
    db.info["organization_id"] = domain.organization_id
    return domain


def _run_organization(args: argparse.Namespace) -> object:
    with SessionLocal() as db:
        if args.action == "create":
            return create_organization(
                db,
                name=args.name,
                slug=args.slug,
                organization_type=OrganizationType.RESTAURANT,
                email=args.email,
                privacy_contact_email=args.privacy_contact_email,
                phone=args.phone,
                legal_name=args.legal_name,
                tax_id=args.tax_id,
                country=args.country,
                currency_code=args.currency_code,
            )
        if args.action == "send-notifications":
            return {"notifications_sent": send_due_access_notifications(db, now=_datetime(args.at))}

        organization = get_organization(db, args.slug)
        if args.action == "update":
            db.info["organization_id"] = organization.id
            profile = db.scalar(select(OrganizationProfile))
            if args.name is not None:
                organization.name = args.name.strip()
            if args.email is not None:
                organization.email = normalize_email(args.email)
            if args.phone is not None:
                organization.phone = args.phone.strip() or None
            if profile and args.privacy_contact_email is not None:
                profile.privacy_contact_email = normalize_email(args.privacy_contact_email)
            db.commit()
            return {"organization_id": organization.id, "slug": organization.slug, "updated": True}
        if args.action == "cancel-access":
            if args.replace and args.confirm != organization.slug:
                raise ValueError("Replacing the deadline requires confirmation with the organization slug.")
            expires_at = cancel_organization_access(
                db,
                organization,
                replace=args.replace,
            )
            return {"slug": organization.slug, "access_expires_at": expires_at.isoformat()}
        if args.action == "restore-access":
            restore_organization_access(db, organization)
            return {"slug": organization.slug, "restored": True}
        if args.action == "purge-plan":
            return build_purge_plan(db, organization).to_dict()
        if args.action == "purge":
            if args.confirm != organization.slug:
                raise ValueError("Purge confirmation must exactly match the organization slug.")
            return purge_organization(db, organization).to_dict()
    raise ValueError("Unsupported organization command.")


def _run_domain(args: argparse.Namespace) -> object:
    with SessionLocal() as db:
        if args.action == "create":
            domain = add_organization_domain(
                db,
                organization_slug=args.organization_slug,
                domain=args.domain,
                is_verified=args.verified,
                is_primary=args.primary,
            )
            return {"domain": domain.domain, "organization_id": domain.organization_id}
        domain = _domain_by_name(db, args.domain)
        if args.action == "update":
            if args.verified is not None:
                domain.is_verified = args.verified
            if args.primary is not None:
                if args.primary:
                    for current in db.scalars(
                        select(OrganizationDomain).where(OrganizationDomain.is_primary.is_(True))
                    ).all():
                        current.is_primary = False
                domain.is_primary = args.primary
            db.commit()
            return {"domain": domain.domain, "updated": True}
        if args.action == "deactivate":
            domain.deactivated_at = datetime.utcnow()
        elif args.action == "reactivate":
            domain.deactivated_at = None
        db.commit()
        return {"domain": domain.domain, "active": domain.deactivated_at is None}


def _render_hosting_table(rows: list[dict]) -> None:
    headings = ("ORGANIZATION", "HOSTNAME", "VERIFIED", "STATE")
    values = [
        (
            str(row["organization_slug"]),
            str(row["hostname"]),
            "yes" if row["verified"] else "no",
            str(row["hosting_state"]),
        )
        for row in rows
    ]
    widths = [max(len(headings[index]), *(len(row[index]) for row in values)) for index in range(4)] if values else [len(item) for item in headings]
    print("  ".join(value.ljust(widths[index]) for index, value in enumerate(headings)))
    for row in values:
        print("  ".join(value.ljust(widths[index]) for index, value in enumerate(row)))


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args(argv)
    try:
        if args.scope == "organization":
            result = _run_organization(args)
        elif args.scope == "domain":
            result = _run_domain(args)
        else:
            with SessionLocal() as db:
                rows = hosting_plan_rows(db)
            if args.format == "table":
                _render_hosting_table(rows)
                return 0
            result = rows
        if hasattr(result, "id"):
            result = {"id": result.id}
        print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
        return 0
    except ValueError as exc:
        print(f"Error: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
