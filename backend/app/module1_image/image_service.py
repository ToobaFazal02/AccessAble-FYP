"""
Image Service 
"""

from io import BytesIO
from PIL import Image
import httpx

from typing import Optional

from app.config import MAX_IMAGE_SIZE_BYTES, DOWNLOAD_TIMEOUT_SEC
from app.logger import log_info, log_success, log_warning

# Vision models do not need full-resolution hero images; downscaling cuts tokens/latency.
MAX_VISION_SIDE_PX = 1280

# Many CDNs (e.g. Wikimedia) reject non-browser or bot-like agents; use a normal browser UA.
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
}


def _download_headers(page_referer: Optional[str]) -> dict:
    headers = dict(_BROWSER_HEADERS)
    if page_referer and page_referer.startswith(("http://", "https://")):
        headers["Referer"] = page_referer
    return headers


def downscale_for_vision(image: Image.Image, max_side: int = MAX_VISION_SIDE_PX) -> Image.Image:
    w, h = image.size
    if w <= 0 or h <= 0:
        return image
    if max(w, h) <= max_side:
        return image
    scale = max_side / float(max(w, h))
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    try:
        resample = Image.Resampling.LANCZOS
    except AttributeError:  # Pillow < 9.1
        resample = Image.LANCZOS
    resized = image.resize((nw, nh), resample)
    log_info(f"Downscaled for vision: {w}x{h} -> {nw}x{nh} (max {max_side}px side)")
    return resized


async def download_image_from_url(url: str, page_referer: Optional[str] = None) -> Image.Image:
    headers = _download_headers(page_referer)

    async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT_SEC) as client:
        # Step 1: HEAD request
        try:
            head_response = await client.head(url, headers=headers, follow_redirects=True)
            content_length = int(head_response.headers.get("Content-Length", 0))
            
            if content_length > MAX_IMAGE_SIZE_BYTES:
                raise ValueError(
                    f"Image exceeds {MAX_IMAGE_SIZE_BYTES / 1_000_000}MB limit "
                    f"(actual: {content_length / 1_000_000:.2f}MB)"
                )
        except (httpx.HTTPError, ValueError) as e:
            log_warning(f"HEAD request failed, proceeding with GET: {e}")
        
        # Step 2: Download
        log_info(f"Downloading image from: {url[:80]}...")
        
        async with client.stream("GET", url, headers=headers, follow_redirects=True) as response:
            response.raise_for_status()
            
            content_type = response.headers.get("Content-Type", "")
            if not content_type.startswith("image/"):
                log_warning(f"Non-image content-type: {content_type}")
            
            chunks = []
            total_size = 0
            
            async for chunk in response.aiter_bytes(chunk_size=8192):
                total_size += len(chunk)
                if total_size > MAX_IMAGE_SIZE_BYTES:
                    raise ValueError(f"Image exceeded {MAX_IMAGE_SIZE_BYTES / 1_000_000}MB during download")
                chunks.append(chunk)
            
            image_data = b''.join(chunks)
        
        # Step 3: Convert to PIL
        try:
            image = Image.open(BytesIO(image_data)).convert("RGB")
            log_success(f"Image downloaded: {image.size[0]}x{image.size[1]}px, {total_size / 1024:.1f}KB")
            return image
        except Exception as e:
            raise ValueError(f"Invalid image format: {e}")


def estimate_confidence(text: str) -> float:
    """Your exact function from main.py"""
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