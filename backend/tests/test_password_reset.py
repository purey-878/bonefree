from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from services.password_reset import (  # noqa: E402
    MAX_OTP_ATTEMPTS,
    can_reset_password,
    clear_password_reset,
    hash_secret,
    start_password_reset,
    verify_password_reset_code,
)


@dataclass
class FakeUser:
    password_reset_code_hash: str | None = None
    password_reset_expires_at: datetime | None = None
    password_reset_attempts: int | None = 0
    password_reset_verified_until: datetime | None = None
    password_reset_token_hash: str | None = None


class PasswordResetTests(unittest.TestCase):
    def test_start_password_reset_stores_hashed_code(self):
        user = FakeUser()
        now = datetime(2026, 5, 13, 12, 0, 0)

        with patch("services.password_reset.generate_otp", return_value="123456"):
            code = start_password_reset(user, now)

        self.assertEqual(code, "123456")
        self.assertEqual(user.password_reset_code_hash, hash_secret("123456"))
        self.assertGreater(user.password_reset_expires_at, now)

    def test_verify_password_reset_code_returns_token(self):
        user = FakeUser()
        now = datetime(2026, 5, 13, 12, 0, 0)

        with patch("services.password_reset.generate_otp", return_value="123456"):
            start_password_reset(user, now)
        with patch("services.password_reset.generate_reset_token", return_value="reset-token"):
            valid, message, token = verify_password_reset_code(user, "123456", now)

        self.assertTrue(valid)
        self.assertEqual(message, "Password reset code verified.")
        self.assertEqual(token, "reset-token")
        self.assertIsNone(user.password_reset_code_hash)
        self.assertEqual(user.password_reset_token_hash, hash_secret("reset-token"))

    def test_invalid_code_increments_attempts(self):
        user = FakeUser()
        with patch("services.password_reset.generate_otp", return_value="123456"):
            start_password_reset(user)

        valid, message, token = verify_password_reset_code(user, "000000")

        self.assertFalse(valid)
        self.assertEqual(message, "Invalid password reset code.")
        self.assertIsNone(token)
        self.assertEqual(user.password_reset_attempts, 1)

    def test_expired_code_is_cleared(self):
        user = FakeUser(
            password_reset_code_hash=hash_secret("123456"),
            password_reset_expires_at=datetime(2026, 5, 13, 12, 0, 0),
            password_reset_attempts=0,
        )

        valid, message, token = verify_password_reset_code(
            user,
            "123456",
            datetime(2026, 5, 13, 12, 11, 0),
        )

        self.assertFalse(valid)
        self.assertIn("expired", message)
        self.assertIsNone(token)
        self.assertIsNone(user.password_reset_code_hash)

    def test_too_many_attempts_clears_challenge(self):
        user = FakeUser(
            password_reset_code_hash=hash_secret("123456"),
            password_reset_expires_at=datetime.utcnow() + timedelta(minutes=5),
            password_reset_attempts=MAX_OTP_ATTEMPTS,
        )

        valid, message, _ = verify_password_reset_code(user, "000000")

        self.assertFalse(valid)
        self.assertIn("Too many incorrect attempts", message)
        self.assertIsNone(user.password_reset_code_hash)

    def test_can_reset_password_with_valid_token(self):
        user = FakeUser(
            password_reset_token_hash=hash_secret("reset-token"),
            password_reset_verified_until=datetime(2026, 5, 13, 12, 15, 0),
        )

        allowed, message = can_reset_password(user, "reset-token", datetime(2026, 5, 13, 12, 2, 0))

        self.assertTrue(allowed)
        self.assertEqual(message, "Password reset authorized.")

    def test_clear_password_reset_removes_state(self):
        user = FakeUser(
            password_reset_code_hash="hash",
            password_reset_expires_at=datetime.utcnow(),
            password_reset_attempts=2,
            password_reset_verified_until=datetime.utcnow(),
            password_reset_token_hash="token",
        )

        clear_password_reset(user)

        self.assertIsNone(user.password_reset_code_hash)
        self.assertIsNone(user.password_reset_expires_at)
        self.assertEqual(user.password_reset_attempts, 0)
        self.assertIsNone(user.password_reset_verified_until)
        self.assertIsNone(user.password_reset_token_hash)


if __name__ == "__main__":
    unittest.main()
