import smtplib
import sys
import unittest
from pathlib import Path
from unittest.mock import PropertyMock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from core.email_provider import EmailMessageData, SmtpEmailProvider, TerminalEmailProvider, create_email_provider, validate_email_config  # noqa: E402
from core.config import settings  # noqa: E402


class FakeSMTP:
    instances = []

    def __init__(self, host, port, **kwargs):
        self.host = host
        self.port = port
        self.kwargs = kwargs
        self.started_tls = False
        self.login_args = None
        self.message = None
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def starttls(self, context=None):
        self.started_tls = True
        self.starttls_context = context

    def login(self, username, password):
        self.login_args = (username, password)

    def send_message(self, message):
        self.message = message


class AuthFailingSMTP(FakeSMTP):
    def login(self, username, password):
        raise smtplib.SMTPAuthenticationError(535, b"Authentication failed")


class AuthEmailProviderTests(unittest.TestCase):
    def test_terminal_provider_prints_email_without_smtp_config(self):
        provider = TerminalEmailProvider()

        with (
            patch.object(settings, "auth_email_from_name", "Bonefree Dev"),
            patch.object(type(settings), "effective_email_from", new_callable=PropertyMock, return_value=None),
            patch("builtins.print") as mocked_print,
        ):
            sent = provider.send(
                EmailMessageData(
                    to_email="guest@example.com",
                    subject="Código de teste",
                    plain_body="123456",
                    html_body="<strong>123456</strong>",
                )
            )

        self.assertTrue(sent)
        printed = mocked_print.call_args.args[0]
        self.assertIn("EMAIL_PROVIDER=terminal", printed)
        self.assertIn("From: Bonefree Dev <terminal@bonefree.local>", printed)
        self.assertIn("To: guest@example.com", printed)
        self.assertIn("Subject: Código de teste", printed)
        self.assertIn("123456", printed)

    def test_create_email_provider_returns_terminal_provider(self):
        with patch.object(settings, "email_provider", "terminal"):
            self.assertIsInstance(create_email_provider(), TerminalEmailProvider)

    def test_validate_email_config_ignores_smtp_keys_for_terminal_provider(self):
        with (
            patch.object(settings, "email_provider", "terminal"),
            patch.object(settings, "smtp_host", None),
            patch.object(settings, "smtp_port", None),
            patch.object(settings, "smtp_user", None),
            patch.object(type(settings), "smtp_password", new_callable=PropertyMock, return_value=None),
            patch.object(type(settings), "effective_email_from", new_callable=PropertyMock, return_value=None),
        ):
            self.assertEqual(validate_email_config(), [])


class AuthEmailSMTPTests(unittest.TestCase):
    def setUp(self):
        FakeSMTP.instances = []

    def test_smtp_starttls_can_be_disabled_for_local_mail_servers(self):
        provider = SmtpEmailProvider()

        with (
            patch.object(settings, "smtp_host", "localhost"),
            patch.object(settings, "smtp_port", 1025),
            patch.object(settings, "smtp_secure", False),
            patch.object(settings, "smtp_starttls", False),
            patch.object(settings, "smtp_user", "bonefree@example.com"),
            patch.object(type(settings), "smtp_password", new_callable=PropertyMock, return_value="secret"),
            patch.object(
                type(settings),
                "effective_email_from",
                new_callable=PropertyMock,
                return_value="noreply@example.com",
            ),
            patch("core.email_provider.smtplib.SMTP", FakeSMTP),
        ):
            sent = provider.send(
                EmailMessageData(
                    to_email="guest@example.com",
                    subject="Subject",
                    plain_body="Text",
                    html_body="<p>Html</p>",
                    from_name="Bonefree",
                )
            )

        self.assertTrue(sent)
        smtp = FakeSMTP.instances[0]
        self.assertEqual((smtp.host, smtp.port), ("localhost", 1025))
        self.assertFalse(smtp.started_tls)
        self.assertEqual(smtp.login_args, ("bonefree@example.com", "secret"))
        self.assertEqual(smtp.message["From"], "Bonefree <noreply@example.com>")
        self.assertEqual(smtp.message["To"], "guest@example.com")

    def test_smtp_secure_uses_ssl_transport(self):
        provider = SmtpEmailProvider()

        with (
            patch.object(settings, "smtp_host", "smtp.example.com"),
            patch.object(settings, "smtp_port", None),
            patch.object(settings, "smtp_secure", True),
            patch.object(settings, "smtp_user", "bonefree@example.com"),
            patch.object(type(settings), "smtp_password", new_callable=PropertyMock, return_value="secret"),
            patch.object(
                type(settings),
                "effective_email_from",
                new_callable=PropertyMock,
                return_value="bonefree@example.com",
            ),
            patch("core.email_provider.smtplib.SMTP_SSL", FakeSMTP),
        ):
            sent = provider.send(
                EmailMessageData(
                    to_email="guest@example.com",
                    subject="Subject",
                    plain_body="Text",
                    html_body="<p>Html</p>",
                )
            )

        self.assertTrue(sent)
        smtp = FakeSMTP.instances[0]
        self.assertEqual((smtp.host, smtp.port), ("smtp.example.com", 465))
        self.assertFalse(smtp.started_tls)
        self.assertEqual(smtp.login_args, ("bonefree@example.com", "secret"))

    def test_port_465_defaults_to_ssl_transport(self):
        provider = SmtpEmailProvider()

        with (
            patch.object(settings, "smtp_host", "smtp.example.com"),
            patch.object(settings, "smtp_port", 465),
            patch.object(settings, "smtp_secure", None),
            patch.object(settings, "smtp_user", None),
            patch.object(type(settings), "smtp_password", new_callable=PropertyMock, return_value=None),
            patch.object(
                type(settings),
                "effective_email_from",
                new_callable=PropertyMock,
                return_value="bonefree@example.com",
            ),
            patch("core.email_provider.smtplib.SMTP_SSL", FakeSMTP),
        ):
            sent = provider.send(
                EmailMessageData(
                    to_email="guest@example.com",
                    subject="Subject",
                    plain_body="Text",
                    html_body="<p>Html</p>",
                )
            )

        self.assertTrue(sent)
        smtp = FakeSMTP.instances[0]
        self.assertEqual((smtp.host, smtp.port), ("smtp.example.com", 465))
        self.assertFalse(smtp.started_tls)

    def test_effective_email_from_falls_back_to_smtp_user(self):
        with (
            patch.object(settings, "auth_email_from", None),
            patch.object(settings, "email_from", None),
            patch.object(settings, "smtp_user", "bonefree@example.com"),
        ):
            self.assertEqual(settings.effective_email_from, "bonefree@example.com")

    def test_validate_email_config_reports_missing_required_keys(self):
        with (
            patch.object(settings, "email_provider", "smtp"),
            patch.object(settings, "smtp_host", None),
            patch.object(settings, "smtp_port", None),
            patch.object(settings, "smtp_user", None),
            patch.object(type(settings), "smtp_password", new_callable=PropertyMock, return_value=None),
            patch.object(type(settings), "effective_email_from", new_callable=PropertyMock, return_value=None),
        ):
            self.assertEqual(
                validate_email_config(),
                [
                    "SMTP_HOST",
                    "SMTP_PORT",
                    "SMTP_USER",
                    "SMTP_PASSWORD/SMTP_PASS",
                    "AUTH_EMAIL_FROM/EMAIL_FROM/SMTP_USER",
                ],
            )

    def test_validate_email_config_accepts_smtp_pass_and_sender_fallback(self):
        with (
            patch.object(settings, "email_provider", "smtp"),
            patch.object(settings, "smtp_host", "smtp.gmail.com"),
            patch.object(settings, "smtp_port", 587),
            patch.object(settings, "smtp_user", "bonefree@example.com"),
            patch.object(type(settings), "smtp_password", new_callable=PropertyMock, return_value="secret"),
            patch.object(
                type(settings),
                "effective_email_from",
                new_callable=PropertyMock,
                return_value="bonefree@example.com",
            ),
        ):
            self.assertEqual(validate_email_config(), [])

    def test_smtp_authentication_error_mentions_gmail_app_password(self):
        provider = SmtpEmailProvider()

        with (
            patch.object(settings, "smtp_host", "smtp.gmail.com"),
            patch.object(settings, "smtp_port", 587),
            patch.object(settings, "smtp_secure", False),
            patch.object(settings, "smtp_starttls", False),
            patch.object(settings, "smtp_user", "bonefree@example.com"),
            patch.object(type(settings), "smtp_password", new_callable=PropertyMock, return_value="account-password"),
            patch.object(
                type(settings),
                "effective_email_from",
                new_callable=PropertyMock,
                return_value="bonefree@example.com",
            ),
            patch("core.email_provider.smtplib.SMTP", AuthFailingSMTP),
        ):
            with self.assertRaises(smtplib.SMTPAuthenticationError) as context:
                provider.send(
                    EmailMessageData(
                        to_email="guest@example.com",
                        subject="Subject",
                        plain_body="Text",
                        html_body="<p>Html</p>",
                    )
                )

        self.assertIn("Gmail SMTP auth failed", str(context.exception))
        self.assertIn("https://myaccount.google.com/apppasswords", str(context.exception))


if __name__ == "__main__":
    unittest.main()
