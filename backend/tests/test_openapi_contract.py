import ast
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
EXPORTER = ROOT / "backend" / "scripts" / "export_openapi.py"
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}


class OpenApiContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._temporary_directory = tempfile.TemporaryDirectory()
        output = Path(cls._temporary_directory.name) / "openapi.json"
        subprocess.run(
            [sys.executable, str(EXPORTER), "--output", str(output)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        cls.schema = json.loads(output.read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        cls._temporary_directory.cleanup()

    @classmethod
    def operations(cls):
        for path, path_item in cls.schema["paths"].items():
            for method, operation in path_item.items():
                if method in HTTP_METHODS:
                    yield path, method, operation

    def test_operation_ids_are_deterministic_and_unique(self):
        operation_ids = [operation["operationId"] for _, _, operation in self.operations()]
        self.assertEqual(len(operation_ids), len(set(operation_ids)))
        for operation_id in operation_ids:
            self.assertRegex(operation_id, r"^[a-z0-9_]+_[A-Za-z0-9_]+$")

    def test_every_route_decorator_declares_a_unique_literal_operation_id(self):
        operation_ids = {}
        module_router_files = [
            path
            for path in (ROOT / "backend" / "modules").rglob("*.py")
            if path.parent.name == "routers"
        ]
        route_files = [ROOT / "backend" / "app.py", *module_router_files]
        route_methods = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}

        for route_file in route_files:
            tree = ast.parse(route_file.read_text(encoding="utf-8"), filename=str(route_file))
            for node in ast.walk(tree):
                if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                for decorator in node.decorator_list:
                    if not (
                        isinstance(decorator, ast.Call)
                        and isinstance(decorator.func, ast.Attribute)
                        and decorator.func.attr in route_methods
                    ):
                        continue
                    keyword = next(
                        (item for item in decorator.keywords if item.arg == "operation_id"),
                        None,
                    )
                    self.assertIsNotNone(
                        keyword,
                        f"{route_file}:{node.lineno} ({node.name}) must declare operation_id",
                    )
                    self.assertIsInstance(
                        keyword.value,
                        ast.Constant,
                        f"{route_file}:{node.lineno} ({node.name}) operation_id must be a literal",
                    )
                    operation_id = keyword.value.value
                    self.assertIsInstance(operation_id, str)
                    self.assertRegex(operation_id, r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$")
                    self.assertNotIn(
                        operation_id,
                        operation_ids,
                        f"duplicate operation_id {operation_id!r}",
                    )
                    operation_ids[operation_id] = f"{route_file}:{node.lineno}"

        exported_ids = {operation["operationId"] for _, _, operation in self.operations()}
        self.assertEqual(set(operation_ids), exported_ids)

    def test_bearer_auth_is_a_security_scheme_on_protected_routes(self):
        bearer = self.schema["components"]["securitySchemes"]["BearerAuth"]
        self.assertEqual(bearer["type"], "http")
        self.assertEqual(bearer["scheme"], "bearer")
        self.assertEqual(self.schema["paths"]["/profile"]["get"]["security"], [{"BearerAuth": []}])
        self.assertEqual(self.schema["paths"]["/admin/me"]["get"]["security"], [{"BearerAuth": []}])
        self.assertNotIn("security", self.schema["paths"]["/login"]["post"])

    def test_json_success_responses_have_schemas_and_errors_use_api_error(self):
        for path, method, operation in self.operations():
            with self.subTest(path=path, method=method):
                for status, response in operation.get("responses", {}).items():
                    content = response.get("content", {})
                    if status.startswith("2") and "application/json" in content:
                        self.assertTrue(content["application/json"].get("schema"))

                validation_schema = (
                    operation.get("responses", {})
                    .get("422", {})
                    .get("content", {})
                    .get("application/json", {})
                    .get("schema", {})
                )
                self.assertEqual(validation_schema.get("$ref"), "#/components/schemas/ApiErrorResponse")

    def test_upload_and_binary_download_media_types_are_explicit(self):
        upload_content = self.schema["paths"]["/admin/products/{product_id}/media"]["post"]["requestBody"]["content"]
        self.assertIn("multipart/form-data", upload_content)

        pdf_schema = self.schema["paths"]["/checkout/orders/{order_id}/receipt.pdf"]["get"]["responses"]["200"]["content"]["application/pdf"]["schema"]
        self.assertEqual(pdf_schema, {"type": "string", "format": "binary"})

    def test_rate_limited_bodies_and_responses_are_explicit(self):
        expected_bodies = {
            "/login": "#/components/schemas/UserAuth",
            "/register": "#/components/schemas/UserRegister",
            "/admin/login": "#/components/schemas/AdminLogin",
        }
        for path, expected_ref in expected_bodies.items():
            operation = self.schema["paths"][path]["post"]
            body_schema = operation["requestBody"]["content"]["application/json"]["schema"]
            self.assertEqual(body_schema, {"$ref": expected_ref})
            rate_limit_response = operation["responses"]["429"]
            self.assertEqual(
                rate_limit_response["content"]["application/json"]["schema"]["$ref"],
                "#/components/schemas/ApiErrorResponse",
            )
            self.assertIn("Retry-After", rate_limit_response["headers"])

        checkout_operation = self.schema["paths"]["/checkout/orders"]["post"]
        self.assertEqual(
            checkout_operation["responses"]["201"]["content"]["application/json"]["schema"],
            {"$ref": "#/components/schemas/OrderCreateResponse"},
        )
        self.assertIn("Retry-After", checkout_operation["responses"]["429"]["headers"])

    def test_guest_order_access_header_is_an_openapi_security_scheme(self):
        self.assertEqual(
            self.schema["components"]["securitySchemes"]["OrderAccessToken"],
            {
                "type": "apiKey",
                "description": "Secret token returned once when a guest order is created.",
                "in": "header",
                "name": "X-Order-Token",
            },
        )
        for path, method in (
            ("/checkout/orders/{order_id}", "get"),
            ("/checkout/orders/{order_id}/cancel", "post"),
            ("/checkout/orders/{order_id}/receipt.pdf", "get"),
        ):
            security = self.schema["paths"][path][method]["security"]
            self.assertIn({"BearerAuth": []}, security)
            self.assertIn({"OrderAccessToken": []}, security)

    def test_contract_contains_no_refund_feature(self):
        serialized_schema = json.dumps(self.schema).casefold()
        self.assertNotIn("refund", serialized_schema)
        self.assertNotIn("refunded", serialized_schema)

    def test_contract_contains_no_inventory_control(self):
        serialized_schema = json.dumps(self.schema).casefold()
        self.assertNotIn("stock", serialized_schema)
        self.assertNotIn("low-stock", serialized_schema)

    def test_public_contract_has_no_legacy_property_names(self):
        forbidden = {
            "calorias", "discount_percentual", "vendas_por_dia", "por_hora",
            "por_dia", "por_mes", "por_ano", "order_numbers", "observacoes", "stock",
        }
        exposed = set()
        for component in self.schema["components"]["schemas"].values():
            exposed.update(component.get("properties", {}))
        self.assertFalse(exposed & forbidden)


if __name__ == "__main__":
    unittest.main()
