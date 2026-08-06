"""Transactional emails for account authentication flows."""

from __future__ import annotations

import json
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from typing import Any
from urllib import request

try:
    import certifi
except ModuleNotFoundError:
    certifi = None


logger = logging.getLogger(__name__)


def validate_email_config() -> list[str]:
    missing: list[str] = []

    for key in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER"):
        if not _env_present(key):
            missing.append(key)

    if not (_env_present("SMTP_PASSWORD") or _env_present("SMTP_PASS")):
        missing.append("SMTP_PASSWORD/SMTP_PASS")

    if not (_env_present("AUTH_EMAIL_FROM") or _env_present("SMTP_USER")):
        missing.append("AUTH_EMAIL_FROM/SMTP_USER")

    return missing


def send_welcome_email(email: str, name: str | None = None, *, raise_errors: bool = False) -> bool:
    display_name = (name or "cliente").strip() or "cliente"
    subject = "Bem-vindo ao Bonefree"
    text = (
        f"Ola {display_name},\n\n"
        "Bem-vindo ao Bonefree. A sua conta está pronta e já pode guardar os seus dados, "
        "customizar pedidos e finalizar compras mais rapidamente.\n\n"
        "Até à mesa,\nBonefree"
    )
    html = _layout(
        title=f"Bem-vindo, {escape(display_name)}.",
        body=(
            "A sua conta Bonefree está pronta. Já pode guardar os seus dados, customizar pedidos "
            "e finalizar compras mais rapidamente sempre que nos visitar."
        ),
        accent="Comece o seu próximo pedido a partir do menu quando estiver pronto.",
    )
    return _send_email(email, subject, text, html, raise_errors=raise_errors)


def send_password_reset_email(email: str, code: str, name: str | None = None) -> bool:
    display_name = (name or "cliente").strip() or "cliente"
    subject = "O seu código de redefinição da palavra-passe Bonefree"
    text = (
        f"Ola {display_name},\n\n"
        f"O seu código de redefinição da palavra-passe Bonefree é {code}. Expira em 10 minutos.\n\n"
        "Se não pediu isto, pode ignorar este email.\n\n"
        "Bonefree"
    )
    html = _layout(
        title="Código de redefinição da palavra-passe",
        body="Use este código único para confirmar o pedido de redefinição da palavra-passe. Expira em 10 minutos.",
        accent=f"<span style='font-size:32px; letter-spacing:8px; font-weight:800;'>{escape(code)}</span>",
    )
    return _send_email(email, subject, text, html)


def _send_email(to_email: str, subject: str, text_body: str, html_body: str, *, raise_errors: bool = False) -> bool:
    if not _env_flag("AUTH_EMAILS_ENABLED", default=True):
        logger.info("Auth email skipped because AUTH_EMAILS_ENABLED is disabled.")
        return False

    try:
        if os.getenv("SENDGRID_API_KEY"):
            _send_with_sendgrid(to_email, subject, text_body, html_body)
        elif os.getenv("SMTP_HOST"):
            _send_with_smtp(to_email, subject, text_body, html_body)
        else:
            logger.warning("Auth email not sent. Configure SENDGRID_API_KEY or SMTP_HOST.")
            return False

        logger.info("Auth email sent to %s.", to_email)
        return True
    except Exception:
        logger.exception("Failed to send auth email to %s.", to_email)
        if raise_errors:
            raise
        return False


def _send_with_sendgrid(to_email: str, subject: str, text_body: str, html_body: str) -> None:
    payload: dict[str, Any] = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": _sender_email(), "name": _sender_name()},
        "subject": subject,
        "content": [
            {"type": "text/plain", "value": text_body},
            {"type": "text/html", "value": html_body},
        ],
    }

    req = request.Request(
        "https://api.sendgrid.com/v3/mail/send",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {os.environ['SENDGRID_API_KEY']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    context = _ssl_context()
    with request.urlopen(req, context=context, timeout=20) as response:
        if response.status >= 300:
            raise RuntimeError(f"SendGrid returned status {response.status}")


def _send_with_smtp(to_email: str, subject: str, text_body: str, html_body: str) -> None:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((_sender_name(), _sender_email()))
    message["To"] = to_email
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    host = os.environ["SMTP_HOST"]
    configured_port = os.getenv("SMTP_PORT")
    secure = _env_flag("SMTP_SECURE", default=configured_port == "465")
    port = int(configured_port or ("465" if secure else "587"))
    context = _ssl_context()

    try:
        if secure:
            with smtplib.SMTP_SSL(host, port, context=context, timeout=20) as smtp:
                _smtp_login(smtp)
                smtp.send_message(message)
            return

        with smtplib.SMTP(host, port, timeout=20) as smtp:
            if _env_flag("SMTP_STARTTLS", default=True):
                smtp.starttls(context=context)
            _smtp_login(smtp)
            smtp.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        raise smtplib.SMTPAuthenticationError(
            exc.smtp_code,
            "Gmail SMTP auth failed — use an App Password, not your account password. "
            "See https://myaccount.google.com/apppasswords",
        ) from exc


def _ssl_context() -> ssl.SSLContext:
    if certifi is None:
        return ssl.create_default_context()
    return ssl.create_default_context(cafile=certifi.where())


def _smtp_login(smtp: smtplib.SMTP) -> None:
    username = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD") or os.getenv("SMTP_PASS")
    if username and password:
        smtp.login(username, password)


def _layout(title: str, body: str, accent: str) -> str:
    return f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6f8;padding:32px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e6e8ec;border-radius:16px;overflow:hidden;">
                <tr>
                  <td style="padding:30px 34px;">
                    <div style="font-weight:900;font-size:20px;letter-spacing:.04em;">BONEFREE</div>
                    <h1 style="margin:26px 0 12px;font-size:28px;line-height:1.15;">{title}</h1>
                    <p style="margin:0 0 22px;color:#5f6673;font-size:15px;line-height:1.65;">{escape(body)}</p>
                    <div style="border:1px solid #e7eadf;border-radius:12px;background:#fafbf4;padding:18px;text-align:center;color:#1f3d28;">{accent}</div>
                    <p style="margin:22px 0 0;color:#8b93a1;font-size:13px;line-height:1.5;">Se não foi você, pode ignorar esta mensagem com segurança.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """


def _sender_email() -> str:
    return (
        os.getenv("AUTH_EMAIL_FROM")
        or os.getenv("EMAIL_FROM")
        or os.getenv("RECEIPT_FROM_EMAIL")
        or os.getenv("RECEIPT_COMPANY_EMAIL")
        or os.getenv("SMTP_USER")
        or "carambolarubra@gmail.com"
    )


def _sender_name() -> str:
    return os.getenv("AUTH_EMAIL_FROM_NAME", "Bonefree")


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _env_present(name: str) -> bool:
    raw = os.getenv(name)
    return raw is not None and raw.strip() != ""
