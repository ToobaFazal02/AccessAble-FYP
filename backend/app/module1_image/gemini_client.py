"""
Gemini AI Client - Vision API integration for image analysis
"""

import time
import asyncio
from PIL import Image
from google import genai
from fastapi import HTTPException

from app.config import GEMINI_API_KEY, MODEL_NAME, PROMPT_PATH, MAX_CONCURRENT_AI_CALLS
from app.logger import log_success, log_error
from app.metrics import METRICS


# Initialize Gemini client 
client = genai.Client(api_key=GEMINI_API_KEY)

# Load prompt on startup
SYSTEM_PROMPT = ""
with open(PROMPT_PATH, "r", encoding="utf-8") as f:
    SYSTEM_PROMPT = f.read().strip()
    log_success(f"System prompt loaded ({len(SYSTEM_PROMPT)} chars)")

# Semaphore for limiting concurrent calls 
ai_semaphore = asyncio.Semaphore(MAX_CONCURRENT_AI_CALLS)


async def analyze_image_with_ai(image: Image.Image) -> tuple[str, float]:
    """Your exact function from main.py"""
    
    async with ai_semaphore:
        try:
            start_time = time.perf_counter()
            
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