import ast
from pathlib import Path
import unittest

from core.base import OrganizationModel
from models import (
    Admin,
    AdminSession,
    Category,
    Order,
    Organization,
    Payment,
    Product,
    ReviewReaction,
    ReviewReply,
    Session,
    User,
)
from modules.admin.models import Admin as CanonicalAdmin
from modules.auth.models import Organization as CanonicalOrganization
from modules.restaurant.models import Category as CanonicalCategory


BACKEND = Path(__file__).resolve().parents[1]


class ModuleArchitectureTests(unittest.TestCase):
    def test_root_model_facade_reexports_canonical_models(self):
        self.assertIs(Admin, CanonicalAdmin)
        self.assertIs(Organization, CanonicalOrganization)
        self.assertIs(Category, CanonicalCategory)

    def test_platform_admin_models_are_global(self):
        self.assertFalse(issubclass(Admin, OrganizationModel))
        self.assertFalse(issubclass(AdminSession, OrganizationModel))
        self.assertNotIn("organization_id", Admin.__table__.columns)
        self.assertNotIn("organization_id", AdminSession.__table__.columns)

    def test_platform_and_tenant_sessions_reference_different_identities(self):
        platform_targets = {
            foreign_key.target_fullname
            for foreign_key in AdminSession.__table__.c.admin_id.foreign_keys
        }
        tenant_targets = {
            foreign_key.target_fullname
            for foreign_key in Session.__table__.c.user_id.foreign_keys
        }
        self.assertEqual(platform_targets, {"admin.id"})
        self.assertEqual(tenant_targets, {"user.id"})
        self.assertIsNot(Admin, User)

    def test_tenant_models_expose_user_identity_names_over_legacy_columns(self):
        mapped_columns = (
            (Category, "created_by_user_id", "admin_id"),
            (Product, "created_by_user_id", "admin_id"),
            (Order, "handled_by_user_id", "admin_id"),
            (ReviewReply, "author_user_id", "admin_id"),
            (ReviewReaction, "reacted_by_user_id", "admin_id"),
            (Payment, "confirmed_by_user_id", "confirmed_by_admin_id"),
        )
        for model, attribute, physical_column in mapped_columns:
            with self.subTest(model=model.__name__, attribute=attribute):
                column = getattr(model, attribute).property.columns[0]
                self.assertEqual(column.name, physical_column)

        for model in (User, Session):
            for legacy_attribute in ("admin_id", "customer_id"):
                self.assertFalse(hasattr(model, legacy_attribute))

    def test_removed_tenant_admin_aliases_do_not_return(self):
        forbidden_names = {
            "ADMIN_ROLES",
            "CHEF_ROLE",
            "STAFF_ADMIN_ROLE",
            "SUPER_ADMIN_ROLE",
            "authenticate_admin",
            "create_admin_session",
            "get_current_admin",
            "is_admin_role",
            "normalize_admin_role",
        }
        found: set[str] = set()
        for path in (BACKEND / "modules").rglob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, (ast.Name, ast.arg)):
                    name = node.id if isinstance(node, ast.Name) else node.arg
                    if name in forbidden_names:
                        found.add(name)
                elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    if node.name in forbidden_names:
                        found.add(node.name)
        self.assertEqual(found, set())

    def test_root_facades_expose_migrating_imports(self):
        from routers import auth_router, staff_router
        from schemas import UserResponse
        from services import authentication, product_availability

        self.assertIsNotNone(auth_router)
        self.assertIsNotNone(staff_router)
        self.assertEqual(UserResponse.__name__, "UserResponse")
        self.assertTrue(callable(authentication.authenticate_customer))
        self.assertTrue(callable(product_availability.effective_product_available))

    def test_removed_global_packages_and_json_types_do_not_return(self):
        self.assertFalse((BACKEND / "routers").is_dir())
        self.assertFalse((BACKEND / "schemas").is_dir())
        self.assertFalse((BACKEND / "services").is_dir())
        self.assertFalse((BACKEND / "json_types.py").exists())


if __name__ == "__main__":
    unittest.main()
