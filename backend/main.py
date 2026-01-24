"""
AccessAble - AI Accessibility Backend
Module 1: AI-based Image Alt Text Generation
FastAPI + Google Gemini Flash
"""

import os
import time
import hashlib
import asyncio
from datetime import datetime
from io import BytesIO
from typing import Optional

import httpx
from PIL import Image
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl, validator
from dotenv import load_dotenv
from google import genai
import uvicorn

# =====================================================
# CONFIGURATION - Must be at TOP
# =====================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
PROMPT_PATH = os.path.join(BASE_DIR, "prompt", "image-alt-text.md")

# Image constraints
MAX_IMAGE_SIZE_BYTES = 5_000_000  # 5MB - Gemini API limit
DOWNLOAD_TIMEOUT_SEC = 10
MAX_CONCURRENT_AI_CALLS = 5  # Prevent API overload

# =====================================================
# LOGGING UTILITIES
# =====================================================

class LogColor:
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'

def log_info(message: str):
    print(f"{LogColor.BLUE}[{datetime.now().strftime('%H:%M:%S')} INFO]{LogColor.ENDC} {message}")

def log_success(message: str):
    print(f"{LogColor.GREEN}[{datetime.now().strftime('%H:%M:%S')} SUCCESS]{LogColor.ENDC} {message}")

def log_error(message: str):
    print(f"{LogColor.FAIL}[{datetime.now().strftime('%H:%M:%S')} ERROR]{LogColor.ENDC} {message}")

def log_warning(message: str):
    print(f"{LogColor.WARNING}[{datetime.now().strftime('%H:%M:%S')} WARNING]{LogColor.ENDC} {message}")

# =====================================================
# ENVIRONMENT & API SETUP
# =====================================================

log_info(f"Loading environment from: {ENV_PATH}")
load_dotenv(ENV_PATH)

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    log_error("GEMINI_API_KEY not found in .env file")
    raise RuntimeError("❌ GEMINI_API_KEY missing in .env - Cannot start server")

client = genai.Client(api_key=API_KEY)
MODEL_NAME = "gemini-flash-latest"  # Updated to latest stable model

log_success(f"Gemini client initialized with model: {MODEL_NAME}")

# =====================================================
# GLOBAL STATE
# =====================================================

SYSTEM_PROMPT = ""  # Loaded on startup
ALT_TEXT_CACHE = {}  # In-memory cache (ephemeral on serverless)

# Basic metrics tracking
METRICS = {
    "total_requests": 0,
    "cache_hits": 0,
    "cache_misses": 0,
    "ai_calls": 0,
    "errors": 0,
    "avg_response_time": 0.0
}

# Semaphore to limit concurrent AI calls
ai_semaphore = asyncio.Semaphore(MAX_CONCURRENT_AI_CALLS)

# =====================================================
# FASTAPI APP
# =====================================================

app = FastAPI(
    title="AccessAble – AI Accessibility Backend",
    version="1.0.0",
    description="Module 1: AI-powered Image Alt Text Generation using Google Gemini",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS - Allow Chrome extension to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your extension ID
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True
)

# =====================================================
# STARTUP EVENT - Load Prompt
# =====================================================

@app.on_event("startup")
async def startup_event():
    global SYSTEM_PROMPT
    
    if not os.path.exists(PROMPT_PATH):
        log_error(f"Prompt file missing at: {PROMPT_PATH}")
        raise FileNotFoundError(f"Critical file missing: {PROMPT_PATH}")
    
    try:
        with open(PROMPT_PATH, "r", encoding="utf-8") as f:
            SYSTEM_PROMPT = f.read().strip()
        log_success(f"System prompt loaded ({len(SYSTEM_PROMPT)} chars)")
    except Exception as e:
        log_error(f"Failed to load system prompt: {e}")
        raise

# =====================================================
# REQUEST MODELS
# =====================================================

class ImageRequest(BaseModel):
    image_url: HttpUrl
    page_url: Optional[HttpUrl] = None
    
    @validator('image_url')
    def validate_image_url(cls, v):
        """Ensure URL is HTTP/HTTPS and not obviously malicious"""
        url_str = str(v)
        
        # Block common attack vectors
        blocked_schemes = ['javascript:', 'data:', 'file:', 'ftp:']
        if any(url_str.lower().startswith(scheme) for scheme in blocked_schemes):
            raise ValueError(f"Blocked URL scheme. Only HTTP(S) allowed.")
        
        # Ensure it's an image-like URL (basic heuristic)
        valid_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']
        if not any(url_str.lower().endswith(ext) for ext in valid_extensions):
            # Allow URLs without extensions (many CDNs use query params)
            log_warning(f"URL has no standard image extension: {url_str}")
        
        return v
    
    class Config:
        schema_extra = {
            "example": {
                "image_url": "https://example.com/image.jpg",
                "page_url": "https://example.com/article"
            }
        }

# =====================================================
# CACHE UTILITIES
# =====================================================

def hash_image_url(url: str) -> str:
    """Generate deterministic hash for caching"""
    return hashlib.sha256(url.encode("utf-8")).hexdigest()

def get_cached_result(img_hash: str) -> Optional[dict]:
    """Retrieve cached result if exists"""
    if img_hash in ALT_TEXT_CACHE:
        METRICS["cache_hits"] += 1
        return {**ALT_TEXT_CACHE[img_hash], "cached": True}
    
    METRICS["cache_misses"] += 1
    return None

def save_to_cache(img_hash: str, result: dict):
    """Save result to in-memory cache"""
    ALT_TEXT_CACHE[img_hash] = result
    log_info(f"Cached result for hash: {img_hash[:12]}...")

# =====================================================
# IMAGE DOWNLOAD (ASYNC)
# =====================================================

async def download_image_from_url(url: str) -> Image.Image:
    """
    Download image asynchronously with proper validation.
    
    Raises:
        ValueError: If image is too large or invalid
        httpx.HTTPError: If download fails
    """
    
    async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT_SEC) as client:
        # Step 1: HEAD request to check size BEFORE downloading
        try:
            head_response = await client.head(url, follow_redirects=True)
            content_length = int(head_response.headers.get("Content-Length", 0))
            
            if content_length > MAX_IMAGE_SIZE_BYTES:
                raise ValueError(
                    f"Image exceeds {MAX_IMAGE_SIZE_BYTES / 1_000_000}MB limit "
                    f"(actual: {content_length / 1_000_000:.2f}MB)"
                )
        except (httpx.HTTPError, ValueError) as e:
            log_warning(f"HEAD request failed, proceeding with GET: {e}")
        
        # Step 2: Download image with streaming to avoid memory issues
        log_info(f"Downloading image from: {url[:80]}...")
        
        headers = {
            "User-Agent": "Mozilla/5.0 (AccessAble Bot/1.0)"
        }
        
        async with client.stream("GET", url, headers=headers, follow_redirects=True) as response:
            response.raise_for_status()
            
            # Validate content type
            content_type = response.headers.get("Content-Type", "")
            if not content_type.startswith("image/"):
                log_warning(f"Non-image content-type: {content_type}")
            
            # Read with size limit
            chunks = []
            total_size = 0
            
            async for chunk in response.aiter_bytes(chunk_size=8192):
                total_size += len(chunk)
                if total_size > MAX_IMAGE_SIZE_BYTES:
                    raise ValueError(f"Image exceeded {MAX_IMAGE_SIZE_BYTES / 1_000_000}MB during download")
                chunks.append(chunk)
            
            image_data = b''.join(chunks)
        
        # Step 3: Convert to PIL Image
        try:
            image = Image.open(BytesIO(image_data)).convert("RGB")
            log_success(f"Image downloaded: {image.size[0]}x{image.size[1]}px, {total_size / 1024:.1f}KB")
            return image
        
        except Exception as e:
            raise ValueError(f"Invalid image format: {e}")

# =====================================================
# AI ANALYSIS
# =====================================================

async def analyze_image_with_ai(image: Image.Image) -> str:
    """
    Send image to Gemini AI for alt text generation.
    Uses semaphore to limit concurrent API calls.
    """
    
    async with ai_semaphore:  # Limit concurrent AI calls
        try:
            start_time = time.perf_counter()
            
            # Run synchronous Gemini call in thread pool (it's not async-native)
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: client.models.generate_content(
                    model=MODEL_NAME,
                    contents=[SYSTEM_PROMPT, image]
                )
            )
            
            end_time = time.perf_counter()
            latency = round(end_time - start_time, 2)
            
            description = response.text.strip()
            
            METRICS["ai_calls"] += 1
            log_success(f"AI response received in {latency}s: {description[:60]}...")
            
            return description, latency
        
        except Exception as e:
            METRICS["errors"] += 1
            log_error(f"AI analysis failed: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"AI processing error: {str(e)}"
            )

# =====================================================
# CONFIDENCE SCORING (HEURISTIC)
# =====================================================

def estimate_confidence(text: str) -> float:
    """
    Heuristic confidence score based on response quality.
    NOTE: This is NOT Gemini's internal confidence - just a sanity check.
    
    Scoring logic:
    - Base score: 1.0
    - Short response (< 10 words): -0.4
    - Contains vague words: -0.3
    - Very generic (< 5 words): -0.3
    """
    score = 1.0
    word_count = len(text.split())
    
    if word_count < 10:
        score -= 0.4
    
    vague_indicators = ["maybe", "possibly", "unclear", "unknown", "cannot determine"]
    if any(word in text.lower() for word in vague_indicators):
        score -= 0.3
    
    if word_count < 5:
        score -= 0.3
    
    return round(max(score, 0.1), 2)

# =====================================================
# API ENDPOINTS
# =====================================================

@app.get("/")
def health_check():
    """Health check endpoint"""
    return {
        "status": "online",
        "service": "AccessAble Image Analysis API",
        "model": MODEL_NAME,
        "version": "1.0.0",
        "cache_size": len(ALT_TEXT_CACHE)
    }

@app.get("/metrics")
def get_metrics():
    """Basic usage metrics"""
    return {
        **METRICS,
        "cache_size": len(ALT_TEXT_CACHE),
        "cache_hit_rate": (
            round(METRICS["cache_hits"] / max(METRICS["total_requests"], 1) * 100, 2)
        )
    }

@app.post("/analyze-image")
async def analyze_image(request: ImageRequest):
    """
    Main endpoint: Analyze image and return AI-generated alt text.
    
    Flow:
    1. Check cache
    2. Download image (if cache miss)
    3. Send to Gemini AI
    4. Return result + cache it
    """
    
    METRICS["total_requests"] += 1
    
    image_url = str(request.image_url)
    img_hash = hash_image_url(image_url)
    
    log_info(f"[Request {METRICS['total_requests']}] Hash: {img_hash[:12]}...")
    
    # Step 1: Check cache
    cached_result = get_cached_result(img_hash)
    if cached_result:
        log_success(f"⚡ CACHE HIT - Returning cached result")
        return cached_result
    
    # Step 2: Cache miss - Download image
    log_info(f"📸 CACHE MISS - Downloading image...")
    
    try:
        image = await download_image_from_url(image_url)
    except ValueError as e:
        METRICS["errors"] += 1
        log_error(f"Image validation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPError as e:
        METRICS["errors"] += 1
        log_error(f"Image download failed: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to download image: {str(e)}")
    
    # Step 3: Analyze with AI
    description, latency = await analyze_image_with_ai(image)
    
    # Step 4: Calculate confidence & build response
    confidence = estimate_confidence(description)
    
    if confidence < 0.4:
        log_warning(f"Low confidence ({confidence}) - AI may be uncertain")
        description = f"[Low confidence] {description}"
    
    result = {
        "description": description,
        "confidence": confidence,
        "response_time_sec": latency,
        "source": "AI_Generated",
        "model": MODEL_NAME,
        "cached": False
    }
    
    # Step 5: Cache result
    save_to_cache(img_hash, result)
    
    # Update average response time
    total = METRICS["total_requests"]
    current_avg = METRICS["avg_response_time"]
    METRICS["avg_response_time"] = round(
        (current_avg * (total - 1) + latency) / total, 2
    )
    
    return result

# =====================================================
# ERROR HANDLERS
# =====================================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all error handler"""
    METRICS["errors"] += 1
    log_error(f"Unhandled exception: {exc}")
    
    return {
        "error": "Internal server error",
        "detail": str(exc),
        "path": str(request.url)
    }

# =====================================================
# LOCAL DEVELOPMENT SERVER
# =====================================================

if __name__ == "__main__":
    log_info("Starting AccessAble backend in development mode...")
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )