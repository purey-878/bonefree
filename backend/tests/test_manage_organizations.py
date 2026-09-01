from __future__ import annotations

from contextlib import redirect_stderr
from io import StringIO
from unittest.mock import patch
import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.pool import StaticPool

from database import Base
from models import Organization, OrganizationDomain, OrganizationProfile
from modules.auth.models import OrganizationType
from modules.auth.services.organization_management import (
    add_organization_domain,
    create_organization,
)
from scripts import manage_organizations as manage


class ManageOrganizationsPromptTests(unittest.TestCase):
    def test_complete_organization_wizard_prompts_for_optional_fields(self):
        args = manage.parse_args(["organization", "create"])
        answers = [
            "Example Restaurant",
            "example-restaurant",
            "invalid",
            "hello@example.com",
            "",
            "",
            "912345678",
            "",
            "Example Restaurant, Lda.",
            "501964843",
            "",
            "",
        ]
        errors = StringIO()
        with patch("builtins.input", side_effect=answers), redirect_stderr(errors):
            manage._prepare_organization_args(args, interactive=True)

        self.assertEqual(args.slug, "example-restaurant")
        self.assertEqual(args.email, "hello@example.com")
        self.assertEqual(args.privacy_contact_email, "hello@example.com")
        self.assertEqual(args.organization_type, OrganizationType.RESTAURANT.value)
        self.assertEqual(args.display_name, "Example Restaurant")
        self.assertEqual(args.country, "Portugal")
        self.assertEqual(args.currency_code, "EUR")
        self.assertIn("Valor inválido", errors.getvalue())

    def test_partial_create_prompts_only_for_required_missing_values(self):
        args = manage.parse_args(
            ["organization", "create", "--name", "Example Restaurant"]
        )
        with patch(
            "builtins.input",
            side_effect=["example", "hello@example.com"],
        ) as prompt:
            manage._prepare_organization_args(args, interactive=True)

        self.assertEqual(prompt.call_count, 2)
        self.assertEqual(args.slug, "example")
        self.assertIsNone(args.phone)
        self.assertIsNone(args.privacy_contact_email)

    def test_noninteractive_missing_argument_fails_without_prompting(self):
        args = manage.parse_args(["domain", "create", "--domain", "example.com"])
        with patch("builtins.input") as prompt:
            with self.assertRaisesRegex(ValueError, "--organization-slug"):
                manage._prepare_domain_args(args, interactive=False)
        prompt.assert_not_called()

    def test_domain_wizard_repeats_invalid_boolean_answer(self):
        args = manage.parse_args(["domain", "create"])
        errors = StringIO()
        with patch(
            "builtins.input",
            side_effect=["example", "https://shop.example.com/path", "talvez", "sim", ""],
        ) as prompt, redirect_stderr(errors):
            manage._prepare_domain_args(args, interactive=True)

        self.assertEqual(prompt.call_count, 5)
        self.assertEqual(args.domain, "shop.example.com")
        self.assertTrue(args.verified)
        self.assertFalse(args.primary)
        self.assertIn("responda sim ou não", errors.getvalue())

    def test_update_wizard_can_clear_nullable_values(self):
        args = manage.parse_args(["organization", "update"])
        with patch(
            "builtins.input",
            side_effect=["example", "", "", "-", "-"],
        ):
            manage._prepare_organization_args(args, interactive=True)

        self.assertIsNone(args.name)
        self.assertIsNone(args.email)
        self.assertEqual(args.privacy_contact_email, "")
        self.assertEqual(args.phone, "")

    def test_purge_wizard_keeps_exact_slug_confirmation(self):
        args = manage.parse_args(["organization", "purge"])
        with patch("builtins.input", side_effect=["example", "example"]):
            manage._prepare_organization_args(args, interactive=True)

        self.assertEqual(args.slug, "example")
        self.assertEqual(args.confirm, "example")


class ManageOrganizationDomainCommandTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        with DBSession(self.engine) as db:
            create_organization(
                db,
                name="Example Restaurant",
                slug="example",
                organization_type=OrganizationType.RESTAURANT,
                email="hello@example.com",
            )
            add_organization_domain(
                db,
                organization_slug="example",
                domain="example.com",
                is_primary=True,
                is_verified=True,
            )
            add_organization_domain(
                db,
                organization_slug="example",
                domain="shop.example.com",
            )

    def tearDown(self):
        self.engine.dispose()

    def _session(self):
        return DBSession(self.engine)

    def _run(self, argv: list[str]):
        args = manage.parse_args(argv)
        manage._prepare_domain_args(args, interactive=False)
        with patch.object(manage, "SessionLocal", self._session):
            return manage._run_domain(args)

    def test_organization_update_keeps_profile_contacts_in_sync(self):
        args = manage.parse_args(
            [
                "organization",
                "update",
                "--slug",
                "example",
                "--email",
                "new@example.com",
                "--phone",
                "912345678",
            ]
        )
        manage._prepare_organization_args(args, interactive=False)
        with patch.object(manage, "SessionLocal", self._session):
            result = manage._run_organization(args)
        self.assertTrue(result["updated"])

        with DBSession(self.engine) as db:
            organization = db.scalar(
                select(Organization)
                .where(Organization.slug == "example")
                .execution_options(skip_organization_scope=True)
            )
            db.info["organization_id"] = organization.id
            profile = db.scalar(select(OrganizationProfile))
            self.assertEqual(organization.email, "new@example.com")
            self.assertEqual(profile.email, "new@example.com")
            self.assertEqual(organization.phone, "912345678")
            self.assertEqual(profile.phone, "912345678")

    def test_list_update_deactivate_and_reactivate_domains(self):
        listed = self._run(
            ["domain", "list", "--organization-slug", "example", "--format", "json"]
        )
        self.assertEqual(
            [item["hostname"] for item in listed],
            ["example.com", "shop.example.com"],
        )

        self._run(
            [
                "domain",
                "update",
                "--domain",
                "shop.example.com",
                "--verified",
                "--primary",
            ]
        )
        with DBSession(self.engine) as db:
            domains = {
                item.domain: item
                for item in db.scalars(
                    select(OrganizationDomain).execution_options(
                        skip_organization_scope=True
                    )
                ).all()
            }
            self.assertFalse(domains["example.com"].is_primary)
            self.assertTrue(domains["shop.example.com"].is_primary)
            self.assertTrue(domains["shop.example.com"].is_verified)

        deactivated = self._run(
            ["domain", "deactivate", "--domain", "shop.example.com"]
        )
        self.assertFalse(deactivated["active"])
        listed = self._run(
            ["domain", "list", "--organization-slug", "example", "--format", "json"]
        )
        self.assertFalse(
            next(item for item in listed if item["hostname"] == "shop.example.com")[
                "active"
            ]
        )

        reactivated = self._run(
            ["domain", "reactivate", "--domain", "shop.example.com"]
        )
        self.assertTrue(reactivated["active"])


if __name__ == "__main__":
    unittest.main()
