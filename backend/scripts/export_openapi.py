"""Export and validate the FastAPI OpenAPI document without using an application DB."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any


HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}
BINARY_RESPONSES = {
    ("/checkout/orders/{order_id}/receipt.pdf", "get", "application/pdf"),
}
FORBIDDEN_SCHEMA_PROPERTIES = {
    "calorias",
    "discount_percentual",
    "vendas_por_dia",
    "por_hora",
    "por_dia",
    "por_mes",
    "por_ano",
    "order_numbers",
    "observacoes",
}


def _configure_isolated_environment(backend_dir: Path) -> None:
    os.environ["ENVIRONMENT"] = "test"
    os.environ["AUTO_APPLY_MIGRATIONS"] = "false"
    os.environ["DATABASE_URL"] = "sqlite://"
    sys.path.insert(0, str(backend_dir))


def _operations(schema: dict[str, Any]):
    for path, path_item in schema.get("paths", {}).items():
        for method, operation in path_item.items():
            if method in HTTP_METHODS:
                yield path, method, operation


def _validate_explicit_route_ids(app: Any) -> None:
    from fastapi.routing import APIRoute

    missing = []
    declared: dict[str, tuple[str, str]] = {}
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        methods = ",".join(sorted(route.methods or []))
        if not route.operation_id:
            missing.append(f"{methods} {route.path}")
            continue
        if route.operation_id in declared:
            previous_method, previous_path = declared[route.operation_id]
            raise RuntimeError(
                f"Duplicate explicit operation_id {route.operation_id!r}: "
                f"{previous_method} {previous_path} and {methods} {route.path}"
            )
        declared[route.operation_id] = (methods, route.path)

    if missing:
        raise RuntimeError(
            "Every API route must declare operation_id explicitly; missing: " + ", ".join(missing)
        )


def _validate_schema(schema: dict[str, Any]) -> None:
    operation_ids: dict[str, tuple[str, str]] = {}
    for path, method, operation in _operations(schema):
        operation_id = operation.get("operationId")
        if not operation_id:
            raise RuntimeError(f"Missing operationId for {method.upper()} {path}")
        if operation_id in operation_ids:
            previous_path, previous_method = operation_ids[operation_id]
            raise RuntimeError(
                f"Duplicate operationId {operation_id!r}: "
                f"{previous_method.upper()} {previous_path} and {method.upper()} {path}"
            )
        operation_ids[operation_id] = (path, method)

        responses = operation.get("responses", {})
        for status, response in responses.items():
            json_schema = response.get("content", {}).get("application/json", {}).get("schema")
            if str(status).startswith("2") and "application/json" in response.get("content", {}) and not json_schema:
                raise RuntimeError(f"{method.upper()} {path} has an untyped JSON success response")

        validation_schema = (
            responses.get("422", {})
            .get("content", {})
            .get("application/json", {})
            .get("schema", {})
        )
        if validation_schema.get("$ref") != "#/components/schemas/ApiErrorResponse":
            raise RuntimeError(f"{method.upper()} {path} must document validation errors with ApiErrorResponse")

    security_schemes = schema.get("components", {}).get("securitySchemes", {})
    bearer = security_schemes.get("BearerAuth")
    if not bearer or bearer.get("type") != "http" or bearer.get("scheme") != "bearer":
        raise RuntimeError("OpenAPI must declare the BearerAuth HTTP bearer security scheme")

    for protected_path, method in (("/profile", "get"), ("/admin/me", "get")):
        security = schema.get("paths", {}).get(protected_path, {}).get(method, {}).get("security")
        if security != [{"BearerAuth": []}]:
            raise RuntimeError(f"{method.upper()} {protected_path} must use BearerAuth")

    login_security = schema.get("paths", {}).get("/login", {}).get("post", {}).get("security")
    if login_security:
        raise RuntimeError("POST /login must remain a public operation")

    schemas = schema.get("components", {}).get("schemas", {})
    for schema_name, component in schemas.items():
        properties = set(component.get("properties", {}))
        forbidden = properties & FORBIDDEN_SCHEMA_PROPERTIES
        if forbidden:
            names = ", ".join(sorted(forbidden))
            raise RuntimeError(f"Schema {schema_name} still exposes legacy properties: {names}")

    for path, method, media_type in BINARY_RESPONSES:
        operation = schema.get("paths", {}).get(path, {}).get(method, {})
        success_content = operation.get("responses", {}).get("200", {}).get("content", {})
        media_schema = success_content.get(media_type, {}).get("schema", {})
        if media_schema.get("type") != "string" or media_schema.get("format") != "binary":
            raise RuntimeError(
                f"{method.upper()} {path} must document {media_type} as a binary response"
            )

    upload_content = (
        schema.get("paths", {})
        .get("/admin/products/{product_id}/image", {})
        .get("post", {})
        .get("requestBody", {})
        .get("content", {})
    )
    if "multipart/form-data" not in upload_content:
        raise RuntimeError("Product image upload must document multipart/form-data")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parents[1]
    _configure_isolated_environment(backend_dir)

    from app import app

    _validate_explicit_route_ids(app)
    schema = app.openapi()
    _validate_schema(schema)

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Exported {len(schema.get('paths', {}))} paths to {output}")


if __name__ == "__main__":
    main()
