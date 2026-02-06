# AccessAble Backend - AI Accessibility API

![Status](https://img.shields.io/badge/Status-green)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)
![Redis](https://img.shields.io/badge/Redis-7.0-DC382D)
![License](https://img.shields.io/badge/License-MIT-blue)

**AI service for automated web accessibility enhancement.** Powers the AccessAble Chrome Extension.

---

## Overview

Multi-module backend API providing comprehensive accessibility solutions:
- **Module 1**: AI-powered image analysis for automatic alt text generation
- **Module 2**: Audio captioning and transcript extraction
- **Module 3**: Keyboard accessibility analytics and tracking

Built with FastAPI, Google Gemini Vision AI, and Redis caching for high-performance accessibility remediation at scale.

**Live API:** [https://accessable-fyp.onrender.com](https://accessable-fyp.onrender.com)

---

## Architecture

### Complete System Architecture (3 Modules)

```
┌─────────────────────────────────────────────────────────────┐
│                     USER'S BROWSER                          │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Chrome Extension (Frontend - Manifest V3)         │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │  MODULE 1: Image Analysis                    │  │    │
│  │  │  - Scans DOM for <img> tags                  │  │    │
│  │  │  - Detects missing alt=""                    │  │    │
│  │  │  - Sends images to backend                   │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │  MODULE 2: Audio Captioning                  │  │    │
│  │  │  - Detects video elements                    │  │    │
│  │  │  - Requests captions from backend            │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │  MODULE 3: Keyboard Accessibility            │  │    │
│  │  │  - Injects skip links                        │  │    │
│  │  │  - Enhances focus indicators                 │  │    │
│  │  │  - Fixes keyboard traps                      │  │    │
│  │  │  - Tracks fixes → sends to backend           │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS API Requests
                            ▼
┌─────────────────────────────────────────────────────────────┐
│          FASTAPI BACKEND (Render Cloud)                     │
│  ┌────────────────────────────────────────────────────┐    │
│  │  app/main.py - FastAPI App Entry Point            │    │
│  │                                                    │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │  MODULE 1: /api/v1/image/analyze            │  │    │
│  │  │  1. Validate image URL (Pydantic)            │  │    │
│  │  │  2. Check Redis cache                        │  │    │
│  │  │  3. Download image (httpx async)             │  │    │
│  │  │  4. Send to Gemini AI                        │  │    │
│  │  │  5. Cache result (7 days)                    │  │    │
│  │  │  6. Return alt text description              │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  │                                                    │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │  MODULE 2: /api/v1/captions/extract          │  │    │
│  │  │  1. Validate video URL                       │  │    │
│  │  │  2. Check Redis cache (30 days)              │  │    │
│  │  │  3. Extract captions (yt-dlp)                │  │    │
│  │  │  4. Return caption data                      │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  │                                                    │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │  MODULE 3: /api/v1/keyboard/*                │  │    │
│  │  │  /track-fixes:                               │  │    │
│  │  │  1. Receive fix reports from extension       │  │    │
│  │  │  2. Store in Redis (30 days)                 │  │    │
│  │  │  3. Aggregate statistics by domain           │  │    │
│  │  │  /analytics:                                 │  │    │
│  │  │  1. Return aggregated fix data               │  │    │
│  │  │  2. Provide insights for thesis research     │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────┘    │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Redis Cache (Persistent)                          │   │
│  │  Module 1: sha256(image_url) → alt text (7d TTL)   │   │
│  │  Module 2: sha256(video_url) → captions (30d TTL)  │   │
│  │  Module 3: keyboard_stats:domain → fixes (30d TTL) │   │
│  │  Fallback: In-Memory Dict (if Redis unavailable)  │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Google Gemini AI (External API)                   │   │
│  │  Model: gemini-flash-latest                       │   │
│  │  Used by: Module 1 (Image Analysis)                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI application entry point
│   ├── config.py            # Configuration management (all modules)
│   ├── logger.py            # File + console logging
│   ├── metrics.py           # Request analytics
│   ├── cache.py             # Redis client with graceful fallback
│   ├── schemas.py           # Shared Pydantic models
│   │
│   ├── module1_image/       # IMAGE ANALYSIS MODULE
│   │   ├── image_routes.py  # /api/v1/image/* endpoints
│   │   ├── image_service.py # Download & validation
│   │   └── gemini_client.py # Gemini AI integration
│   │
│   ├── module2_audio/       # AUDIO CAPTIONING MODULE
│   │   ├── caption_routes.py    # /api/v1/captions/* endpoints
│   │   ├── caption_extractor.py # yt-dlp caption extraction
│   │   └── caption_schemas.py   # Pydantic models
│   │
│   └── module3_keyboard/    # KEYBOARD ACCESSIBILITY MODULE
│       ├── keyboard_routes.py   # /api/v1/keyboard/* endpoints
│       └── keyboard_schemas.py  # Pydantic models
│
├── prompts/
│   └── image-alt-text.md    # Gemini system prompt
├── logs/                    # Daily log files (auto-generated)
├── .env                     # Environment variables (not in git)
├── .env.example             # Template for environment variables
└── requirements.txt
```

---

## Quick Start

### Prerequisites
- Python 3.11+
- Google Gemini API key
- Optional: Redis server (Backend will auto-fallback to RAM if Redis is missing)

### Installation

**1. Clone and navigate**
```bash
cd backend
```

**2. Virtual environment**
```bash
python -m venv venv
# Windows:
./venv/Scripts/activate
# Mac/Linux:
source venv/bin/activate
```

**3. Install dependencies**
```bash
pip install -r requirements.txt
```

**4. Configure environment**

Create a `.env` file based on `.env.example`:

```env
GEMINI_API_KEY=your_api_key_here
# Optional (Leave as is for local dev):
REDIS_URL=redis://localhost:6379/0
```

**5. Run server**
```bash
uvicorn app.main:app --reload
```

Server runs at `http://127.0.0.1:8000`

---

## API Reference

### Module 1: Image Analysis

**`POST /api/v1/image/analyze`**

**Request:**
```json
{
  "image_url": "https://example.com/photo.jpg",
  "page_url": "https://example.com/article"
}
```

**Response:**
```json
{
  "description": "A golden retriever sitting in autumn leaves",
  "confidence": 0.95,
  "response_time_sec": 1.82,
  "source": "AI_Generated",
  "model": "gemini-flash-latest",
  "cached": false
}
```

---

### Module 2: Audio Captioning

**`POST /api/v1/captions/extract`**

**Request:**
```json
{
  "video_url": "https://youtube.com/watch?v=abc123"
}
```

**Response:**
```json
{
  "captions": "Full transcript text here...",
  "language": "en",
  "cached": false,
  "source": "YouTube"
}
```

**`GET /api/v1/captions/health`** - Health check

---

### Module 3: Keyboard Accessibility

**`POST /api/v1/keyboard/track-fixes`**

**Request:**
```json
{
  "url": "https://reddit.com/r/programming",
  "domain": "reddit.com",
  "fixes_applied": ["skip_link", "focus_indicators", "keyboard_shortcuts"]
}
```

**Response:**
```json
{
  "status": "recorded",
  "domain": "reddit.com",
  "total_visits_this_domain": 42,
  "message": "Successfully recorded 3 fixes"
}
```

**`GET /api/v1/keyboard/analytics`** - Aggregated statistics

**`GET /api/v1/keyboard/health`** - Health check

---

### System Endpoints

**`GET /`** - Health check

**`GET /metrics`** - Usage statistics for all modules

**`GET /docs`** - Interactive Swagger Documentation

---

## Configuration

### Environment variables (`.env`):
- `GEMINI_API_KEY`: **Required** for AI generation (Module 1)
- `REDIS_URL`: (Optional) Connection string for Redis

### Constants (`app/config.py`):
- `MAX_IMAGE_SIZE_BYTES`: 5MB limit (Module 1)
- `CACHE_TTL_SECONDS`: 7 days (Module 1)
- `CACHE_TTL_CAPTIONS`: 30 days (Module 2)
- `CACHE_TTL_KEYBOARD`: 30 days (Module 3)
- `MAX_CONCURRENT_AI_CALLS`: 5 parallel requests (Module 1)

---

## Logging

**Dual logging system:** Console (Colored) + File (Structured)

**File Output:** `logs/accessable_2026-01-xx.log`

```
[2026-01-26 14:23:45] [INFO] Module 1: Image Analysis - Active
[2026-01-26 14:23:45] [INFO] Module 2: Audio Captioning - Active
[2026-01-26 14:23:45] [INFO] Module 3: Keyboard Accessibility - Active
[2026-01-26 14:23:46] [SUCCESS] Image downloaded: 800x600px, 145.2KB
[2026-01-26 14:23:48] [SUCCESS] AI response received in 1.85s
[2026-01-26 14:24:01] [SUCCESS] Tracked fixes for reddit.com: skip_link, focus_indicators
```

---

## Deployment (Render)

**Environment Variables:** Add `GEMINI_API_KEY` and `REDIS_URL` (Internal Render URL)

**Build Command:**
```bash
pip install -r requirements.txt
```

**Start Command:**
```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

---

## Module Status

- [x] **Module 1**: Image Analysis (AI Vision) 
- [x] **Module 2**: Audio Captioning (Caption Extraction) 
- [x] **Module 3**: Keyboard Accessibility (Navigation Fixes) 
- [ ] **Future**: Rate limiting (slowapi)
- [ ] **Future**: PostgreSQL analytics

---

## Team

**Tooba Fazil** - Backend Engineering & AI Integration  
**Fatima Abu Bakar** - Frontend Development & UX

---

**Questions?** faziltooba95@gmail.com | [API Docs](https://accessable-fyp.onrender.com/docs)