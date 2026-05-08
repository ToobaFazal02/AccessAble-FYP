"""
Configuration - All constants and environment variables
(Module 1, Module 2, and Module 3 Compatible)
"""

import os
import warnings
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
# Estimated pricing used for logging (USD per 1M tokens).
# Update these to match the exact model pricing from Gemini docs.
GEMINI_PRICE_INPUT_PER_1M_USD = float(os.getenv("GEMINI_PRICE_INPUT_PER_1M_USD", "0.10"))
GEMINI_PRICE_OUTPUT_PER_1M_USD = float(os.getenv("GEMINI_PRICE_OUTPUT_PER_1M_USD", "0.40"))


# ============================================================================
# IMAGE CONSTRAINTS (Module 1)
# ============================================================================
MAX_IMAGE_SIZE_BYTES = 5_000_000  # 5MB
DOWNLOAD_TIMEOUT_SEC = 10


# ============================================================================
# CACHE SETTINGS (Module 1, Module 2, Module 3)
# ============================================================================
CACHE_TTL_SECONDS = 604800  # 7 days (default for Module 1)
CACHE_TTL_CAPTIONS = 2592000  # 30 days (for Module 2)
CACHE_TTL_KEYBOARD = 2592000  # 30 days (for Module 3 keyboard statistics)
USE_REDIS = True  # Set False to force in-memory fallback


# ============================================================================
# VIDEO PROCESSING SETTINGS (Module 2)
# ============================================================================
YTDLP_TIMEOUT_SEC = 30  # Timeout for yt-dlp subprocess
MAX_CONCURRENT_CAPTION_REQUESTS = 5  # Rate limiting (future)


# ============================================================================
# KEYBOARD ACCESSIBILITY SETTINGS (Module 3)
# ============================================================================
# TTL already defined above as CACHE_TTL_KEYBOARD
# Additional Module 3 settings can be added here as needed


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
    warnings.warn("GEMINI_API_KEY missing in .env — Module 1 (image alt-text) will be unavailable")

if not os.path.exists(PROMPT_PATH):
    warnings.warn(f"Prompt file missing: {PROMPT_PATH} — Module 1 (image alt-text) will be unavailable")


# ============================================================================
# ENVIRONMENT INFO (for debugging)
# ============================================================================
def get_config_info() -> dict:
    """Return current configuration (for /metrics endpoint)"""
    return {
        "redis_enabled": USE_REDIS,
        "redis_url": REDIS_URL if USE_REDIS else "disabled",
        "model": MODEL_NAME,
        "gemini_price_input_per_1m_usd": GEMINI_PRICE_INPUT_PER_1M_USD,
        "gemini_price_output_per_1m_usd": GEMINI_PRICE_OUTPUT_PER_1M_USD,
        "max_image_size_mb": MAX_IMAGE_SIZE_BYTES / 1_000_000,
        "cache_ttl_images_days": CACHE_TTL_SECONDS / 86400,
        "cache_ttl_captions_days": CACHE_TTL_CAPTIONS / 86400,
        "cache_ttl_keyboard_days": CACHE_TTL_KEYBOARD / 86400,
    }
