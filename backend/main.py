import os
import time
import requests
import hashlib
import logging
from datetime import datetime
from io import BytesIO
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
import uvicorn

# =====================================================
# 0. PROFESSIONAL LOGGING SETUP
# =====================================================
# Terminal output ko rangeen aur clear bananay k liye
class LogColor:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'

def log_info(message):
    print(f"{LogColor.BLUE}[{datetime.now().strftime('%H:%M:%S')} INFO]{LogColor.ENDC} {message}")

def log_success(message):
    print(f"{LogColor.GREEN}[{datetime.now().strftime('%H:%M:%S')} SUCCESS]{LogColor.ENDC} {message}")

def log_error(message):
    print(f"{LogColor.FAIL}[{datetime.now().strftime('%H:%M:%S')} ERROR]{LogColor.ENDC} {message}")

# =====================================================
# 1. ENV & PATH CONFIG (BULLETPROOF)
# =====================================================
# Is file (main.py) ka folder dhoondo
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Paths set karo
ENV_PATH = os.path.join(BASE_DIR, ".env")
PROMPT_PATH = os.path.join(BASE_DIR, "prompt", "image-alt-text.md")

log_info(f"Loading environment from: {ENV_PATH}")
load_dotenv(ENV_PATH)

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    log_error("GEMINI_API_KEY not found in .env file")
    raise RuntimeError("API Key Missing")

client = genai.Client(api_key=API_KEY)
MODEL_NAME = "gemini-flash-latest"

# =====================================================
# 2. FASTAPI APP SETUP
# =====================================================
app = FastAPI(
    title="AccessAble – AI Accessibility Backend",
    version="1.0",
    description="Module 1: AI-based Image Alt Text Generation"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================
# 3. SIMPLE IN-MEMORY CACHE
# =====================================================
ALT_TEXT_CACHE = {}

def hash_image_url(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()

# =====================================================
# 4. REQUEST SCHEMA
# =====================================================
class ImageRequest(BaseModel):
    image_url: str
    page_url: str | None = None

# =====================================================
# 5. HEALTH CHECK
# =====================================================
@app.get("/")
def health_check():
    return {"status": "active", "model": MODEL_NAME}

# =====================================================
# 6. IMAGE DOWNLOAD
# =====================================================
def download_image_from_url(url: str) -> Image.Image:
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        log_info(f"Downloading image from URL...")
        response = requests.get(url, headers=headers, timeout=8, stream=True)
        response.raise_for_status()

        content_length = int(response.headers.get("Content-Length", 0))
        if content_length > 5_000_000:
            raise ValueError("Image exceeds 5MB size limit")

        image = Image.open(BytesIO(response.content)).convert("RGB")
        log_success("Image downloaded successfully.")
        return image

    except Exception as e:
        log_error(f"Image download failed: {e}")
        return None

# =====================================================
# 7. CONFIDENCE ESTIMATION
# =====================================================
def estimate_confidence(text: str) -> float:
    score = 1.0
    if len(text) < 15: score -= 0.4
    vague_words = ["maybe", "possibly", "unclear", "unknown"]
    if any(word in text.lower() for word in vague_words): score -= 0.3
    if len(text.split()) < 4: score -= 0.3
    return round(max(score, 0.1), 2)

# =====================================================
# 8. CORE ENDPOINT
# =====================================================
@app.post("/analyze-image")
async def analyze_image(request: ImageRequest):
    image_url = request.image_url.strip()
    img_hash = hash_image_url(image_url)

    log_info(f"Processing Request for Hash: {img_hash[:8]}...")

    # ---- CACHE HIT ----
    if img_hash in ALT_TEXT_CACHE:
        log_success(f"⚡ CACHE HIT! Returning saved result.")
        return {**ALT_TEXT_CACHE[img_hash], "cached": True}

    # ---- CACHE MISS ----
    log_info("🔸 Cache Miss. Sending to AI...")
    
    image = download_image_from_url(image_url)
    if not image:
        raise HTTPException(status_code=400, detail="Unable to download image")

    # Load prompt safely
    if not os.path.exists(PROMPT_PATH):
        log_error(f"Prompt file missing at: {PROMPT_PATH}")
        raise HTTPException(status_code=500, detail="Prompt configuration missing")
    
    prompt = open(PROMPT_PATH, "r", encoding="utf-8").read()

    try:
        start_time = time.perf_counter()

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[prompt, image]
        )

        end_time = time.perf_counter()
        latency = round(end_time - start_time, 2)
        description = response.text.strip()
        confidence = estimate_confidence(description)

        if confidence < 0.4:
            description = "Unable to generate a reliable description."

        result = {
            "description": description,
            "confidence": confidence,
            "response_time_sec": latency,
            "source": "AI_Generated",
            "cached": False
        }

        # Store in Cache
        ALT_TEXT_CACHE[img_hash] = result
        log_success(f"AI Response Received in {latency}s | Conf: {confidence}")
        
        return result

    except Exception as e:
        log_error(f"AI Processing Error: {e}")
        raise HTTPException(status_code=500, detail="AI processing failed")

# =====================================================
# 9. LOCAL RUN
# =====================================================
if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)