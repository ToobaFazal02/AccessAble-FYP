"""
Cache Manager - Redis with in-memory fallback
"""

import hashlib
import json
from typing import Optional
from redis import Redis, RedisError

from app.config import REDIS_URL, USE_REDIS, CACHE_TTL_SECONDS
from app.logger import log_info, log_warning, log_error


class Cache:
    """Simple cache that uses Redis or falls back to dict"""
    
    def __init__(self):
        self.redis_client = None
        self.memory_cache = {}  # Fallback
        
        if USE_REDIS:
            try:
                self.redis_client = Redis.from_url(
                    REDIS_URL,
                    decode_responses=True,
                    socket_connect_timeout=5
                )
                self.redis_client.ping()
                log_info(f"Redis connected: {REDIS_URL}")
            except RedisError as e:
                log_warning(f"⚠️  Redis failed, using in-memory: {e}")
                self.redis_client = None
    
    def hash_url(self, url: str) -> str:
        """Your hash_image_url function"""
        return hashlib.sha256(url.encode("utf-8")).hexdigest()
    
    def get(self, img_hash: str) -> Optional[dict]:
        """Get cached result"""
        try:
            if self.redis_client:
                data = self.redis_client.get(f"img_alt:{img_hash}")
                if data:
                    return json.loads(data)
            else:
                return self.memory_cache.get(img_hash)
        except Exception as e:
            log_error(f"Cache get failed: {e}")
        return None
    
    def set(self, img_hash: str, value: dict):
        """Save to cache"""
        try:
            if self.redis_client:
                self.redis_client.setex(
                    f"img_alt:{img_hash}",
                    CACHE_TTL_SECONDS,
                    json.dumps(value)
                )
            else:
                self.memory_cache[img_hash] = value
        except Exception as e:
            log_error(f"Cache set failed: {e}")
    
    def size(self) -> int:
        """Get cache size"""
        try:
            if self.redis_client:
                return self.redis_client.dbsize()
            else:
                return len(self.memory_cache)
        except:
            return 0


# Single instance
cache = Cache()