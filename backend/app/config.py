"""
Configuration - All constants and environment variables
(Module 1 & Module 2 Compatible)
"""

import os
from dotenv import load_dotenv

# ============================================================================
# PATHS
# ============================================================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(BASE_DIR, ".env")
PROMPT_PATH = os.path.join(BASE_DIR, "prompts", "image-alt-text.md")

# Load .env
load_dotenv(ENV_PATH)


# ============================================================================
# API KEYS
# ============================================================================
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


# ============================================================================
# MODEL SETTINGS (Module 1)
# ============================================================================
MODEL_NAME = "gemini-flash-latest"  # Updated to latest model
MAX_CONCURRENT_AI_CALLS = 5


# ============================================================================
# IMAGE CONSTRAINTS (Module 1)
# ============================================================================
MAX_IMAGE_SIZE_BYTES = 5_000_000  # 5MB
DOWNLOAD_TIMEOUT_SEC = 10


# ============================================================================
# CACHE SETTINGS (Module 1 & Module 2)
# ============================================================================
CACHE_TTL_SECONDS = 604800  # 7 days (default for Module 1)
CACHE_TTL_CAPTIONS = 2592000  # 30 days (for Module 2)
USE_REDIS = True  # Set False to force in-memory fallback


# ============================================================================
# VIDEO PROCESSING SETTINGS (Module 2)
# ============================================================================
YTDLP_TIMEOUT_SEC = 30  # Timeout for yt-dlp subprocess
MAX_CONCURRENT_CAPTION_REQUESTS = 5  # Rate limiting (future)


# ============================================================================
# CORS ORIGINS
# ============================================================================
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "chrome-extension://*",  # Chrome extension support
    "*",  # Allow all (for development - restrict in production)
]


# ============================================================================
# VALIDATION
# ============================================================================
if not GEMINI_API_KEY:
    raise RuntimeError("❌ GEMINI_API_KEY missing in .env file")

if not os.path.exists(PROMPT_PATH):
    raise FileNotFoundError(f"❌ Prompt file missing: {PROMPT_PATH}")


# ============================================================================
# ENVIRONMENT INFO (for debugging)
# ============================================================================
def get_config_info() -> dict:
    """Return current configuration (for /metrics endpoint)"""
    return {
        "redis_enabled": USE_REDIS,
        "redis_url": REDIS_URL if USE_REDIS else "disabled",
        "model": MODEL_NAME,
        "max_image_size_mb": MAX_IMAGE_SIZE_BYTES / 1_000_000,
        "cache_ttl_images_days": CACHE_TTL_SECONDS / 86400,
        "cache_ttl_captions_days": CACHE_TTL_CAPTIONS / 86400,
    }