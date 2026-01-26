"""
Configuration - All constants and environment variables
"""

import os
from dotenv import load_dotenv

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(BASE_DIR, ".env")
PROMPT_PATH = os.path.join(BASE_DIR, "prompts", "image-alt-text.md")

# Load .env
load_dotenv(ENV_PATH)

# API Keys
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Model Settings
MODEL_NAME = "gemini-flash-latest"
MAX_CONCURRENT_AI_CALLS = 5

# Image Constraints
MAX_IMAGE_SIZE_BYTES = 5_000_000  # 5MB
DOWNLOAD_TIMEOUT_SEC = 10

# Cache Settings
CACHE_TTL_SECONDS = 604800  # 7 days
USE_REDIS = True  # Set False to use in-memory fallback

# Validate
if not GEMINI_API_KEY:
    raise RuntimeError("❌ GEMINI_API_KEY missing in .env")

if not os.path.exists(PROMPT_PATH):
    raise FileNotFoundError(f"❌ Prompt file missing: {PROMPT_PATH}")