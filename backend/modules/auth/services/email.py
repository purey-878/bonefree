"""Transactional emails for application flows."""

from __future__ import annotations

import logging
from html import escape

from core.config import settings
from core.email_provider import email_service

logger = logging.getLogger(__name__)


def send_welcome_email(email: str, name: str | None = None, *, raise_errors: bool = False) -> bool:
    display_name = (name or "customer").strip() or "customer"
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
    display_name = (name or "customer").strip() or "customer"
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


def send_organization_access_notice(
    email: str,
    organization_name: str,
    *,
    subject: str,
    message: str,
) -> bool:
    text = (
        f"{organization_name}\n\n{message}\n\n"
        "Este email não contém anexos."
    )
    html = _layout(
        title=escape(subject),
        body=message,
        accent="Os ficheiros nunca são enviados por email.",
        brand=organization_name,
    )
    return _send_email(email, subject, text, html, from_name=organization_name)


def _send_email(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
    *,
    raise_errors: bool = False,
    from_name: str | None = None,
) -> bool:
    if not settings.auth_emails_enabled:
        logger.info("Auth email skipped because AUTH_EMAILS_ENABLED is disabled.")
        return False

    try:
        sent = email_service.send_email(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            plain_body=text_body,
            from_name=from_name or settings.auth_email_from_name,
        )
        if sent:
            logger.info("Auth email sent to %s.", to_email)
        else:
            logger.warning("Auth email not sent to %s. Check email provider configuration/logs.", to_email)
        return sent
    except Exception:
        logger.exception("Failed to send auth email to %s.", to_email)
        if raise_errors:
            raise
        return False


def _layout(title: str, body: str, accent: str, *, brand: str = "BONEFREE") -> str:
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
                    <div style="font-weight:900;font-size:20px;letter-spacing:.04em;">{escape(brand)}</div>
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
