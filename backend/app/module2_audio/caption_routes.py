"""
Module 2: Audio Captioning Routes (FastAPI 0.115+ Best Practices)
Endpoint for extracting caption metadata from videos
"""
from fastapi import APIRouter, HTTPException, status, Depends
from app.logger import log_info, log_error, log_success
from app.metrics import METRICS
from app.cache import get_cached_response, set_cached_response
import time
import hashlib
from typing import Dict, Annotated



from app.module2_audio.caption_schemas import (
    CaptionExtractionRequest,
    CaptionExtractionResponse,
    CaptionTrack,
    CaptionAssistRequest,
    CaptionAssistResponse,
    ErrorResponse
)
from app.module2_audio.caption_extractor import CaptionExtractor
from app.module2_audio.caption_assist import transform_caption_cues


# Create router for Module 2
router = APIRouter(
    prefix="/api/v1/captions",
    tags=["Audio Captioning"]
)


# ============================================================================
# DEPENDENCY INJECTION (FastAPI Best Practice)
# ============================================================================

def generate_cache_key(request: CaptionExtractionRequest) -> str:
    """
    Dependency: Generate cache key from video URL
    
    Using dependency injection makes this testable and reusable
    """
    video_url = str(request.video_url)
    url_hash = hashlib.sha256(video_url.encode()).hexdigest()
    return f"caption:v4:{url_hash}"


# Type alias for cleaner annotations
CacheKey = Annotated[str, Depends(generate_cache_key)]


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post(
    "/extract",
    response_model=CaptionExtractionResponse,
    status_code=status.HTTP_200_OK,
    summary="Extract Caption Metadata",
    description="Extracts available caption tracks from a video URL without downloading the video",
    responses={
        200: {"description": "Caption metadata extracted successfully"},
        400: {
            "model": ErrorResponse,
            "description": "Invalid video URL or unsupported platform"
        },
        500: {
            "model": ErrorResponse,
            "description": "Internal server error during extraction"
        }
    }
)
async def extract_captions(
    request: CaptionExtractionRequest,
    cache_key: CacheKey  # Injected dependency
) -> Dict:
    """
    Extract caption metadata from video URL
    
    Process:
    1. Validate video URL (Pydantic)
    2. Check cache for existing result
    3. Use yt-dlp (via run_in_threadpool) to extract caption metadata
    4. Cache result for future requests
    5. Return caption tracks and video info
    
    PERFORMANCE NOTE:
    - First request: 2-5 seconds (subprocess call in threadpool)
    - Cached request: <0.1 seconds
    - Cache TTL: 30 days
    
    Args:
        request: CaptionExtractionRequest containing video_url
        cache_key: Auto-generated cache key (injected)
        
    Returns:
        CaptionExtractionResponse with caption tracks and metadata
    """
    start_time = time.time()
    video_url = str(request.video_url)
    
    log_info(f"[Module 2] Caption extraction request for: {video_url}")
    
    # Update metrics
    METRICS["total_requests"] += 1
    METRICS["module2_requests"] = METRICS.get("module2_requests", 0) + 1
    
    try:
        # Check cache first
        cached_result = await get_cached_response(cache_key)
        if cached_result:
            log_success(f"[Module 2] Cache hit for: {video_url}")
            cached_result["cached"] = True
            cached_result["response_time_sec"] = round(time.time() - start_time, 2)
            METRICS["cache_hits"] = METRICS.get("cache_hits", 0) + 1
            return cached_result
        
        # Extract captions using yt-dlp (via run_in_threadpool)
        log_info(f"[Module 2] Cache miss - Extracting captions...")
        extraction_result = await CaptionExtractor.extract_captions(video_url)
        
        # Format response
        response = CaptionExtractionResponse(
            video_url=video_url,
            has_captions=extraction_result["has_captions"],
            caption_tracks=[
                CaptionTrack(**track) for track in extraction_result["caption_tracks"]
            ],
            video_title=extraction_result["video_title"],
            video_duration=extraction_result["video_duration"],
            platform=extraction_result["platform"],
            cached=False,
            response_time_sec=round(time.time() - start_time, 2),
            source="Caption_Metadata"
        )
        
        # Cache the result (30-day TTL)
        # Pydantic V2: Use model_dump() instead of dict()
        await set_cached_response(
            cache_key,
            response.model_dump(),
            ttl=2592000  # 30 days in seconds
        )
        
        log_success(
            f"[Module 2] Successfully extracted {len(response.caption_tracks)} caption tracks "
            f"in {response.response_time_sec}s"
        )
        
        METRICS["successful_requests"] = METRICS.get("successful_requests", 0) + 1
        
        # Pydantic V2: Use model_dump() instead of dict()
        return response.model_dump()
        
    except RuntimeError as e:
        # Handle yt-dlp specific errors
        log_error(f"[Module 2] Caption extraction failed: {str(e)}")
        METRICS["failed_requests"] = METRICS.get("failed_requests", 0) + 1
        
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Caption extraction failed",
                "detail": str(e),
                "video_url": video_url
            }
        )
        
    except Exception as e:
        # Handle unexpected errors
        log_error(f"[Module 2] Unexpected error: {str(e)}")
        METRICS["failed_requests"] = METRICS.get("failed_requests", 0) + 1
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Internal server error",
                "detail": "An unexpected error occurred during caption extraction",
                "video_url": video_url
            }
        )


@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    summary="Module 2 Health Check",
    description="Verify Module 2 dependencies are installed correctly"
)
async def module2_health_check():
    """
    Health check for Module 2
    Verifies yt-dlp is installed and accessible
    """
    import subprocess
    from starlette.concurrency import run_in_threadpool
    
    async def check_ytdlp() -> Dict:
        """Run yt-dlp --version in threadpool to avoid blocking"""
        def _sync_check():
            try:
                result = subprocess.run(
                    ['yt-dlp', '--version'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    return {
                        "installed": True,
                        "version": result.stdout.strip()
                    }
                return {
                    "installed": False,
                    "error": "Command failed"
                }
            except FileNotFoundError:
                return {
                    "installed": False,
                    "error": "yt-dlp not found in PATH"
                }
            except Exception as e:
                return {
                    "installed": False,
                    "error": str(e)
                }
        
        return await run_in_threadpool(_sync_check)
    
    ytdlp_status = await check_ytdlp()
    
    if ytdlp_status["installed"]:
        return {
            "status": "healthy",
            "module": "Module 2: Audio Captioning",
            "yt_dlp_installed": True,
            "yt_dlp_version": ytdlp_status["version"],
            "message": "Caption extraction service is operational"
        }
    else:
        return {
            "status": "unhealthy",
            "module": "Module 2: Audio Captioning",
            "yt_dlp_installed": False,
            "error": ytdlp_status.get("error"),
            "message": "yt-dlp is not installed. Run: pip install yt-dlp"
        }


async def _handle_assist_mode(request: CaptionAssistRequest, expected_mode: str) -> Dict:
    """Shared route handler for caption assist endpoints."""
    if request.mode != expected_mode:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Assist mode mismatch",
                "detail": f"Expected mode '{expected_mode}' but received '{request.mode}'",
            }
        )

    if expected_mode == "translate" and not str(request.target_lang or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Missing target language",
                "detail": "target_lang is required for translation requests",
            }
        )

    try:
        result = await transform_caption_cues(
            mode=expected_mode,
            cues=[cue.model_dump() for cue in request.cues],
            source_lang=request.source_lang,
            target_lang=request.target_lang,
            page_url=request.page_url or "",
            video_url=request.video_url or "",
        )
        return CaptionAssistResponse(**result).model_dump()
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": "Caption assist failed",
                "detail": str(e),
            }
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Internal server error",
                "detail": f"Unexpected caption assist failure: {str(e)}",
            }
        ) from e


@router.post(
    "/assist/simplify",
    response_model=CaptionAssistResponse,
    status_code=status.HTTP_200_OK,
    summary="Simplify Caption Cues",
    description="Rewrite cues into simpler, easier-to-read accessible captions",
)
async def simplify_captions(request: CaptionAssistRequest) -> Dict:
    return await _handle_assist_mode(request, "simplify")


@router.post(
    "/assist/translate",
    response_model=CaptionAssistResponse,
    status_code=status.HTTP_200_OK,
    summary="Translate Caption Cues",
    description="Translate cues into the requested target language while preserving timing",
)
async def translate_captions(request: CaptionAssistRequest) -> Dict:
    return await _handle_assist_mode(request, "translate")


@router.post(
    "/assist/summarize",
    response_model=CaptionAssistResponse,
    status_code=status.HTTP_200_OK,
    summary="Summarize Caption Cues",
    description="Compress cues into shorter summary-like caption lines while preserving timing",
)
async def summarize_captions(request: CaptionAssistRequest) -> Dict:
    return await _handle_assist_mode(request, "summarize")
