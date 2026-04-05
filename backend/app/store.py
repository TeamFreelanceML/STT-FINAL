from __future__ import annotations

import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None  # type: ignore


class SessionStore:
    """Redis when REDIS_URL set; otherwise in-process dict (dev / single worker)."""

    def __init__(self, redis_url: str | None) -> None:
        self._redis_url = redis_url
        self._r: Any = None
        self._mem: dict[str, dict[str, Any]] = {}

    async def connect(self) -> None:
        if self._redis_url and aioredis:
            self._r = aioredis.from_url(self._redis_url, decode_responses=True)
            logger.info("SessionStore: Redis connected")
        else:
            logger.info("SessionStore: using in-memory backend")

    async def close(self) -> None:
        if self._r is not None:
            await self._r.close()

    def _key(self, session_id: str, suffix: str) -> str:
        return f"gr:{session_id}:{suffix}"

    async def hset_json(self, session_id: str, suffix: str, obj: Any) -> None:
        raw = json.dumps(obj)
        if self._r is not None:
            await self._r.set(self._key(session_id, suffix), raw, ex=86400)
        else:
            self._mem.setdefault(session_id, {})[suffix] = raw

    async def hget_json(self, session_id: str, suffix: str) -> Any | None:
        if self._r is not None:
            raw = await self._r.get(self._key(session_id, suffix))
        else:
            raw = self._mem.get(session_id, {}).get(suffix)
        if raw is None:
            return None
        return json.loads(raw)

    async def rpush_json(self, session_id: str, suffix: str, obj: Any) -> None:
        raw = json.dumps(obj)
        if self._r is not None:
            await self._r.rpush(self._key(session_id, suffix), raw)
            await self._r.expire(self._key(session_id, suffix), 86400)
        else:
            lst = self._mem.setdefault(session_id, {}).setdefault(f"list:{suffix}", [])
            lst.append(raw)

    async def lrange_json(self, session_id: str, suffix: str) -> list[Any]:
        if self._r is not None:
            items = await self._r.lrange(self._key(session_id, suffix), 0, -1)
            return [json.loads(x) for x in items]
        raw_list = self._mem.get(session_id, {}).get(f"list:{suffix}", [])
        return [json.loads(x) for x in raw_list]
