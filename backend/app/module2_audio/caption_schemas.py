"""
Module 2: Audio Captioning - Request/Response Schemas (Pydantic V2 Compliant)
"""
from pydantic import BaseModel, HttpUrl, Field, ConfigDict, field_validator
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
    preferred_languages: Optional[List[str]] = Field(
        None,
        description="Preferred caption languages (e.g. ['en', 'ur']). Backend will attempt translations."
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


class CaptionCue(BaseModel):
    """Schema for a timed caption cue."""

    start: float = Field(..., description="Cue start time in seconds")
    end: float = Field(..., description="Cue end time in seconds")
    text: str = Field(..., description="Cue text")

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise ValueError("Cue text cannot be empty")
        return text


class CaptionAssistRequest(BaseModel):
    """Request schema for cue transformation endpoints."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{
                "mode": "simplify",
                "cues": [
                    {"start": 0.0, "end": 2.5, "text": "Welcome back to our accessibility tutorial."},
                    {"start": 2.5, "end": 5.0, "text": "Today we are covering keyboard navigation."},
                ],
                "source_lang": "en",
                "target_lang": "",
                "page_url": "https://example.com/lesson",
                "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "telemetry_enabled": False,
            }]
        }
    )

    mode: str = Field(..., description="Assist mode: simplify, translate, or summarize")
    cues: List[CaptionCue] = Field(..., min_length=1, description="Caption cues to transform")
    source_lang: str = Field(default="und", description="Original track language code")
    target_lang: str = Field(default="", description="Requested output language code")
    page_url: Optional[str] = Field(None, description="Page URL for context")
    video_url: Optional[str] = Field(None, description="Video URL for context")
    telemetry_enabled: bool = Field(False, description="Whether analytics may be collected")

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, value: str) -> str:
        normalized = str(value or "").strip().lower()
        if normalized not in {"simplify", "translate", "summarize"}:
            raise ValueError("Mode must be one of: simplify, translate, summarize")
        return normalized


class CaptionAssistResponse(BaseModel):
    """Response schema for cue transformation endpoints."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{
                "mode": "simplify",
                "lang": "en",
                "cues": [
                    {"start": 0.0, "end": 2.5, "text": "Welcome to the accessibility tutorial."},
                    {"start": 2.5, "end": 5.0, "text": "Today we cover keyboard navigation."},
                ],
                "provider": "gemini-flash-latest",
                "cached": False,
            }]
        }
    )

    mode: str = Field(..., description="Applied assist mode")
    lang: str = Field(..., description="Language code for returned cues")
    cues: List[CaptionCue] = Field(default_factory=list, description="Transformed cues")
    provider: str = Field(..., description="Processing provider or model")
    cached: bool = Field(False, description="Whether result came from cache")


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
