"""
Module 1 Routes - Image Analysis API
"""

import httpx
from fastapi import APIRouter, HTTPException

from app.schemas import ImageRequest
from app.cache import cache
from app.metrics import METRICS, update_avg_response_time
from app.logger import log_info, log_success, log_error, log_warning
from app.config import MODEL_NAME

from app.module1_image.image_service import download_image_from_url, estimate_confidence
from app.module1_image.gemini_client import analyze_image_with_ai


# ============================================================================
# ROUTER CONFIGURATION - Professional REST API Standards
# ============================================================================

router = APIRouter(
    prefix="/api/v1/image",  
    tags=["Image Analysis"], 
)


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post(
    "/analyze",
    summary="Analyze Image for Accessibility",
    description="Generate AI-powered alternative text (alt text) for images using Google's Gemini Vision API. Returns descriptive text with confidence scores and caching support.",
    response_description="Image analysis result with AI-generated description and metadata"
)
async def analyze_image(request: ImageRequest):
    """
    **Analyze an image and generate accessibility-friendly alt text**
    
    This endpoint:
    - Downloads the image from the provided URL
    - Analyzes it using Google Gemini Vision AI
    - Returns a detailed description suitable for screen readers
    - Caches results to improve performance
    - Estimates confidence based on description quality
    
    **Use Cases:**
    - Web accessibility compliance (WCAG 2.1)
    - Automatic alt text generation for CMS platforms
    - Visual content remediation for educational sites
    
    **Performance:**
    - Cache hit: ~50ms response time
    - Cache miss: ~2-4s (AI inference time)
    """
    
    METRICS["total_requests"] += 1
    
    image_url = str(request.image_url)
    img_hash = cache.hash_url(image_url)
    
    log_info(f"[Request {METRICS['total_requests']}] Hash: {img_hash[:12]}...")
    
    # Step 1: Check cache
    cached_result = await cache.get(img_hash)
    if cached_result:
        METRICS["cache_hits"] += 1
        log_success(f"⚡ CACHE HIT - Returning cached result")
        return {**cached_result, "cached": True}
    
    METRICS["cache_misses"] += 1
    log_info(f"🔄 CACHE MISS - Downloading image...")
    
    # Step 2: Download image
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
    
    # Step 4: Calculate confidence
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
    
    log_success(f"Analysis complete - Confidence: {confidence:.2f}, Time: {latency:.2f}s")
    await cache.set(img_hash, result)
    
    # Update average response time
    update_avg_response_time(latency)
    
    return result