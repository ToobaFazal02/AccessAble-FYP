"""
Pydantic Schemas (Pydantic V2 Compatible)
"""

from typing import Optional
from pydantic import BaseModel, HttpUrl, field_validator, ConfigDict
from app.logger import log_warning


class ImageRequest(BaseModel):
    """Request schema for image analysis endpoint"""
    
    # Pydantic V2: Use ConfigDict instead of inner Config class
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "image_url": "https://example.com/image.jpg",
                "page_url": "https://example.com/article"
            }
        }
    )
    
    image_url: HttpUrl
    page_url: Optional[HttpUrl] = None
    
    # Pydantic V2: Use @field_validator instead of @validator
    @field_validator('image_url')
    @classmethod
    def validate_image_url(cls, v):
        url_str = str(v)
        
        # Block dangerous URL schemes
        blocked_schemes = ['javascript:', 'data:', 'file:', 'ftp:']
        if any(url_str.lower().startswith(scheme) for scheme in blocked_schemes):
            raise ValueError(f"Blocked URL scheme. Only HTTP(S) allowed.")
        
        # Warn if no standard image extension
        valid_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']
        if not any(url_str.lower().endswith(ext) for ext in valid_extensions):
            log_warning(f"URL has no standard image extension: {url_str}")
        
        return v