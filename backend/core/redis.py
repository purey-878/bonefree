import time
from typing import Any, Protocol, cast

import redis.asyncio as redis


class RedisProtocol(Protocol):
    async def ping(self) -> bool: ...

    async def set(self, key: str, value: Any) -> bool: ...

    async def get(self, key: str) -> str | None: ...

    async def incr(self, key: str) -> int: ...

    async def hset(self, key: str, mapping: dict[str, Any]) -> int: ...

    async def hgetall(self, key: str) -> dict[str, str]: ...

    async def expire(self, key: str, seconds: int) -> bool: ...

    async def ttl(self, key: str) -> int: ...

    async def delete(self, *keys: str) -> int: ...

    async def aclose(self) -> None: ...


class InMemoryRedis:
    """Small async Redis substitute used by development and tests."""

    def __init__(self) -> None:
        self._values: dict[str, str] = {}
        self._hashes: dict[str, dict[str, str]] = {}
        self._expires_at: dict[str, float] = {}

    def _purge_if_expired(self, key: str) -> None:
        redis_key = str(key)
        expires_at = self._expires_at.get(redis_key)
        if expires_at is not None and expires_at <= time.monotonic():
            self._values.pop(redis_key, None)
            self._hashes.pop(redis_key, None)
            self._expires_at.pop(redis_key, None)

    async def ping(self) -> bool:
        return True

    async def set(self, key: str, value: Any) -> bool:
        redis_key = str(key)
        self._purge_if_expired(redis_key)
        self._values[redis_key] = "" if value is None else str(value)
        self._hashes.pop(redis_key, None)
        return True

    async def get(self, key: str) -> str | None:
        redis_key = str(key)
        self._purge_if_expired(redis_key)
        return self._values.get(redis_key)

    async def incr(self, key: str) -> int:
        redis_key = str(key)
        self._purge_if_expired(redis_key)
        value = int(self._values.get(redis_key, "0")) + 1
        self._values[redis_key] = str(value)
        self._hashes.pop(redis_key, None)
        return value

    async def hset(self, key: str, mapping: dict[str, Any]) -> int:
        redis_key = str(key)
        self._purge_if_expired(redis_key)
        hash_value = self._hashes.setdefault(redis_key, {})
        self._values.pop(redis_key, None)
        for field, value in mapping.items():
            hash_value[str(field)] = "" if value is None else str(value)
        return len(mapping)

    async def hgetall(self, key: str) -> dict[str, str]:
        redis_key = str(key)
        self._purge_if_expired(redis_key)
        return dict(self._hashes.get(redis_key, {}))

    async def expire(self, key: str, seconds: int) -> bool:
        redis_key = str(key)
        self._purge_if_expired(redis_key)
        if redis_key not in self._values and redis_key not in self._hashes:
            return False
        self._expires_at[redis_key] = time.monotonic() + int(seconds)
        return True

    async def ttl(self, key: str) -> int:
        redis_key = str(key)
        self._purge_if_expired(redis_key)
        if redis_key not in self._values and redis_key not in self._hashes:
            return -2
        expires_at = self._expires_at.get(redis_key)
        if expires_at is None:
            return -1
        return max(int(expires_at - time.monotonic()), 1)

    async def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            redis_key = str(key)
            self._purge_if_expired(redis_key)
            deleted += int(redis_key in self._values or redis_key in self._hashes)
            self._values.pop(redis_key, None)
            self._hashes.pop(redis_key, None)
            self._expires_at.pop(redis_key, None)
        return deleted

    async def aclose(self) -> None:
        self._values.clear()
        self._hashes.clear()
        self._expires_at.clear()


def create_redis_client(environment: str, redis_url: str) -> RedisProtocol:
    if environment in {"development", "test"}:
        return InMemoryRedis()

    return cast(
        RedisProtocol,
        redis.from_url(redis_url, decode_responses=True),
    )
