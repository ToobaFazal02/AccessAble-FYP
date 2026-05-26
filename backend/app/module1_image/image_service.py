"""
Image Service 
"""

import re
from io import BytesIO
from PIL import Image
import httpx

from typing import Optional

from app.config import MAX_IMAGE_SIZE_BYTES, DOWNLOAD_TIMEOUT_SEC
from app.logger import log_info, log_success, log_warning

# Vision models do not need full-resolution hero images; downscaling cuts tokens/latency.
MAX_VISION_SIDE_PX = 1280

# Wikimedia blocks generic library UAs (python-httpx, fake browsers from datacenters).
# Policy: https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy
ACCESSABLE_USER_AGENT = (
    "AccessAble-FYP/1.1.0 (+https://github.com/AccessAble-FYP; "
    "accessibility-alt-text; contact=issues@github.com) httpx"
)

# Thumb paths like .../560px-File.jpg — only certain widths are allowed (see w.wiki/GHai).
_WIKIMEDIA_THUMB_RE = re.compile(
    r"^https?://upload\.wikimedia\.org/(wikipedia/[^/]+)/thumb/(.+?)/(\d+)px-([^/]+)$",
    re.IGNORECASE,
)
# Matches our vision downscale cap; reliably allowed on upload.wikimedia.org.
_WIKIMEDIA_FETCH_WIDTH_PX = 1280

_DOWNLOAD_HEADERS = {
    "User-Agent": ACCESSABLE_USER_AGENT,
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
}


def resolve_download_url(url: str) -> str:
    """
    Normalize URLs that CDNs reject when fetched server-side.
    Browsers use srcset sizes (220px, 560px, etc.) that Wikimedia blocks for bots.
    Rewriting to an allowed thumb width avoids 400/403 without pulling 10MB+ originals.
    """
    normalized = url.strip()
    if normalized.startswith("//"):
        normalized = f"https:{normalized}"

    match = _WIKIMEDIA_THUMB_RE.match(normalized)
    if match:
        wiki_path, file_path, width_str, filename = match.groups()
        width = int(width_str)
        if width == _WIKIMEDIA_FETCH_WIDTH_PX:
            return normalized
        resolved = (
            f"https://upload.wikimedia.org/{wiki_path}/thumb/{file_path}/"
            f"{_WIKIMEDIA_FETCH_WIDTH_PX}px-{filename}"
        )
        log_info(
            f"Wikimedia thumb {width}px -> {_WIKIMEDIA_FETCH_WIDTH_PX}px: {resolved[:80]}..."
        )
        return resolved

    return normalized


def _is_wikimedia_host(url: str) -> bool:
    return "upload.wikimedia.org" in url.lower()


def _download_headers(url: str, page_referer: Optional[str]) -> dict:
    headers = dict(_DOWNLOAD_HEADERS)
    referer = page_referer if page_referer and page_referer.startswith(("http://", "https://")) else None
    if not referer and _is_wikimedia_host(url):
        referer = "https://commons.wikimedia.org/"
    if referer:
        headers["Referer"] = referer
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
    download_url = resolve_download_url(url)
    headers = _download_headers(download_url, page_referer)

    async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT_SEC) as client:
        # Wikimedia often rejects HEAD on thumb paths; skip pre-check for their CDN.
        if not _is_wikimedia_host(download_url):
            try:
                head_response = await client.head(download_url, headers=headers, follow_redirects=True)
                content_length = int(head_response.headers.get("Content-Length", 0))

                if content_length > MAX_IMAGE_SIZE_BYTES:
                    raise ValueError(
                        f"Image exceeds {MAX_IMAGE_SIZE_BYTES / 1_000_000}MB limit "
                        f"(actual: {content_length / 1_000_000:.2f}MB)"
                    )
            except (httpx.HTTPError, ValueError) as e:
                log_warning(f"HEAD request failed, proceeding with GET: {e}")

        log_info(f"Downloading image from: {download_url[:80]}...")

        async with client.stream("GET", download_url, headers=headers, follow_redirects=True) as response:
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

            image_data = b"".join(chunks)

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
