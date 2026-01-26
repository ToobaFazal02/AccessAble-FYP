"""
Module 1 Routes 
"""

import httpx
from fastapi import APIRouter, HTTPException

from app.schemas import ImageRequest
from app.cache import cache
from app.metrics import METRICS, update_avg_response_time
from app.logger import log_info, log_success, log_error, log_warning
from app.config import MODEL_NAME

from app.module1_image.image_service import download_image_from_url, estimate_confidence
from app.module1_image.gemini_client import analyze_image_with_ai  # ← CHANGED IMPORT


router = APIRouter()


@router.post("/analyze-image")
async def analyze_image(request: ImageRequest):
    
    METRICS["total_requests"] += 1
    
    image_url = str(request.image_url)
    img_hash = cache.hash_url(image_url)
    
    log_info(f"[Request {METRICS['total_requests']}] Hash: {img_hash[:12]}...")
    
    # Step 1: Check cache
    cached_result = cache.get(img_hash)
    if cached_result:
        METRICS["cache_hits"] += 1
        log_success(f"⚡ CACHE HIT - Returning cached result")
        return {**cached_result, "cached": True}
    
    METRICS["cache_misses"] += 1
    log_info(f" CACHE MISS - Downloading image...")
    
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
    
    # Step 5: Cache result
    cache.set(img_hash, result)
    
    # Update average response time
    update_avg_response_time(latency)
    
    return result