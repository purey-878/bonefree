"""Unified organization, domain, access-expiry, and hosting commands."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Callable, TypeVar

if __package__ in (None, ""):
    backend_root = Path(__file__).resolve().parents[1]
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from core.organizations import (
    normalize_hostname,
    normalize_organization_slug,
)
from database import SessionLocal
from modules.auth.models import (
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
from modules.auth.services.organization_management import (
    add_organization_domain,
    check_database_ready,
    create_organization,
    list_organization_domains,
    normalize_email,
    normalize_organization_type,
    set_organization_domain_active,
    update_organization_domain,
)


T = TypeVar("T")


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
    create.add_argument("--name", help="Nome apresentado da organização.")
    create.add_argument("--slug", help="Identificador único e imutável.")
    create.add_argument("--email", help="E-mail principal da organização.")
    create.add_argument(
        "--organization-type",
        default=OrganizationType.RESTAURANT.value,
        choices=tuple(item.value for item in OrganizationType),
        help="Tipo da organização. Padrão: restaurant.",
    )
    create.add_argument("--privacy-contact-email", help="E-mail separado para assuntos de privacidade.")
    create.add_argument("--phone", help="Telefone principal.")
    create.add_argument("--display-name", help="Nome público; por padrão usa --name.")
    create.add_argument("--legal-name", help="Nome legal ou firma.")
    create.add_argument("--tax-id", help="NIF da organização.")
    create.add_argument("--country", default="Portugal", help="País. Padrão: Portugal.")
    create.add_argument("--currency-code", default="EUR", help="Moeda ISO. Padrão: EUR.")

    update = actions.add_parser(
        "update",
        help="Alterar os contactos ou o nome de uma organização.",
        description="Atualiza somente os campos informados; o slug nunca é alterado.",
    )
    update.add_argument("--slug", help="Identificador imutável da organização.")
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
    restore.add_argument("--slug", help="Organização que voltará ao funcionamento normal.")

    purge_plan = actions.add_parser(
        "purge-plan",
        help="Verificar se a organização já pode ser eliminada.",
        description="Mostra prazos, bloqueios, notificações e cópias exigidas sem apagar nada.",
    )
    purge_plan.add_argument("--slug", help="Organização a analisar.")

    cancel = actions.add_parser(
        "cancel-access",
        help="Iniciar o encerramento com aviso prévio.",
        description=(
            "Define access_expires_at para a data atual mais CANCELLATION_NOTICE_DAYS. "
            "Até essa data tudo funciona normalmente; depois, todo o acesso é bloqueado. "
            "É idempotente: repetir o comando não prolonga o prazo."
        ),
    )
    cancel.add_argument("--slug", help="Organização cujo encerramento será iniciado.")
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
    purge.add_argument("--slug", help="Organização a eliminar.")
    purge.add_argument(
        "--confirm",
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
    create.add_argument("--organization-slug", help="Slug da organização proprietária.")
    create.add_argument("--domain", help="Hostname, sem caminho, por exemplo loja.exemplo.pt.")
    create.add_argument("--verified", action="store_true", help="Marcar o hostname como verificado.")
    create.add_argument("--primary", action="store_true", help="Tornar este o domínio primário.")

    update = actions.add_parser(
        "update",
        help="Alterar a verificação ou a definição de domínio primário.",
        description="Atualiza somente as opções fornecidas; o hostname é imutável.",
    )
    update.add_argument("--domain", help="Hostname imutável a atualizar.")
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
    deactivate.add_argument("--domain", help="Hostname a desativar.")

    reactivate = actions.add_parser(
        "reactivate",
        help="Reativar um domínio anteriormente desativado.",
        description="Limpa deactivated_at e volta a permitir a resolução do hostname.",
    )
    reactivate.add_argument("--domain", help="Hostname a reativar.")

    list_domains = actions.add_parser(
        "list",
        help="Listar os domínios de uma organização.",
        description="Mostra o hostname, a verificação, o domínio primário e o estado.",
    )
    list_domains.add_argument("--organization-slug", help="Slug da organização proprietária.")
    list_domains.add_argument(
        "--format",
        choices=("table", "json"),
        default="table",
        help="Formato da saída. Padrão: table.",
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gestão unificada de organizações, domínios, encerramento e hospedagem.",
        epilog=(
            "Pode executar como módulo ou diretamente a partir da pasta backend:\n"
            "  python -m scripts.manage_organizations --help\n"
            "  python scripts/manage_organizations.py --help\n\n"
            "Exemplos:\n"
            "  python -m scripts.manage_organizations organization create\n"
            "  python -m scripts.manage_organizations organization cancel-access --slug bonefree\n"
            "  python -m scripts.manage_organizations domain create --organization-slug bonefree --domain bonefree.pt --verified --primary\n"
            "  python -m scripts.manage_organizations domain list --organization-slug bonefree\n"
            "  python -m scripts.manage_organizations hosting-plan --format table\n\n"
            "Sem opções, uma ação abre um assistente quando executada num terminal.\n"
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
    raw_args = list(sys.argv[1:] if argv is None else argv)
    args = parser.parse_args(raw_args)
    args.full_wizard = len(raw_args) == 2 and args.scope in {"organization", "domain"}
    return args


def _prompt_validated(
    label: str,
    validator: Callable[[str], T],
    *,
    default: str | None = None,
) -> T:
    suffix = f" [{default}]" if default is not None else ""
    while True:
        value = _read_input(f"{label}{suffix}: ").strip()
        if not value and default is not None:
            value = default
        try:
            return validator(value)
        except ValueError as exc:
            print(f"Valor inválido: {exc}", file=sys.stderr)


def _required_text(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("este valor é obrigatório")
    return normalized


def _read_input(prompt: str) -> str:
    try:
        return input(prompt)
    except EOFError as exc:
        raise ValueError(
            "Interactive input is unavailable. Provide the required command options."
        ) from exc


def _currency_code(value: str) -> str:
    normalized = value.strip().upper()
    if len(normalized) != 3 or not normalized.isalpha():
        raise ValueError("use um código ISO de três letras, por exemplo EUR")
    return normalized


def _prompt_optional(label: str, *, default: str | None = None) -> str | None:
    suffix = f" [{default}]" if default is not None else " (opcional)"
    value = _read_input(f"{label}{suffix}: ").strip()
    if value:
        return value
    return default


def _prompt_update_value(
    label: str,
    *,
    validator: Callable[[str], str] | None = None,
    clearable: bool = False,
) -> str | None:
    suffix = " [Enter mantém, - limpa]" if clearable else " [Enter mantém]"
    while True:
        value = _read_input(f"{label}{suffix}: ").strip()
        if not value:
            return None
        if clearable and value == "-":
            return ""
        try:
            return validator(value) if validator else value
        except ValueError as exc:
            print(f"Valor inválido: {exc}", file=sys.stderr)


def _prompt_boolean(label: str, *, default: bool) -> bool:
    default_label = "S/n" if default else "s/N"
    while True:
        value = _read_input(f"{label} [{default_label}]: ").strip().lower()
        if not value:
            return default
        if value in {"s", "sim", "y", "yes"}:
            return True
        if value in {"n", "não", "nao", "no"}:
            return False
        print("Valor inválido: responda sim ou não.", file=sys.stderr)


def _prompt_optional_boolean(label: str) -> bool | None:
    while True:
        value = _read_input(f"{label} [Enter mantém, s/n]: ").strip().lower()
        if not value:
            return None
        if value in {"s", "sim", "y", "yes"}:
            return True
        if value in {"n", "não", "nao", "no"}:
            return False
        print("Valor inválido: responda sim, não ou Enter para manter.", file=sys.stderr)


def _require_argument(
    args: argparse.Namespace,
    attribute: str,
    option: str,
    label: str,
    validator: Callable[[str], T],
    *,
    interactive: bool,
) -> T:
    value = getattr(args, attribute, None)
    if value is None or (isinstance(value, str) and not value.strip()):
        if not interactive:
            raise ValueError(f"Missing required argument: {option}.")
        value = _prompt_validated(label, validator)
        setattr(args, attribute, value)
        return value
    normalized = validator(value)
    setattr(args, attribute, normalized)
    return normalized


def _prepare_organization_args(args: argparse.Namespace, *, interactive: bool) -> None:
    if args.action == "send-notifications":
        return

    if args.action == "create":
        _require_argument(
            args,
            "name",
            "--name",
            "Nome da organização",
            _required_text,
            interactive=interactive,
        )
        _require_argument(
            args,
            "slug",
            "--slug",
            "Slug da organização",
            normalize_organization_slug,
            interactive=interactive,
        )
        _require_argument(
            args,
            "email",
            "--email",
            "E-mail principal",
            normalize_email,
            interactive=interactive,
        )
        if args.full_wizard:
            args.organization_type = _prompt_validated(
                "Tipo da organização",
                lambda value: normalize_organization_type(value).value,
                default=args.organization_type,
            )
            privacy_email = _prompt_validated(
                "E-mail para assuntos de privacidade",
                normalize_email,
                default=args.email,
            )
            args.privacy_contact_email = privacy_email
            args.phone = _prompt_optional("Telefone")
            args.display_name = _prompt_optional("Nome público", default=args.name)
            args.legal_name = _prompt_optional("Nome legal ou firma")
            args.tax_id = _prompt_optional("NIF")
            args.country = _prompt_optional("País", default=args.country) or args.country
            args.currency_code = _prompt_validated(
                "Moeda",
                _currency_code,
                default=args.currency_code,
            )
        return

    _require_argument(
        args,
        "slug",
        "--slug",
        "Slug da organização",
        normalize_organization_slug,
        interactive=interactive,
    )
    if args.action == "update" and args.full_wizard:
        args.name = _prompt_update_value("Novo nome")
        args.email = _prompt_update_value("Novo e-mail principal", validator=normalize_email)
        args.privacy_contact_email = _prompt_update_value(
            "Novo e-mail de privacidade",
            validator=normalize_email,
            clearable=True,
        )
        args.phone = _prompt_update_value("Novo telefone", clearable=True)
    if args.action == "cancel-access" and args.replace and args.confirm is None:
        if not interactive:
            raise ValueError("Missing required argument: --confirm.")
        args.confirm = _read_input("Repita o slug para substituir o prazo: ").strip()
    if args.action == "purge" and args.confirm is None:
        if not interactive:
            raise ValueError("Missing required argument: --confirm.")
        args.confirm = _read_input(
            "Repita o slug para confirmar a eliminação definitiva: "
        ).strip()


def _prepare_domain_args(args: argparse.Namespace, *, interactive: bool) -> None:
    if args.action in {"create", "list"}:
        _require_argument(
            args,
            "organization_slug",
            "--organization-slug",
            "Slug da organização",
            normalize_organization_slug,
            interactive=interactive,
        )
    if args.action != "list":
        _require_argument(
            args,
            "domain",
            "--domain",
            "Domínio ou URL",
            normalize_hostname,
            interactive=interactive,
        )
    if args.action == "create" and args.full_wizard:
        args.verified = _prompt_boolean("O domínio já foi verificado", default=False)
        args.primary = _prompt_boolean("Tornar este o domínio primário", default=False)
    if args.action == "update" and args.full_wizard:
        args.verified = _prompt_optional_boolean("Marcar como verificado")
        args.primary = _prompt_optional_boolean("Marcar como domínio primário")


def _prepare_args(args: argparse.Namespace) -> None:
    interactive = bool(getattr(sys.stdin, "isatty", lambda: False)())
    if args.scope == "organization":
        _prepare_organization_args(args, interactive=interactive)
    elif args.scope == "domain":
        _prepare_domain_args(args, interactive=interactive)


def _run_organization(args: argparse.Namespace) -> object:
    with SessionLocal() as db:
        if args.action == "create":
            check_database_ready(
                db,
                "organization",
                "organization_profile",
                "organization_experience",
            )
            return create_organization(
                db,
                name=args.name,
                slug=args.slug,
                organization_type=normalize_organization_type(args.organization_type),
                email=args.email,
                privacy_contact_email=args.privacy_contact_email,
                phone=args.phone,
                display_name=args.display_name,
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
                normalized_email = normalize_email(args.email)
                organization.email = normalized_email
                if profile:
                    profile.email = normalized_email
            if args.phone is not None:
                normalized_phone = args.phone.strip() or None
                organization.phone = normalized_phone
                if profile:
                    profile.phone = normalized_phone
            if profile and args.privacy_contact_email is not None:
                profile.privacy_contact_email = (
                    normalize_email(args.privacy_contact_email)
                    if args.privacy_contact_email.strip()
                    else None
                )
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
            check_database_ready(db, "organization", "organization_domain")
            domain = add_organization_domain(
                db,
                organization_slug=args.organization_slug,
                domain=args.domain,
                is_verified=args.verified,
                is_primary=args.primary,
            )
            return {"domain": domain.domain, "organization_id": domain.organization_id}
        if args.action == "list":
            organization, domains = list_organization_domains(
                db,
                organization_slug=args.organization_slug,
            )
            return [
                {
                    "organization_slug": organization.slug,
                    "hostname": domain.domain,
                    "verified": domain.is_verified,
                    "primary": domain.is_primary,
                    "active": domain.deactivated_at is None,
                }
                for domain in domains
            ]
        if args.action == "update":
            domain = update_organization_domain(
                db,
                domain=args.domain,
                is_verified=args.verified,
                is_primary=args.primary,
            )
            return {"domain": domain.domain, "updated": True}
        if args.action == "deactivate":
            domain = set_organization_domain_active(
                db,
                domain=args.domain,
                active=False,
            )
        elif args.action == "reactivate":
            domain = set_organization_domain_active(
                db,
                domain=args.domain,
                active=True,
            )
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


def _render_domain_table(rows: list[dict]) -> None:
    headings = ("HOSTNAME", "VERIFIED", "PRIMARY", "ACTIVE")
    values = [
        (
            str(row["hostname"]),
            "yes" if row["verified"] else "no",
            "yes" if row["primary"] else "no",
            "yes" if row["active"] else "no",
        )
        for row in rows
    ]
    widths = (
        [max(len(headings[index]), *(len(row[index]) for row in values)) for index in range(4)]
        if values
        else [len(item) for item in headings]
    )
    print("  ".join(value.ljust(widths[index]) for index, value in enumerate(headings)))
    for row in values:
        print("  ".join(value.ljust(widths[index]) for index, value in enumerate(row)))


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args(argv)
    try:
        _prepare_args(args)
        if args.scope == "organization":
            result = _run_organization(args)
        elif args.scope == "domain":
            result = _run_domain(args)
            if args.action == "list" and args.format == "table":
                _render_domain_table(result)
                return 0
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
    except (IntegrityError, RuntimeError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
