"""
Module 2: Caption Extraction Service (FIXED FOR v1.2.4+)
Uses NEW youtube-transcript-api API (v1.2.0+) + yt-dlp fallback + Redis caching

BREAKING CHANGE FIX:
- OLD API (v0.6.x): YouTubeTranscriptApi.list_transcripts(video_id)
- NEW API (v1.2.x): YouTubeTranscriptApi().list(video_id)
"""
import subprocess
import json
import hashlib
from typing import Dict, List, Optional
from urllib.parse import urlparse, parse_qs
from starlette.concurrency import run_in_threadpool

# YouTube transcript library (NEW API for v1.2.0+)
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable
)

# Redis for caching
import redis.asyncio as aioredis
from redis.exceptions import RedisError

from app.logger import log_info, log_error, log_success, log_warning
from app.config import REDIS_URL


class CaptionExtractor:
    """
    Production caption extraction with smart platform dispatch and Redis caching
    
    ARCHITECTURE:
    - Layer 1: YouTube → youtube-transcript-api v1.2.4 (NEW API)
    - Layer 2: Others → yt-dlp subprocess (Vimeo, Dailymotion, Twitch, 1000+ sites)
    - Layer 3: Redis caching (30-day TTL for performance)
    
    BREAKING CHANGE (v1.2.0+):
    - OLD: YouTubeTranscriptApi.list_transcripts(video_id)  # REMOVED
    - NEW: YouTubeTranscriptApi().list(video_id)             # CURRENT
    """
    
    # Platform detection mapping
    SUPPORTED_PLATFORMS = {
        'youtube.com': 'YouTube',
        'youtu.be': 'YouTube',
        'vimeo.com': 'Vimeo',
        'dailymotion.com': 'Dailymotion',
        'twitch.tv': 'Twitch',
    }
    
    # Configuration
    ALLOWED_FORMATS = {'vtt'}
    MAX_TRACKS = 10
    CACHE_TTL = 2592000  # 30 days
    
    # Language priority
    PRIORITY_LANGUAGES = {
        'en': 1, 'hi': 2, 'ur': 2, 'es': 3, 'fr': 3, 'de': 3,
        'ar': 3, 'pt': 3, 'zh': 3, 'ja': 4, 'ko': 4, 'ru': 4
    }
    
    # Redis client (singleton)
    _redis_client: Optional[aioredis.Redis] = None
    
    @classmethod
    async def _get_redis_client(cls) -> Optional[aioredis.Redis]:
        """Get or create Redis client (singleton pattern)"""
        if cls._redis_client is None:
            try:
                cls._redis_client = await aioredis.from_url(
                    REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=5
                )
                await cls._redis_client.ping()
                log_info("Redis connection established for caption caching")
            except (RedisError, Exception) as e:
                log_warning(f"Redis connection failed: {e}. Caching disabled.")
                cls._redis_client = None
        
        return cls._redis_client
    
    @staticmethod
    def _generate_cache_key(video_url: str) -> str:
        """Generate cache key from video URL"""
        url_hash = hashlib.sha256(video_url.encode()).hexdigest()
        return f"caption:v3:{url_hash}"  # v3 = new API
    
    @classmethod
    async def _get_from_cache(cls, cache_key: str) -> Optional[Dict]:
        """Get caption data from Redis cache"""
        try:
            redis_client = await cls._get_redis_client()
            if redis_client is None:
                return None
            
            cached_json = await redis_client.get(cache_key)
            if cached_json:
                log_success(f"⚡ Cache HIT for key: {cache_key[:16]}...")
                return json.loads(cached_json)
            
            log_info(f"🔄 Cache MISS for key: {cache_key[:16]}...")
            return None
            
        except Exception as e:
            log_warning(f"Cache get failed: {e}")
            return None
    
    @classmethod
    async def _set_to_cache(cls, cache_key: str, data: Dict, ttl: int = CACHE_TTL) -> None:
        """Store caption data in Redis cache"""
        try:
            redis_client = await cls._get_redis_client()
            if redis_client is None:
                return
            
            await redis_client.setex(cache_key, ttl, json.dumps(data))
            log_info(f"💾 Cached result with {ttl}s TTL")
            
        except Exception as e:
            log_warning(f"Cache set failed: {e}")
    
    @staticmethod
    def detect_platform(video_url: str) -> str:
        """Detect video platform from URL"""
        try:
            parsed = urlparse(video_url)
            domain = parsed.netloc.lower().replace('www.', '')
            
            for platform_domain, platform_name in CaptionExtractor.SUPPORTED_PLATFORMS.items():
                if platform_domain in domain:
                    return platform_name
            
            return "Unknown"
        except Exception as e:
            log_error(f"Error detecting platform: {str(e)}")
            return "Unknown"
    
    @staticmethod
    def _extract_youtube_video_id(video_url: str) -> Optional[str]:
        """Extract video ID from YouTube URL"""
        try:
            parsed = urlparse(video_url)
            
            # youtube.com/watch?v=VIDEO_ID
            if parsed.hostname in ['www.youtube.com', 'youtube.com']:
                if parsed.path == '/watch':
                    query_params = parse_qs(parsed.query)
                    return query_params.get('v', [None])[0]
                elif parsed.path.startswith('/embed/'):
                    return parsed.path.split('/embed/')[-1].split('?')[0]
                elif parsed.path.startswith('/v/'):
                    return parsed.path.split('/v/')[-1].split('?')[0]
            
            # youtu.be/VIDEO_ID
            elif parsed.hostname == 'youtu.be':
                return parsed.path.lstrip('/').split('?')[0]
            
            return None
            
        except Exception as e:
            log_error(f"Error extracting YouTube video ID: {str(e)}")
            return None
    
    @staticmethod
    def _youtube_extraction_sync_NEW_API(video_url: str) -> Dict:
        """
        SYNCHRONOUS YouTube extraction using NEW youtube-transcript-api v1.2.0+ API
        
        ⚠️ BREAKING CHANGE FIX:
        - OLD API (v0.6.x): YouTubeTranscriptApi.list_transcripts(video_id)
        - NEW API (v1.2.x): YouTubeTranscriptApi().list(video_id)
        
        This is SYNCHRONOUS - call via run_in_threadpool from async functions
        """
        log_info(f"Using youtube-transcript-api NEW API (v1.2.x) for: {video_url}")
        
        # Step 1: Extract video ID
        video_id = CaptionExtractor._extract_youtube_video_id(video_url)
        if not video_id:
            raise RuntimeError("Invalid YouTube URL: Could not extract video ID")
        
        try:
            # Step 2: Create API instance and get transcript list
            # ⚠️ NEW API: Must instantiate YouTubeTranscriptApi()
            api = YouTubeTranscriptApi()
            transcript_list = api.list(video_id)  # NEW METHOD NAME
            
            # Step 3: Extract tracks
            tracks = []
            seen_languages = set()
            
            # Iterate through available transcripts
            for transcript in transcript_list:
                if transcript.language_code in seen_languages:
                    continue
                
                seen_languages.add(transcript.language_code)
                
                # Build VTT download URL
                vtt_url = f"https://www.youtube.com/api/timedtext?v={video_id}&lang={transcript.language_code}&fmt=vtt"
                
                track = {
                    'language': transcript.language_code,
                    'language_name': transcript.language,
                    'format': 'vtt',
                    'url': vtt_url,
                    'auto_generated': transcript.is_generated
                }
                
                tracks.append(track)
                
                log_info(
                    f"Found caption: {transcript.language} ({transcript.language_code}) "
                    f"[{'Auto' if transcript.is_generated else 'Manual'}]"
                )
            
            if not tracks:
                log_warning(f"No caption tracks found for video {video_id}")
            
            return {
                'video_title': f"YouTube Video {video_id}",
                'video_duration': None,
                'platform': 'YouTube',
                'has_captions': len(tracks) > 0,
                'caption_tracks': tracks,
                'original_language': tracks[0]['language'] if tracks else None
            }
            
        except TranscriptsDisabled:
            raise RuntimeError("Captions are disabled for this video")
        except NoTranscriptFound:
            return {
                'video_title': f"YouTube Video {video_id}",
                'video_duration': None,
                'platform': 'YouTube',
                'has_captions': False,
                'caption_tracks': [],
                'original_language': None
            }
        except VideoUnavailable:
            raise RuntimeError("Video is unavailable or private")
        except Exception as e:
            raise RuntimeError(f"YouTube transcript extraction failed: {str(e)}")
    
    @staticmethod
    def _ytdlp_fallback_extraction_sync(video_url: str) -> Dict:
        """SYNCHRONOUS yt-dlp extraction for non-YouTube platforms"""
        log_info(f"Using yt-dlp fallback for: {video_url}")
        
        cmd = [
            'yt-dlp',
            '--skip-download',
            '--dump-json',
            '--no-warnings',
            video_url
        ]
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                error_msg = result.stderr or "Unknown error"
                raise RuntimeError(f"yt-dlp failed: {error_msg}")
            
            video_info = json.loads(result.stdout)
            tracks = CaptionExtractor._parse_ytdlp_tracks(video_info)
            
            return {
                'video_title': video_info.get('title'),
                'video_duration': video_info.get('duration'),
                'platform': CaptionExtractor.detect_platform(video_url),
                'has_captions': len(tracks) > 0,
                'caption_tracks': tracks,
                'original_language': video_info.get('language')
            }
            
        except subprocess.TimeoutExpired:
            raise RuntimeError("Video metadata extraction timed out after 30s")
        except FileNotFoundError:
            raise RuntimeError("yt-dlp not installed. Install: pip install yt-dlp")
        except json.JSONDecodeError:
            raise RuntimeError("Invalid JSON response from yt-dlp")
    
    @staticmethod
    async def extract_captions(video_url: str, max_tracks: int = MAX_TRACKS) -> Dict:
        """
        MAIN ENTRY POINT: Extract captions with smart dispatch and caching
        
        Uses NEW youtube-transcript-api v1.2.0+ API
        """
        log_info(f"Extracting captions from: {video_url}")
        
        # Step 1: Check cache
        cache_key = CaptionExtractor._generate_cache_key(video_url)
        cached_result = await CaptionExtractor._get_from_cache(cache_key)
        
        if cached_result:
            cached_result['cached'] = True
            return cached_result
        
        # Step 2: Detect platform
        platform = CaptionExtractor.detect_platform(video_url)
        
        try:
            # Step 3: Dispatch to appropriate extractor
            if platform == 'YouTube':
                # Use NEW youtube-transcript-api v1.2.x API
                video_info = await run_in_threadpool(
                    CaptionExtractor._youtube_extraction_sync_NEW_API,
                    video_url
                )
            else:
                # Use yt-dlp fallback
                video_info = await run_in_threadpool(
                    CaptionExtractor._ytdlp_fallback_extraction_sync,
                    video_url
                )
            
            # Step 4: Optimize tracks
            if video_info['caption_tracks']:
                optimized_tracks = CaptionExtractor._optimize_tracks(
                    video_info['caption_tracks'],
                    video_info.get('original_language'),
                    max_tracks
                )
                video_info['caption_tracks'] = optimized_tracks
                video_info['has_captions'] = len(optimized_tracks) > 0
            
            # Step 5: Add metadata
            video_info['total_tracks_found'] = len(video_info['caption_tracks'])
            video_info['max_tracks_limit'] = max_tracks
            video_info['cached'] = False
            video_info['source'] = 'Caption_Metadata'
            video_info['video_url'] = video_url
            
            # Step 6: Cache result
            await CaptionExtractor._set_to_cache(cache_key, video_info)
            
            log_success(
                f"Extracted {len(video_info['caption_tracks'])} caption tracks "
                f"from '{video_info.get('video_title', 'Unknown')}' ({platform})"
            )
            
            return video_info
            
        except RuntimeError:
            raise
        except Exception as e:
            log_error(f"Unexpected error: {str(e)}")
            raise RuntimeError(f"Caption extraction failed: {str(e)}")
    
    @staticmethod
    def _parse_ytdlp_tracks(video_info: Dict) -> List[Dict]:
        """Parse caption tracks from yt-dlp response"""
        tracks_map: Dict[str, Dict] = {}
        
        # Extract manual subtitles
        manual_subs = video_info.get('subtitles', {})
        for lang_code, formats in manual_subs.items():
            CaptionExtractor._process_ytdlp_language(
                lang_code, formats, tracks_map, auto_generated=False
            )
        
        # Extract auto-generated subtitles
        auto_subs = video_info.get('automatic_captions', {})
        for lang_code, formats in auto_subs.items():
            if lang_code not in tracks_map:
                CaptionExtractor._process_ytdlp_language(
                    lang_code, formats, tracks_map, auto_generated=True
                )
        
        return list(tracks_map.values())
    
    @staticmethod
    def _process_ytdlp_language(
        lang_code: str,
        formats: List[Dict],
        tracks_map: Dict[str, Dict],
        auto_generated: bool
    ) -> None:
        """Process a single language from yt-dlp response"""
        allowed_formats = [
            fmt for fmt in formats
            if fmt.get('ext') == 'vtt'
        ]
        
        if not allowed_formats:
            return
        
        best_format = allowed_formats[0]
        
        LANGUAGE_NAMES = {
            'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
            'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian', 'ja': 'Japanese',
            'ko': 'Korean', 'zh': 'Chinese', 'ar': 'Arabic', 'hi': 'Hindi',
            'ur': 'Urdu', 'bn': 'Bengali', 'ta': 'Tamil', 'te': 'Telugu',
        }
        
        language_name = LANGUAGE_NAMES.get(lang_code, lang_code.upper())
        
        track = {
            'language': lang_code,
            'language_name': language_name,
            'format': 'vtt',
            'url': best_format.get('url'),
            'auto_generated': auto_generated
        }
        
        if lang_code not in tracks_map or not tracks_map[lang_code]['auto_generated']:
            tracks_map[lang_code] = track
    
    @staticmethod
    def _optimize_tracks(
        tracks: List[Dict],
        original_language: Optional[str],
        max_tracks: int
    ) -> List[Dict]:
        """Optimize tracks: deduplicate, sort by priority, limit"""
        if not tracks:
            return []
        
        def get_priority_score(track: Dict) -> tuple:
            lang_code = track['language']
            is_auto = track['auto_generated']
            
            if original_language and lang_code == original_language:
                return (0, is_auto, lang_code)
            
            priority_level = CaptionExtractor.PRIORITY_LANGUAGES.get(lang_code, 5)
            
            return (priority_level, is_auto, lang_code)
        
        sorted_tracks = sorted(tracks, key=get_priority_score)
        limited_tracks = sorted_tracks[:max_tracks]
        
        if len(sorted_tracks) > max_tracks:
            log_info(f"Limited tracks from {len(sorted_tracks)} to {max_tracks}")
        
        return limited_tracks
    
    @classmethod
    async def close_redis(cls):
        """Close Redis connection (called during application shutdown)"""
        if cls._redis_client:
            try:
                await cls._redis_client.close()
                log_info("Redis connection closed")
            except Exception as e:
                log_error(f"Error closing Redis: {e}")