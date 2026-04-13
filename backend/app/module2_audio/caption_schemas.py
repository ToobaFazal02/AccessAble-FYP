"""
Module 2: Audio Captioning - Request/Response Schemas (Pydantic V2 Compliant)
"""
from pydantic import BaseModel, HttpUrl, Field, ConfigDict
from typing import Optional, List, Any


class CaptionExtractionRequest(BaseModel):
    """Request schema for caption extraction endpoint"""
    
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{
                "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "page_url": "https://example.com/article"
            }]
        }
    )
    
    video_url: HttpUrl = Field(
        ...,
        description="URL of the video to extract captions from"
    )
    page_url: Optional[HttpUrl] = Field(
        None,
        description="URL of the page containing the video (for context)"
    )


class CaptionTrack(BaseModel):
    """Schema for individual caption track"""

    model_config = ConfigDict(extra="allow")

    language: str = Field(..., description="Language code (e.g., 'en', 'es')")
    language_name: str = Field(..., description="Human-readable language name")
    format: str = Field(..., description="Caption format (vtt, srt, srv1, etc.)")
    url: Optional[str] = Field(None, description="Direct URL to caption file")
    auto_generated: bool = Field(False, description="Whether captions are auto-generated")
    cues: List[Any] = Field(default_factory=list, description="Inline cue data {start, end, text}")


class CaptionExtractionResponse(BaseModel):
    """Response schema for caption extraction"""
    
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{
                "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "has_captions": True,
                "caption_tracks": [
                    {
                        "language": "en",
                        "language_name": "English",
                        "format": "vtt",
                        "url": "https://example.com/captions.vtt",
                        "auto_generated": False
                    }
                ],
                "video_title": "Example Video",
                "video_duration": 213,
                "platform": "YouTube",
                "cached": False,
                "response_time_sec": 2.14,
                "source": "Caption_Metadata"
            }]
        }
    )
    
    video_url: str = Field(..., description="Original video URL")
    has_captions: bool = Field(..., description="Whether captions are available")
    caption_tracks: List[CaptionTrack] = Field(
        default_factory=list,
        description="List of available caption tracks"
    )
    video_title: Optional[str] = Field(None, description="Video title")
    video_duration: Optional[int] = Field(None, description="Video duration in seconds")
    platform: str = Field(..., description="Video platform (youtube, vimeo, etc.)")
    cached: bool = Field(False, description="Whether result was from cache")
    response_time_sec: float = Field(..., description="Response time in seconds")
    source: str = Field(default="Caption_Metadata", description="Data source")


class ErrorResponse(BaseModel):
    """Standard error response schema"""
    
    error: str = Field(..., description="Error message")
    detail: Optional[str] = Field(None, description="Detailed error information")
    video_url: Optional[str] = Field(None, description="Video URL that caused the error")