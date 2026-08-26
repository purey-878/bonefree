from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import Any

from fastapi import Request, status

from core.config import settings
from core.errors import AppHTTPException, build_error_payload
from core.redis import RedisProtocol
from core.api_schemas import ApiErrorResponse

logger = logging.getLogger(__name__)

RATE_LIMIT_ERROR = "rate_limit_exceeded"
RATE_LIMIT_MESSAGE = "Too many requests. Please try again later."
RATE_LIMIT_OPENAPI_RESPONSES = {
    status.HTTP_429_TOO_MANY_REQUESTS: {
        "model": ApiErrorResponse,
        "description": "Rate limit exceeded",
        "headers": {
            "Retry-After": {
                "description": "Seconds until another request may be attempted.",
                "schema": {"type": "integer", "minimum": 1},
            }
        },
    }
}


@dataclass(frozen=True)
class RateLimitExceeded:
    retry_after: int


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip() or "unknown"

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip() or "unknown"

    if request.client:
        return request.client.host

    return "unknown"


def rate_limit_payload() -> dict[str, Any]:
    return build_error_payload(RATE_LIMIT_ERROR, RATE_LIMIT_MESSAGE)


def rate_limit_headers(retry_after: int) -> dict[str, str]:
    return {"Retry-After": str(max(retry_after, 1))}


def _rate_limit_key(bucket: str, identity: str) -> str:
    digest = hashlib.sha256(identity.strip().lower().encode("utf-8")).hexdigest()
    return f"rate_limit:{bucket}:{digest}"


async def check_rate_limit(
    request: Request,
    *,
    bucket: str,
    identity: str,
    max_requests: int,
    window_seconds: int,
) -> RateLimitExceeded | None:
    if not settings.rate_limit_enabled or max_requests <= 0 or window_seconds <= 0:
        return None

    redis_client: RedisProtocol | None = getattr(request.app.state, "redis", None)
    if redis_client is None:
        return _handle_rate_limit_storage_failure("Redis is not initialized")

    key = _rate_limit_key(bucket, identity or "unknown")
    try:
        count = int(await redis_client.incr(key))
        if count == 1:
            await redis_client.expire(key, window_seconds)
        if count <= max_requests:
            return None

        ttl = int(await redis_client.ttl(key))
        retry_after = ttl if ttl > 0 else window_seconds
        return RateLimitExceeded(retry_after=retry_after)
    except Exception as exc:
        return _handle_rate_limit_storage_failure(str(exc))


async def enforce_rate_limit(
    request: Request,
    *,
    bucket: str,
    identity: str,
    max_requests: int,
    window_seconds: int,
) -> None:
    exceeded = await check_rate_limit(
        request,
        bucket=bucket,
        identity=identity,
        max_requests=max_requests,
        window_seconds=window_seconds,
    )
    if exceeded is None:
        return

    raise AppHTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        error=RATE_LIMIT_ERROR,
        message=RATE_LIMIT_MESSAGE,
        headers=rate_limit_headers(exceeded.retry_after),
    )


def _handle_rate_limit_storage_failure(reason: str) -> RateLimitExceeded | None:
    logger.warning("Rate limit storage failure: %s", reason)
    if settings.rate_limit_redis_failure_mode == "allow":
        return None
    return RateLimitExceeded(retry_after=1)
