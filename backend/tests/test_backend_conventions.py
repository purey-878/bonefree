import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
ROUTE_METHODS = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}
OPTIONAL_CUSTOMER_AUTH_OPERATION_IDS = {
    "cart_get_cart",
    "cart_add_item",
    "cart_add_customized_item",
    "cart_update_item",
    "cart_remove_item",
    "cart_clear_cart",
    "reviews_list_product_reviews",
    "reviews_get_product_review_eligibility",
    "checkout_create_order",
    "checkout_get_order",
    "checkout_cancel_order",
    "checkout_download_order_receipt_pdf",
}
FORBIDDEN_IDENTIFIER_PARTS = {
    "observacoes",
    "calorias",
    "vendas_por_dia",
    "por_hora",
    "por_dia",
    "por_mes",
    "por_ano",
    "order_numbers",
    "discount_percentual",
    "validate_estado",
    "notificacao_preferida",
    "iva_percentual",
    "checkout_nif",
    "existing_nif",
    "new_nif",
    "nif_provided",
    "stock",
}


def _runtime_python_files():
    for path in BACKEND.rglob("*.py"):
        relative_parts = path.relative_to(BACKEND).parts
        if relative_parts[0] in {"alembic", "tests"}:
            continue
        yield path


def _route_operation_id(decorator: ast.Call) -> str | None:
    for keyword in decorator.keywords:
        if keyword.arg == "operation_id" and isinstance(keyword.value, ast.Constant):
            return keyword.value.value
    return None


def _route_decorators(node: ast.FunctionDef | ast.AsyncFunctionDef):
    for decorator in node.decorator_list:
        if (
            isinstance(decorator, ast.Call)
            and isinstance(decorator.func, ast.Attribute)
            and decorator.func.attr in ROUTE_METHODS
        ):
            yield decorator


def _dependency_names(node: ast.FunctionDef | ast.AsyncFunctionDef) -> set[str]:
    names: set[str] = set()
    defaults = [*node.args.defaults, *[item for item in node.args.kw_defaults if item is not None]]
    for default in defaults:
        if not (
            isinstance(default, ast.Call)
            and isinstance(default.func, ast.Name)
            and default.func.id == "Depends"
            and default.args
        ):
            continue
        dependency = default.args[0]
        if isinstance(dependency, ast.Name):
            names.add(dependency.id)
        elif (
            isinstance(dependency, ast.Call)
            and isinstance(dependency.func, ast.Name)
        ):
            names.add(dependency.func.id)
    return names


class BackendConventionTests(unittest.TestCase):
    def test_active_sources_do_not_restore_removed_refunds_or_legacy_branding(self):
        source_roots = [BACKEND, ROOT / "frontend" / "src"]
        extra_files = [ROOT / "frontend" / "openapi" / "openapi.json"]
        allowed_suffixes = {".css", ".html", ".js", ".json", ".py", ".ts", ".tsx"}
        violations = []

        paths = list(extra_files)
        for source_root in source_roots:
            paths.extend(
                path
                for path in source_root.rglob("*")
                if path.is_file() and path.suffix.casefold() in allowed_suffixes
            )

        for path in paths:
            relative_parts = path.relative_to(ROOT).parts
            if len(relative_parts) >= 2 and relative_parts[:2] in {
                ("backend", "alembic"),
                ("backend", "tests"),
            }:
                continue
            text = path.read_text(encoding="utf-8").casefold()
            for forbidden in ("refund", "prey"):
                if forbidden in text:
                    violations.append(f"{path.relative_to(ROOT)}:{forbidden}")

        self.assertEqual(
            violations,
            [],
            f"Removed refund features and legacy branding must not return: {violations}",
        )

    def test_runtime_code_does_not_use_legacy_session_query(self):
        violations = []
        for path in _runtime_python_files():
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if (
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and node.func.attr == "query"
                ):
                    violations.append(f"{path.relative_to(ROOT)}:{node.lineno}")
        self.assertEqual(violations, [], f"Use SQLAlchemy 2.x select statements: {violations}")

    def test_runtime_identifiers_do_not_use_forbidden_legacy_names(self):
        violations = []
        for path in _runtime_python_files():
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                identifier = None
                if isinstance(node, ast.Name):
                    identifier = node.id
                elif isinstance(node, ast.arg):
                    identifier = node.arg
                elif isinstance(node, ast.Attribute):
                    identifier = node.attr
                elif isinstance(node, ast.keyword):
                    identifier = node.arg
                elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    identifier = node.name
                if identifier and any(part in identifier.casefold() for part in FORBIDDEN_IDENTIFIER_PARTS):
                    violations.append(f"{path.relative_to(ROOT)}:{node.lineno}:{identifier}")
        self.assertEqual(violations, [], f"Use English runtime identifiers: {violations}")

    def test_admin_routes_require_an_explicit_role(self):
        violations = []
        route_root = BACKEND / "modules" / "restaurant" / "routers"
        route_files = list(route_root.rglob("*.py"))
        staff_route_files = {
            "analytics.py",
            "catalog.py",
            "customers.py",
            "orders.py",
            "owner.py",
            "staff_auth.py",
        }
        for path in route_files:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                dependencies = _dependency_names(node)
                for decorator in _route_decorators(node):
                    operation_id = _route_operation_id(decorator)
                    receiver = decorator.func.value
                    route_path = (
                        decorator.args[0].value
                        if decorator.args and isinstance(decorator.args[0], ast.Constant)
                        else ""
                    )
                    is_admin_route = (
                        (path.name in staff_route_files and isinstance(receiver, ast.Name) and receiver.id == "router")
                        or (path.name == "site_settings.py" and isinstance(receiver, ast.Name) and receiver.id == "owner_router")
                        or (path.name == "reviews.py" and route_path.startswith("/admin/"))
                    )
                    if (
                        is_admin_route
                        and operation_id != "admin_management_admin_login"
                        and "require_organization_role" not in dependencies
                    ):
                        violations.append(f"{path.relative_to(ROOT)}:{node.lineno}:{operation_id}")
        self.assertEqual(violations, [], f"Protected admin routes must use require_role: {violations}")

    def test_optional_customer_auth_is_limited_to_guest_capable_routes(self):
        found = set()
        route_roots = (
            BACKEND / "modules" / "auth" / "routers",
            BACKEND / "modules" / "restaurant" / "routers",
        )
        for path in (
            path
            for route_root in route_roots
            for path in route_root.rglob("*.py")
        ):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                if "get_current_user_optional" not in _dependency_names(node):
                    continue
                for decorator in _route_decorators(node):
                    operation_id = _route_operation_id(decorator)
                    if operation_id:
                        found.add(operation_id)
        self.assertEqual(found, OPTIONAL_CUSTOMER_AUTH_OPERATION_IDS)


if __name__ == "__main__":
    unittest.main()
