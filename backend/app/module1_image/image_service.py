"""
Image Service 
"""

from io import BytesIO
from PIL import Image
import httpx

from app.config import MAX_IMAGE_SIZE_BYTES, DOWNLOAD_TIMEOUT_SEC
from app.logger import log_info, log_success, log_warning


async def download_image_from_url(url: str) -> Image.Image:
    
    async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT_SEC) as client:
        # Step 1: HEAD request
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
        
        # Step 2: Download
        log_info(f"Downloading image from: {url[:80]}...")
        
        headers = {"User-Agent": "Mozilla/5.0 (AccessAble Bot/1.0)"}
        
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