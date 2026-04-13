"""
Cache Manager - Redis with in-memory fallback (Module 1 & 2 Compatible)
"""

import hashlib
import json
from typing import Optional
from redis import Redis, RedisError

from app.config import REDIS_URL, USE_REDIS, CACHE_TTL_SECONDS
from app.logger import log_info, log_warning, log_error


class CacheManager:
    """
    Unified cache manager for all modules
    Supports both Redis and in-memory fallback
    """
    
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
                log_info(f"✅ Redis connected: {REDIS_URL}")
            except RedisError as e:
                log_warning(f"⚠️  Redis failed, using in-memory: {e}")
                self.redis_client = None
    
    def hash_url(self, url: str) -> str:
        """Generate SHA256 hash from URL"""
        return hashlib.sha256(url.encode("utf-8")).hexdigest()
    
    async def get(self, cache_key: str) -> Optional[dict]:
        """
        Get cached result by key
        
        Args:
            cache_key: Full cache key (e.g., 'img_alt:abc123' or 'caption:xyz789')
            
        Returns:
            Cached dict or None
        """
        try:
            if self.redis_client:
                data = self.redis_client.get(cache_key)
                if data:
                    return json.loads(data)
            else:
                return self.memory_cache.get(cache_key)
        except Exception as e:
            log_error(f"Cache get failed for {cache_key}: {e}")
        return None
    
    async def set(self, cache_key: str, value: dict, ttl: Optional[int] = None):
        """
        Save to cache with optional TTL
        
        Args:
            cache_key: Full cache key
            value: Dict to cache
            ttl: Time-to-live in seconds (defaults to CACHE_TTL_SECONDS)
        """
        if ttl is None:
            ttl = CACHE_TTL_SECONDS
        
        try:
            if self.redis_client:
                self.redis_client.setex(
                    cache_key,
                    ttl,
                    json.dumps(value)
                )
            else:
                # In-memory cache doesn't support TTL, just store
                self.memory_cache[cache_key] = value
        except Exception as e:
            log_error(f"Cache set failed for {cache_key}: {e}")

    async def list_values(self, prefix: str) -> list[dict]:
        """
        Return all cached JSON objects whose keys start with the given prefix.

        This is mainly used for lightweight analytics aggregation where
        per-domain keyboard telemetry is stored as individual cache entries.
        """
        values: list[dict] = []

        try:
            if self.redis_client:
                pattern = f"{prefix}*"
                for key in self.redis_client.scan_iter(match=pattern):
                    data = self.redis_client.get(key)
                    if not data:
                        continue

                    parsed = json.loads(data) if isinstance(data, str) else data
                    if isinstance(parsed, dict):
                        values.append(parsed)
            else:
                for key, value in self.memory_cache.items():
                    if not str(key).startswith(prefix):
                        continue
                    if isinstance(value, dict):
                        values.append(value)
        except Exception as e:
            log_error(f"Cache list failed for prefix {prefix}: {e}")

        return values

    def backend_name(self) -> str:
        """Return the active cache backend label for diagnostics."""
        return "redis" if self.redis_client else "memory"
    
    def size(self) -> int:
        """Get cache size"""
        try:
            if self.redis_client:
                return self.redis_client.dbsize()
            else:
                return len(self.memory_cache)
        except:
            return 0


# ============================================================================
# SINGLETON INSTANCE
# ============================================================================
_cache_manager = CacheManager()


# ============================================================================
# PUBLIC API (for backward compatibility with Module 1)
# ============================================================================

async def get_cached_response(cache_key: str) -> Optional[dict]:
    """
    Get cached response (Module 1 & 2 compatible)
    
    Args:
        cache_key: Full cache key (with prefix)
        
    Returns:
        Cached dict or None
    """
    return await _cache_manager.get(cache_key)


async def set_cached_response(cache_key: str, value: dict, ttl: Optional[int] = None):
    """
    Set cached response (Module 1 & 2 compatible)
    
    Args:
        cache_key: Full cache key (with prefix)
        value: Dict to cache
        ttl: Time-to-live in seconds (optional)
    """
    await _cache_manager.set(cache_key, value, ttl)


def hash_url(url: str) -> str:
    """Generate SHA256 hash from URL (for backward compatibility)"""
    return _cache_manager.hash_url(url)


# ============================================================================
# LIFESPAN MANAGEMENT (for main.py)
# ============================================================================

async def init_redis_connection():
    """Initialize Redis connection (called during startup)"""
    # Connection is already initialized in __init__
    if _cache_manager.redis_client:
        log_info("Redis connection verified")
    else:
        log_warning("Using in-memory cache (Redis unavailable)")


async def close_redis_connection():
    """Close Redis connection (called during shutdown)"""
    if _cache_manager.redis_client:
        try:
            _cache_manager.redis_client.close()
            log_info("Redis connection closed")
        except Exception as e:
            log_error(f"Error closing Redis: {e}")


# ============================================================================
# OLD API (for Module 1 backward compatibility)
# ============================================================================
cache = _cache_manager  # For any code that uses cache.get() directly
