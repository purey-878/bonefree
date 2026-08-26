import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from utils.validation import (  # noqa: E402
    normalize_phone,
    validate_email,
    validate_name,
    validate_portuguese_tax_id,
    validate_password,
    validate_postal_code,
)
from modules.restaurant.schemas.checkout import CheckoutCustomer  # noqa: E402
from modules.auth.schemas.user import ResetPasswordRequest, UserRegister  # noqa: E402


class PortugueseValidationTests(unittest.TestCase):
    def test_valid_tax_id_checksum(self):
        self.assertEqual(validate_portuguese_tax_id("123456789"), "123456789")

    def test_tax_id_requires_nine_digits(self):
        with self.assertRaisesRegex(ValueError, "Portuguese tax ID must contain exactly 9 digits."):
            validate_portuguese_tax_id("123 456 789")
        with self.assertRaisesRegex(ValueError, "Portuguese tax ID must contain exactly 9 digits."):
            validate_portuguese_tax_id("12345678")

    def test_tax_id_rejects_bad_checksum(self):
        with self.assertRaisesRegex(ValueError, "Invalid Portuguese tax ID."):
            validate_portuguese_tax_id("123456788")

    def test_phone_normalization_and_validation(self):
        self.assertEqual(normalize_phone("912 345 678"), "912345678")
        self.assertEqual(normalize_phone("+351 912 345 678"), "+351912345678")

    def test_phone_rejects_symbols_and_invalid_numbers(self):
        with self.assertRaisesRegex(ValueError, "Phone number must contain only digits."):
            normalize_phone("912-345-678")
        with self.assertRaisesRegex(ValueError, "Invalid Portuguese phone number."):
            normalize_phone("212345678")

    def test_name_supports_portuguese_characters(self):
        self.assertEqual(validate_name("João Silva"), "João Silva")
        self.assertEqual(validate_name("Ana-Maria"), "Ana-Maria")
        self.assertEqual(validate_name("D'Oliveira"), "D'Oliveira")
        self.assertEqual(validate_name("D’Oliveira"), "D’Oliveira")

    def test_name_rejects_numbers_and_symbols(self):
        with self.assertRaisesRegex(ValueError, "Name cannot contain only numbers."):
            validate_name("123456")
        with self.assertRaisesRegex(ValueError, "Enter a valid full name."):
            validate_name("abc123@@")

    def test_email_rejects_malformed_and_disposable(self):
        self.assertEqual(validate_email("User@Example.com"), "user@example.com")
        with self.assertRaisesRegex(ValueError, "Invalid email address."):
            validate_email("bad-email")
        with self.assertRaisesRegex(ValueError, "Invalid email address."):
            validate_email("user@mailinator.com")

    def test_password_policy(self):
        self.assertEqual(validate_password("Valid1!x"), "Valid1!x")
        with self.assertRaisesRegex(ValueError, "Password must contain uppercase and lowercase letters, a number, and a special character."):
            validate_password("weakpass")

    def test_portuguese_postal_code(self):
        self.assertEqual(validate_postal_code("1000-001"), "1000-001")
        with self.assertRaisesRegex(ValueError, "Postal code must use the Portuguese XXXX-XXX format."):
            validate_postal_code("1000001")

    def test_checkout_customer_schema_normalizes_phone_and_rejects_bad_tax_id(self):
        customer = CheckoutCustomer(
            first_name="João",
            last_name="Silva",
            email="joao@example.com",
            phone="+351 912 345 678",
            tax_id="123456789",
        )
        self.assertEqual(customer.phone, "+351912345678")
        with self.assertRaises(Exception):
            CheckoutCustomer(
                first_name="João",
                last_name="Silva",
                email="joao@example.com",
                phone="912345678",
                tax_id="123456788",
            )

    def test_auth_schemas_enforce_password_policy(self):
        user = UserRegister(
            email="maria@example.com",
            password="Valid1!x",
            name="Maria",
            last_name="Costa",
        )
        self.assertEqual(user.email, "maria@example.com")
        with self.assertRaises(Exception):
            ResetPasswordRequest(
                email="maria@example.com",
                reset_token="x" * 20,
                new_password="weakpass",
            )


if __name__ == "__main__":
    unittest.main()
