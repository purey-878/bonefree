from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from services.receipt_email import render_receipt_email  # noqa: E402
from services.receipt_pdf import receipt_pdf_filename, render_receipt_pdf  # noqa: E402


def sample_receipt():
    return {
        "company_name": "PREY",
        "company_nif": "123456789",
        "company_logo_url": "http://localhost:8000/public/images/stamp-1.png",
        "company_address": "Prey\nCosta da Caparica",
        "company_email": "hello@example.com",
        "company_phone": "+351 000 000 000",
        "customer_name": "Cliente Teste",
        "customer_nif": "",
        "customer_email": "guest@example.com",
        "customer_address": "",
        "order_id": "ENC-000123",
        "document_number": "FR 2026/000123",
        "issue_datetime": "26/05/2026 12:30",
        "payment_date": "26/05/2026 12:31",
        "order_reference": "ENC-000123",
        "order_date": "26/05/2026 12:30",
        "payment_method": "Cartão",
        "billing_address": "Cliente Teste\nguest@example.com",
        "shipping_address": "Mesa 7\nComer no restaurante PREY",
        "items": [
            {
                "name": "Burger",
                "quantity": 2,
                "unit_price_amount": "8.00",
                "line_gross_amount": "16.00",
                "discount_amount": "2.00",
                "line_total_amount": "14.00",
                "unit_price": "8,00 €",
                "price": "16,00 €",
                "customizations": ["No onion"],
            }
        ],
        "subtotal_amount": "16.00",
        "discount_amount": "2.00",
        "shipping_amount": "0.00",
        "service_fee_amount": "0.00",
        "total_amount_value": "14.00",
        "subtotal": "16,00 €",
        "discount": "2,00 €",
        "tax": "Incluído",
        "shipping": "0,00 €",
        "service_fee": None,
        "total_amount": "14,00 €",
        "iva_rate": "23",
        "iva_exemption_reason": "",
        "public_base_url": "https://prey.example",
    }


class ReceiptPDFTests(unittest.TestCase):
    def test_render_receipt_pdf_returns_pdf_bytes(self):
        pdf = render_receipt_pdf(sample_receipt())

        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertGreater(len(pdf), 1000)
        self.assertEqual(receipt_pdf_filename(sample_receipt()), "fatura-recibo-FR-2026-000123.pdf")

    def test_receipt_email_renders_discount_without_empty_service_fee(self):
        html = render_receipt_email(sample_receipt())

        self.assertIn("Desconto", html)
        self.assertIn("-2,00 €", html)
        self.assertIn(">PREY</span>", html)
        self.assertNotIn("<img", html)
        self.assertIn("Incluído", html)
        self.assertIn("Mesa 7", html)
        self.assertIn("Comer no restaurante PREY", html)
        self.assertNotIn("Included", html)
        self.assertNotIn("Dine in at Prey", html)
        self.assertNotIn("Table 7", html)
        self.assertNotIn("Taxa de serviço", html)


if __name__ == "__main__":
    unittest.main()
