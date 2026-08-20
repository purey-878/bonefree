from __future__ import annotations

import logging
import mimetypes
import smtplib
import ssl
from abc import ABC, abstractmethod
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path
from typing import Iterable

from core.config import settings

try:
    import certifi
except ModuleNotFoundError:
    certifi = None


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmailAttachment:
    filename: str
    content: bytes
    content_type: str | None = None


@dataclass(frozen=True)
class EmailMessageData:
    to_email: str
    subject: str
    html_body: str
    plain_body: str | None = None
    from_email: str | None = None
    from_name: str | None = None
    attachments: tuple[EmailAttachment, ...] = ()


class EmailProvider(ABC):
    @abstractmethod
    def send(self, message: EmailMessageData) -> bool:
        """Send an email message using a concrete provider."""


class TerminalEmailProvider(EmailProvider):
    def send(self, message: EmailMessageData) -> bool:
        from_email = message.from_email or settings.effective_email_from or "terminal@bonefree.local"
        from_name = message.from_name or settings.auth_email_from_name

        lines = [
            "",
            "=" * 80,
            "EMAIL_PROVIDER=terminal",
            f"From: {formataddr((from_name, from_email))}",
            f"To: {message.to_email}",
            f"Subject: {message.subject}",
            "-" * 80,
            "Plain body:",
            message.plain_body or "",
            "-" * 80,
            "HTML body:",
            message.html_body,
        ]

        if message.attachments:
            lines.extend(
                [
                    "-" * 80,
                    "Attachments:",
                ]
            )
            for attachment in message.attachments:
                lines.append(
                    f"- {attachment.filename} "
                    f"({attachment.content_type or 'application/octet-stream'}, {len(attachment.content)} bytes)"
                )

        lines.extend(["=" * 80, ""])
        print("\n".join(lines))
        logger.info("Terminal email rendered for %s.", message.to_email)
        return True


class SmtpEmailProvider(EmailProvider):
    def send(self, message: EmailMessageData) -> bool:
        try:
            email_message = self._build_message(message)
            host = self._required_setting(settings.smtp_host, "SMTP_HOST")
            port = settings.effective_smtp_port
            context = self._ssl_context()

            if settings.effective_smtp_secure:
                with smtplib.SMTP_SSL(
                    host,
                    port,
                    context=context,
                    timeout=settings.email_send_timeout_seconds,
                ) as smtp:
                    self._login(smtp)
                    smtp.send_message(email_message)
                return True

            with smtplib.SMTP(
                host,
                port,
                timeout=settings.email_send_timeout_seconds,
            ) as smtp:
                if settings.smtp_starttls:
                    smtp.starttls(context=context)
                self._login(smtp)
                smtp.send_message(email_message)

            return True
        except smtplib.SMTPAuthenticationError as exc:
            logger.exception("SMTP authentication failed while sending email to %s.", message.to_email)
            raise smtplib.SMTPAuthenticationError(
                exc.smtp_code,
                "Gmail SMTP auth failed — use an App Password, not your account password. "
                "See https://myaccount.google.com/apppasswords",
            ) from exc
        except Exception:
            logger.exception("Error sending email to %s via SMTP.", message.to_email)
            return False

    def _build_message(self, message: EmailMessageData) -> EmailMessage:
        email_message = EmailMessage()
        from_email = message.from_email or self._required_setting(settings.effective_email_from, "EMAIL_FROM")
        from_name = message.from_name or settings.auth_email_from_name

        email_message["From"] = formataddr((from_name, from_email))
        email_message["To"] = message.to_email
        email_message["Subject"] = message.subject
        email_message.set_content(message.plain_body or "Este email contém conteúdo em HTML.")
        email_message.add_alternative(message.html_body, subtype="html")

        for attachment in message.attachments:
            self._add_attachment(email_message, attachment)

        return email_message

    def _login(self, smtp: smtplib.SMTP) -> None:
        username = settings.smtp_user
        password = settings.smtp_password
        if username and password:
            smtp.login(username, password)

    def _ssl_context(self) -> ssl.SSLContext:
        if certifi is None:
            return ssl.create_default_context()
        return ssl.create_default_context(cafile=certifi.where())

    def _add_attachment(self, message: EmailMessage, attachment: EmailAttachment) -> None:
        content_type = attachment.content_type or mimetypes.guess_type(attachment.filename)[0]
        if not content_type:
            content_type = "application/octet-stream"

        maintype, subtype = content_type.split("/", 1)
        message.add_attachment(
            attachment.content,
            maintype=maintype,
            subtype=subtype,
            filename=attachment.filename,
        )

    def _required_setting(self, value: str | None, name: str) -> str:
        if value is None or value.strip() == "":
            raise ValueError(f"{name} is required to send emails.")
        return value


class EmailService:
    def __init__(self, provider: EmailProvider) -> None:
        self.provider = provider

    def send_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        plain_body: str | None = None,
        *,
        from_email: str | None = None,
        from_name: str | None = None,
    ) -> bool:
        return self.provider.send(
            EmailMessageData(
                to_email=to_email,
                subject=subject,
                html_body=html_body,
                plain_body=plain_body,
                from_email=from_email,
                from_name=from_name,
            )
        )

    def send_email_with_attachment(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        attachment_bytes: bytes,
        filename: str,
        plain_body: str | None = None,
        content_type: str | None = None,
        *,
        from_email: str | None = None,
        from_name: str | None = None,
    ) -> bool:
        attachment = EmailAttachment(
            filename=filename,
            content=attachment_bytes,
            content_type=content_type,
        )
        return self.send_email_with_attachments(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            attachments=[attachment],
            plain_body=plain_body,
            from_email=from_email,
            from_name=from_name,
        )

    def send_email_with_attachments(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        attachments: Iterable[EmailAttachment],
        plain_body: str | None = None,
        *,
        from_email: str | None = None,
        from_name: str | None = None,
    ) -> bool:
        return self.provider.send(
            EmailMessageData(
                to_email=to_email,
                subject=subject,
                html_body=html_body,
                plain_body=plain_body,
                from_email=from_email,
                from_name=from_name,
                attachments=tuple(attachments),
            )
        )

    def send_email_with_file(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        file_path: str | Path,
        plain_body: str | None = None,
        *,
        from_email: str | None = None,
        from_name: str | None = None,
    ) -> bool:
        path = Path(file_path)
        if not path.exists() or not path.is_file():
            logger.error("Email attachment file not found: %s", path)
            return False

        content_type = mimetypes.guess_type(path.name)[0]
        return self.send_email_with_attachment(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            attachment_bytes=path.read_bytes(),
            filename=path.name,
            plain_body=plain_body,
            content_type=content_type,
            from_email=from_email,
            from_name=from_name,
        )


def validate_email_config() -> list[str]:
    missing: list[str] = []

    if settings.email_provider == "terminal":
        return missing

    if settings.email_provider == "smtp":
        if not _present(settings.smtp_host):
            missing.append("SMTP_HOST")
        if settings.smtp_port is None:
            missing.append("SMTP_PORT")
        if not _present(settings.smtp_user):
            missing.append("SMTP_USER")
        if not _present(settings.smtp_password):
            missing.append("SMTP_PASSWORD/SMTP_PASS")
        if not _present(settings.effective_email_from):
            missing.append("AUTH_EMAIL_FROM/EMAIL_FROM/RECEIPT_FROM_EMAIL/RECEIPT_COMPANY_EMAIL/SMTP_USER")
        return missing

    missing.append(f"Unsupported EMAIL_PROVIDER: {settings.email_provider}")
    return missing


def create_email_provider() -> EmailProvider:
    if settings.email_provider == "terminal":
        return TerminalEmailProvider()

    if settings.email_provider == "smtp":
        return SmtpEmailProvider()

    raise ValueError(f"Unsupported EMAIL_PROVIDER: {settings.email_provider}")


def _present(value: str | None) -> bool:
    return value is not None and value.strip() != ""


email_service = EmailService(create_email_provider())