"""
Main FastAPI App - Just routes and health checks
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.logger import log_info, log_success, log_error
from app.metrics import METRICS
from app.cache import cache
from app.config import MODEL_NAME

# Import Module 1 routes
from app.module1_image.routes import router as module1_router


# FastAPI app
app = FastAPI(
    title="AccessAble – AI Accessibility Backend",
    version="1.0.0",
    description="Module 1: AI-powered Image Alt Text Generation",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True
)

# Health check
@app.get("/")
def health_check():
    return {
        "status": "online",
        "service": "AccessAble Image Analysis API",
        "model": MODEL_NAME,
        "version": "1.0.0",
        "cache_size": cache.size()
    }

# Metrics
@app.get("/metrics")
def get_metrics():
    return {
        **METRICS,
        "cache_size": cache.size(),
        "cache_hit_rate": round(
            METRICS["cache_hits"] / max(METRICS["total_requests"], 1) * 100, 2
        )
    }

# Error handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    METRICS["errors"] += 1
    log_error(f"Unhandled exception: {exc}")
    return {
        "error": "Internal server error",
        "detail": str(exc),
        "path": str(request.url)
    }

# Register Module 1 routes
app.include_router(module1_router)


# Run locally
if __name__ == "__main__":
    import uvicorn
    log_info("Starting AccessAble backend...")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)