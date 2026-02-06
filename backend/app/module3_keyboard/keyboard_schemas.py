"""
Module 3: Keyboard & Focus Accessibility - Pydantic Schemas
Data validation models for tracking keyboard navigation fixes
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, HttpUrl, field_validator, ConfigDict
from app.logger import log_warning


class KeyboardFixReport(BaseModel):
    """
    Schema for tracking accessibility fixes applied by browser extension
    
    Attributes:
        url: Full URL of the webpage where fixes were applied
        domain: Domain name extracted from URL
        fixes_applied: List of fix types that were applied
        user_agent: Browser/extension identifier
        timestamp: When fixes were applied in UTC
    """
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "url": "https://reddit.com/r/programming",
                "domain": "reddit.com",
                "fixes_applied": ["skip_link", "focus_indicators", "keyboard_shortcuts"],
                "user_agent": "AccessAble Extension v3.0.0"
            }
        }
    )
    
    url: HttpUrl
    domain: str
    fixes_applied: List[str]
    user_agent: Optional[str] = "AccessAble Extension"
    timestamp: Optional[datetime] = None
    
    @field_validator('domain')
    @classmethod
    def validate_domain(cls, v):
        """Validate domain name format"""
        if not v or len(v) < 3:
            raise ValueError("Domain must be at least 3 characters")
        
        if len(v) > 255:
            raise ValueError("Domain exceeds maximum length")
        
        if v.startswith('http://') or v.startswith('https://'):
            raise ValueError("Domain should not include protocol")
        
        if '/' in v:
            raise ValueError("Domain should not include path")
        
        return v.lower()
    
    @field_validator('fixes_applied')
    @classmethod
    def validate_fix_types(cls, fixes):
        """Validate fix types are from allowed set"""
        if not fixes or len(fixes) == 0:
            raise ValueError("At least one fix must be specified")
        
        allowed_fixes = {
            'skip_link',
            'focus_indicators',
            'keyboard_shortcuts',
            'focus_traps',
            'landmarks',
            'enlarge_targets',
            'voice_commands'
        }
        
        for fix in fixes:
            if fix not in allowed_fixes:
                log_warning(f"Unknown fix type: {fix}")
                raise ValueError(f"Invalid fix type '{fix}'")
        
        return fixes
    
    @field_validator('timestamp', mode='before')
    @classmethod
    def set_timestamp(cls, v):
        """Set current UTC timestamp if not provided"""
        return datetime.utcnow() if v is None else v