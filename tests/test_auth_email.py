import os
from pathlib import Path
import smtplib
import sys
import unittest
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from services.auth_email import _send_with_smtp, _sender_email, validate_email_config  # noqa: E402


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


class AuthEmailSMTPTests(unittest.TestCase):
    def setUp(self):
        FakeSMTP.instances = []

    def test_smtp_starttls_can_be_disabled_for_local_mail_servers(self):
        env = {
            "SMTP_HOST": "localhost",
            "SMTP_PORT": "1025",
            "SMTP_USER": "prey@example.com",
            "SMTP_PASS": "secret",
            "SMTP_STARTTLS": "false",
            "AUTH_EMAIL_FROM": "noreply@example.com",
        }

        with patch.dict(os.environ, env, clear=True), patch(
            "services.auth_email.smtplib.SMTP",
            FakeSMTP,
        ):
            _send_with_smtp("guest@example.com", "Subject", "Text", "<p>Html</p>")

        smtp = FakeSMTP.instances[0]
        self.assertEqual((smtp.host, smtp.port), ("localhost", 1025))
        self.assertFalse(smtp.started_tls)
        self.assertEqual(smtp.login_args, ("prey@example.com", "secret"))
        self.assertEqual(smtp.message["From"], "Prey <noreply@example.com>")
        self.assertEqual(smtp.message["To"], "guest@example.com")

    def test_smtp_secure_uses_ssl_transport(self):
        env = {
            "SMTP_HOST": "smtp.example.com",
            "SMTP_SECURE": "true",
            "SMTP_USER": "prey@example.com",
            "SMTP_PASSWORD": "secret",
        }

        with patch.dict(os.environ, env, clear=True), patch(
            "services.auth_email.smtplib.SMTP_SSL",
            FakeSMTP,
        ):
            _send_with_smtp("guest@example.com", "Subject", "Text", "<p>Html</p>")

        smtp = FakeSMTP.instances[0]
        self.assertEqual((smtp.host, smtp.port), ("smtp.example.com", 465))
        self.assertFalse(smtp.started_tls)
        self.assertEqual(smtp.login_args, ("prey@example.com", "secret"))

    def test_port_465_defaults_to_ssl_transport(self):
        env = {
            "SMTP_HOST": "smtp.example.com",
            "SMTP_PORT": "465",
        }

        with patch.dict(os.environ, env, clear=True), patch(
            "services.auth_email.smtplib.SMTP_SSL",
            FakeSMTP,
        ):
            _send_with_smtp("guest@example.com", "Subject", "Text", "<p>Html</p>")

        smtp = FakeSMTP.instances[0]
        self.assertEqual((smtp.host, smtp.port), ("smtp.example.com", 465))
        self.assertFalse(smtp.started_tls)

    def test_sender_email_falls_back_to_smtp_user(self):
        with patch.dict(os.environ, {"SMTP_USER": "prey@example.com"}, clear=True):
            self.assertEqual(_sender_email(), "prey@example.com")

    def test_validate_email_config_reports_missing_required_keys(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                validate_email_config(),
                [
                    "SMTP_HOST",
                    "SMTP_PORT",
                    "SMTP_USER",
                    "SMTP_PASSWORD/SMTP_PASS",
                    "AUTH_EMAIL_FROM/SMTP_USER",
                ],
            )

    def test_validate_email_config_accepts_smtp_pass_and_sender_fallback(self):
        env = {
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
            "SMTP_USER": "prey@example.com",
            "SMTP_PASS": "secret",
        }

        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(validate_email_config(), [])

    def test_smtp_authentication_error_mentions_gmail_app_password(self):
        env = {
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
            "SMTP_USER": "prey@example.com",
            "SMTP_PASSWORD": "account-password",
            "SMTP_STARTTLS": "false",
        }

        with patch.dict(os.environ, env, clear=True), patch(
            "services.auth_email.smtplib.SMTP",
            AuthFailingSMTP,
        ):
            with self.assertRaises(smtplib.SMTPAuthenticationError) as context:
                _send_with_smtp("guest@example.com", "Subject", "Text", "<p>Html</p>")

        self.assertIn("Gmail SMTP auth failed", str(context.exception))
        self.assertIn("https://myaccount.google.com/apppasswords", str(context.exception))


if __name__ == "__main__":
    unittest.main()
