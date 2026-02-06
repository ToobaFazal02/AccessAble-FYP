"""
AccessAble Backend - FastAPI Main Application (FastAPI 0.115+ Standards)
Multi-module accessibility API server with lifespan management
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import ALLOWED_ORIGINS
from app.logger import log_info, log_success, log_error
from app.metrics import METRICS

# Import module routers
try:
    from app.module1_image.image_routes import router as image_router
    from app.module2_audio.caption_routes import router as caption_router
    from app.module3_keyboard.keyboard_routes import router as keyboard_router
except ImportError as e:
    print(f"CRITICAL IMPORT ERROR: {e}")
    raise e


# ============================================================================
# LIFESPAN EVENT MANAGER (FastAPI 0.115+ Best Practice)
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Lifespan context manager for startup/shutdown events
    
    This replaces the deprecated @app.on_event("startup")/@app.on_event("shutdown")
    pattern with the modern asynccontextmanager approach.
    
    Benefits:
    - Unified startup/shutdown logic
    - Proper resource cleanup guaranteed
    - Better error handling
    - Compatible with FastAPI 0.95+
    """
    # ========== STARTUP ==========
    log_success("=" * 60)
    log_success("AccessAble Backend Server Starting")
    log_success("=" * 60)
    
    # Initialize Redis connection 
    try:
        from app.cache import init_redis_connection
        await init_redis_connection()
        log_info("Redis connection initialized")
    except ImportError:
        log_info("Redis connection handled by cache module")
    except Exception as e:
        log_error(f"Redis initialization failed: {e}")
        log_info("Falling back to in-memory cache")
    
    # Log module status
    log_info("Module 1: Image Analysis - Active")
    log_info("Module 2: Audio Captioning - Active")
    log_info("Module 3: Keyboard Accessibility - Active")
    log_success("=" * 60)
    log_success("Server ready to accept requests")
    log_success("=" * 60)
    
    # Application runs here (between startup and shutdown)
    yield
    
    # ========== SHUTDOWN ==========
    log_info("=" * 60)
    log_info("AccessAble Backend Server Shutting Down")
    log_info("=" * 60)
    
    # Cleanup Redis connection
    try:
        from app.cache import close_redis_connection
        await close_redis_connection()
        log_info("Redis connection closed")
    except ImportError:
        pass
    except Exception as e:
        log_error(f"Redis cleanup error: {e}")
    
    log_success("Server shutdown complete")


# ============================================================================
# APPLICATION INITIALIZATION
# ============================================================================

app = FastAPI(
    title="AccessAble API",
    version="1.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    
    contact={
        "name": "AccessAble Development Team",
        "url": "https://github.com/ToobaFazal02/AccessAble-FYP.git"  
    },
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register module routers
app.include_router(image_router)       # Module 1: Image Analysis
app.include_router(caption_router)     # Module 2: Audio Captioning
app.include_router(keyboard_router)    # Module 3: Keyboard Accessibility

log_info("FastAPI application initialized with 3 modules")


# ============================================================================
# ROOT ENDPOINTS
# ============================================================================

@app.get(
    "/",
    summary="API Health Check",
    description="Returns API status, available modules, and endpoint documentation",
    tags=["System"]
)
async def root():
    """
    Root endpoint - Health check and API information
    
    Returns service status, version info, and available endpoints.
    Use this to verify the API is operational.
    """
    return {
        "service": "AccessAble API",
        "status": "operational",
        "version": "1.2.0",
        "modules": {
            "module1": "Image Analysis (AI Vision)",
            "module2": "Audio Captioning (Caption Extraction)",
            "module3": "Keyboard Accessibility (Navigation Fixes)"
        },
        "endpoints": {
            "docs": "/docs",
            "redoc": "/redoc",
            "module1": "/api/v1/image/analyze",
            "module2": "/api/v1/captions/extract",
            "module2_health": "/api/v1/captions/health",
            "module3_track": "/api/v1/keyboard/track-fixes",
            "module3_analytics": "/api/v1/keyboard/analytics",
            "module3_health": "/api/v1/keyboard/health",
            "metrics": "/metrics"
        },
        "standards": {
            "fastapi_version": "0.115+",
            "pydantic_version": "V2",
            "async_pattern": "lifespan + run_in_threadpool"
        }
    }


@app.get(
    "/metrics",
    summary="API Usage Metrics",
    description="Returns detailed metrics including request counts, cache performance, and average response times",
    tags=["System"]
)
async def get_metrics():
    """
    Return API usage metrics
    
    Provides insights into:
    - Total requests processed
    - Cache hit/miss rates
    - Average response times
    - Error counts
    """
    return {
        "service": "AccessAble API",
        "metrics": METRICS,
        "cache_hit_rate": (
            round(METRICS.get("cache_hits", 0) / max(METRICS.get("total_requests", 1), 1) * 100, 2)
            if METRICS.get("total_requests", 0) > 0 else 0
        )
    }


# ============================================================================
# MAIN ENTRY POINT (for local development)
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )