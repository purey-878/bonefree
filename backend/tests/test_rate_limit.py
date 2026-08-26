import asyncio
import hashlib
import inspect
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from fastapi import Depends, FastAPI
from fastapi.params import Depends as DependsParameter
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from starlette.requests import Request

from app import create_app
from core.config import Settings, settings
from core.errors import AppHTTPException
from core.exception_handlers import app_http_exception_handler
from core.rate_limit import (
    RATE_LIMIT_ERROR,
    _rate_limit_key,
    check_rate_limit,
    enforce_rate_limit,
    get_client_ip,
)
from core.redis import InMemoryRedis, create_redis_client
from dependencies import (
    rate_limit_staff,
    rate_limit_staff_login,
    rate_limit_login,
    rate_limit_order,
    rate_limit_register,
    get_current_staff_user,
    require_organization_role,
)
from modules.restaurant.schemas.owner import AdminLogin
from modules.auth.models import UserRole
from modules.auth.schemas.user import UserAuth, UserRegister


def build_request(
    *,
    redis_client=None,
    headers: dict[str, str] | None = None,
    client: tuple[str, int] | None = ("127.0.0.1", 12345),
) -> Request:
    app = FastAPI()
    if redis_client is not None:
        app.state.redis = redis_client
    encoded_headers = [
        (name.lower().encode("latin-1"), value.encode("latin-1"))
        for name, value in (headers or {}).items()
    ]
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/test",
            "raw_path": b"/test",
            "query_string": b"",
            "headers": encoded_headers,
            "client": client,
            "server": ("testserver", 80),
            "app": app,
        }
    )


class FailingRedis(InMemoryRedis):
    async def incr(self, key: str) -> int:
        raise ConnectionError("redis unavailable")


class StartupFailingRedis(InMemoryRedis):
    def __init__(self) -> None:
        super().__init__()
        self.closed = False

    async def ping(self) -> bool:
        raise ConnectionError("redis startup unavailable")

    async def aclose(self) -> None:
        self.closed = True
        await super().aclose()


class InMemoryRedisTests(unittest.IsolatedAsyncioTestCase):
    async def test_value_hash_counter_expiration_delete_and_close(self):
        redis_client = InMemoryRedis()

        self.assertTrue(await redis_client.ping())
        self.assertTrue(await redis_client.set("value", 7))
        self.assertEqual(await redis_client.get("value"), "7")
        self.assertEqual(await redis_client.incr("counter"), 1)
        self.assertEqual(await redis_client.incr("counter"), 2)

        self.assertEqual(await redis_client.hset("hash", {"name": "Bonefree", "count": 2}), 2)
        self.assertEqual(
            await redis_client.hgetall("hash"),
            {"name": "Bonefree", "count": "2"},
        )
        self.assertTrue(await redis_client.expire("value", 60))
        self.assertGreater(await redis_client.ttl("value"), 0)
        self.assertFalse(await redis_client.expire("missing", 60))
        self.assertEqual(await redis_client.ttl("missing"), -2)

        redis_client._expires_at["value"] = time.monotonic() - 1
        self.assertIsNone(await redis_client.get("value"))
        self.assertEqual(await redis_client.delete("counter", "hash", "missing"), 2)

        await redis_client.set("close-me", "yes")
        await redis_client.aclose()
        self.assertIsNone(await redis_client.get("close-me"))

    async def test_factory_uses_memory_outside_production(self):
        self.assertIsInstance(
            create_redis_client("development", "redis://unused"),
            InMemoryRedis,
        )
        self.assertIsInstance(
            create_redis_client("test", "redis://unused"),
            InMemoryRedis,
        )

    async def test_factory_builds_real_async_client_for_production(self):
        redis_client = create_redis_client("production", "redis://localhost:6379/0")
        self.assertNotIsInstance(redis_client, InMemoryRedis)
        await redis_client.aclose()


class RateLimitTests(unittest.IsolatedAsyncioTestCase):
    def test_client_ip_header_precedence_and_fallbacks(self):
        forwarded = build_request(
            headers={
                "X-Forwarded-For": "203.0.113.10, 10.0.0.1",
                "X-Real-IP": "198.51.100.20",
            }
        )
        self.assertEqual(get_client_ip(forwarded), "203.0.113.10")
        self.assertEqual(
            get_client_ip(build_request(headers={"X-Real-IP": " 198.51.100.20 "})),
            "198.51.100.20",
        )
        self.assertEqual(get_client_ip(build_request()), "127.0.0.1")
        self.assertEqual(get_client_ip(build_request(client=None)), "unknown")

    def test_keys_hash_normalized_identity_without_exposing_it(self):
        expected_digest = hashlib.sha256(b"user@example.com").hexdigest()
        key = _rate_limit_key("auth:login:identifier", " User@Example.COM ")
        self.assertEqual(key, f"rate_limit:auth:login:identifier:{expected_digest}")
        self.assertNotIn("user@example.com", key)

    async def test_fixed_window_allows_limit_then_reports_ttl(self):
        request = build_request(redis_client=InMemoryRedis())
        for _ in range(2):
            self.assertIsNone(
                await check_rate_limit(
                    request,
                    bucket="test",
                    identity="identity",
                    max_requests=2,
                    window_seconds=60,
                )
            )

        exceeded = await check_rate_limit(
            request,
            bucket="test",
            identity="identity",
            max_requests=2,
            window_seconds=60,
        )
        self.assertIsNotNone(exceeded)
        self.assertGreaterEqual(exceeded.retry_after, 1)
        self.assertLessEqual(exceeded.retry_after, 60)

    async def test_disabled_and_non_positive_limits_bypass_storage(self):
        request = build_request(redis_client=FailingRedis())
        with patch.object(settings, "rate_limit_enabled", False):
            self.assertIsNone(
                await check_rate_limit(
                    request,
                    bucket="disabled",
                    identity="identity",
                    max_requests=1,
                    window_seconds=60,
                )
            )

        for max_requests, window_seconds in ((0, 60), (1, 0), (-1, 60), (1, -1)):
            self.assertIsNone(
                await check_rate_limit(
                    request,
                    bucket="invalid",
                    identity="identity",
                    max_requests=max_requests,
                    window_seconds=window_seconds,
                )
            )

    async def test_missing_or_failing_storage_honors_failure_mode(self):
        for request in (build_request(), build_request(redis_client=FailingRedis())):
            with patch.object(settings, "rate_limit_redis_failure_mode", "allow"):
                self.assertIsNone(
                    await check_rate_limit(
                        request,
                        bucket="failure",
                        identity="identity",
                        max_requests=1,
                        window_seconds=60,
                    )
                )
            with patch.object(settings, "rate_limit_redis_failure_mode", "block"):
                exceeded = await check_rate_limit(
                    request,
                    bucket="failure",
                    identity="identity",
                    max_requests=1,
                    window_seconds=60,
                )
                self.assertEqual(exceeded.retry_after, 1)

    async def test_enforcement_raises_standard_error_with_retry_after(self):
        request = build_request(redis_client=InMemoryRedis())
        await enforce_rate_limit(
            request,
            bucket="enforced",
            identity="identity",
            max_requests=1,
            window_seconds=60,
        )
        with self.assertRaises(AppHTTPException) as context:
            await enforce_rate_limit(
                request,
                bucket="enforced",
                identity="identity",
                max_requests=1,
                window_seconds=60,
            )
        self.assertEqual(context.exception.status_code, 429)
        self.assertEqual(context.exception.error, RATE_LIMIT_ERROR)
        self.assertGreaterEqual(int(context.exception.headers["Retry-After"]), 1)


class RateLimitDependencyTests(unittest.IsolatedAsyncioTestCase):
    async def _assert_credential_dependency_limits(self, dependency, payload) -> None:
        request = build_request(redis_client=InMemoryRedis())
        with (
            patch.object(settings, "rate_limit_auth_ip_requests", 10),
            patch.object(settings, "rate_limit_login_identifier_requests", 1),
            patch.object(settings, "rate_limit_register_email_requests", 1),
            patch.object(settings, "rate_limit_staff_login_requests", 1),
        ):
            self.assertIs(await dependency(payload, request), payload)
            with self.assertRaises(AppHTTPException):
                await dependency(payload, request)

    async def test_login_register_and_admin_login_use_ip_and_credential_buckets(self):
        await self._assert_credential_dependency_limits(
            rate_limit_login,
            UserAuth(email="client@example.com", password="password"),
        )
        await self._assert_credential_dependency_limits(
            rate_limit_register,
            UserRegister(
                email="new@example.com",
                password="StrongPass1!",
                name="New",
                last_name="Customer",
            ),
        )
        await self._assert_credential_dependency_limits(
            rate_limit_staff_login,
            AdminLogin(email="admin@example.com", password="password"),
        )

    async def test_admin_and_future_order_limits_use_separate_ip_buckets(self):
        request = build_request(redis_client=InMemoryRedis())
        with (
            patch.object(settings, "rate_limit_staff_requests", 1),
            patch.object(settings, "rate_limit_order_requests", 1),
        ):
            await rate_limit_staff(request)
            await rate_limit_order(request)
            with self.assertRaises(AppHTTPException):
                await rate_limit_staff(request)
            with self.assertRaises(AppHTTPException):
                await rate_limit_order(request)

    async def test_order_limit_allows_ten_requests_then_blocks_for_sixty_seconds(self):
        request = build_request(redis_client=InMemoryRedis())
        with (
            patch.object(settings, "rate_limit_order_requests", 10),
            patch.object(settings, "rate_limit_order_window_seconds", 60),
        ):
            for _ in range(10):
                await rate_limit_order(request)
            with self.assertRaises(AppHTTPException) as context:
                await rate_limit_order(request)

        self.assertEqual(context.exception.status_code, 429)
        self.assertGreaterEqual(int(context.exception.headers["Retry-After"]), 1)
        self.assertLessEqual(int(context.exception.headers["Retry-After"]), 60)

    def test_require_role_centralizes_admin_rate_limit(self):
        checker = require_organization_role(UserRole.OWNER)
        dependency = inspect.signature(checker).parameters["_rate_limit"].default
        self.assertIsInstance(dependency, DependsParameter)
        self.assertIs(dependency.dependency, rate_limit_staff)

    def test_protected_admin_route_returns_429_after_limit(self):
        app = FastAPI()
        app.state.redis = InMemoryRedis()
        app.add_exception_handler(AppHTTPException, app_http_exception_handler)
        app.dependency_overrides[get_current_staff_user] = lambda: type(
            "CurrentAdmin",
            (),
            {"role": UserRole.OWNER},
        )()

        @app.get("/admin/limited", dependencies=[Depends(require_organization_role(UserRole.OWNER))])
        def protected_admin_route():
            return {"ok": True}

        with patch.object(settings, "rate_limit_staff_requests", 1):
            client = TestClient(app)
            self.assertEqual(client.get("/admin/limited").status_code, 200)
            response = client.get("/admin/limited")

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["error"], RATE_LIMIT_ERROR)

    def test_order_limit_is_wired_only_to_checkout_creation(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            application = create_app(
                run_startup_tasks=False,
                public_assets_dir=root / "assets",
                uploads_dir=root / "uploads",
            )

        checkout_routes = [
            route
            for route in application.routes
            if isinstance(route, APIRoute) and route.path.startswith("/checkout/orders")
        ]
        creation_route = next(
            route for route in checkout_routes if route.operation_id == "checkout_create_order"
        )
        self.assertIn(
            rate_limit_order,
            [dependency.call for dependency in creation_route.dependant.dependencies],
        )
        for route in checkout_routes:
            if route is creation_route:
                continue
            self.assertNotIn(
                rate_limit_order,
                [dependency.call for dependency in route.dependant.dependencies],
                route.operation_id,
            )

    def test_http_429_payload_and_header(self):
        app = FastAPI()
        app.state.redis = InMemoryRedis()
        app.add_exception_handler(AppHTTPException, app_http_exception_handler)

        @app.get("/limited", dependencies=[Depends(rate_limit_order)])
        def limited():
            return {"ok": True}

        with patch.object(settings, "rate_limit_order_requests", 1):
            client = TestClient(app)
            self.assertEqual(client.get("/limited").status_code, 200)
            response = client.get("/limited")

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["error"], RATE_LIMIT_ERROR)
        self.assertGreaterEqual(int(response.headers["Retry-After"]), 1)


class RedisLifespanTests(unittest.TestCase):
    def test_production_configuration_requires_redis_url(self):
        production_settings = Settings.model_construct(
            environment="production",
            redis_url_raw=None,
        )
        with self.assertRaisesRegex(RuntimeError, "REDIS_URL is required"):
            _ = production_settings.redis_url

    def test_application_lifespan_initializes_and_closes_development_redis(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            application = create_app(
                run_startup_tasks=False,
                public_assets_dir=root / "assets",
                uploads_dir=root / "uploads",
            )
            with TestClient(application):
                redis_client = application.state.redis
                self.assertIsInstance(redis_client, InMemoryRedis)
                asyncio.run(redis_client.set("lifecycle", "active"))
                self.assertEqual(asyncio.run(redis_client.get("lifecycle")), "active")

            self.assertIsNone(asyncio.run(redis_client.get("lifecycle")))

    def test_application_startup_fails_and_closes_client_when_ping_fails(self):
        redis_client = StartupFailingRedis()
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            with patch("app.create_redis_client", return_value=redis_client):
                application = create_app(
                    run_startup_tasks=False,
                    public_assets_dir=root / "assets",
                    uploads_dir=root / "uploads",
                )
                with self.assertRaisesRegex(RuntimeError, "Failed to connect to Redis"):
                    with TestClient(application):
                        pass

        self.assertTrue(redis_client.closed)


if __name__ == "__main__":
    unittest.main()
