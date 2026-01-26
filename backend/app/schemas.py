"""
Pydantic Schemas 
"""

from typing import Optional
from pydantic import BaseModel, HttpUrl, validator
from app.logger import log_warning


class ImageRequest(BaseModel):
    image_url: HttpUrl
    page_url: Optional[HttpUrl] = None
    
    @validator('image_url')
    def validate_image_url(cls, v):
        url_str = str(v)
        
        blocked_schemes = ['javascript:', 'data:', 'file:', 'ftp:']
        if any(url_str.lower().startswith(scheme) for scheme in blocked_schemes):
            raise ValueError(f"Blocked URL scheme. Only HTTP(S) allowed.")
        
        valid_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']
        if not any(url_str.lower().endswith(ext) for ext in valid_extensions):
            log_warning(f"URL has no standard image extension: {url_str}")
        
        return v
    
    class Config:
        schema_extra = {
            "example": {
                "image_url": "https://example.com/image.jpg",
                "page_url": "https://example.com/article"
            }
        }