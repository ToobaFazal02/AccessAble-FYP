# AccessAble Backend - AI Accessibility API

AccessAble backend is a FastAPI service that supports the AccessAble Chrome extension with AI and metadata endpoints.

## Current Status 

- Module 1: Image analysis endpoint is active.
- Module 2: Caption extraction endpoint is active and used in hybrid mode.
- Module 3: Keyboard analytics endpoints are active.



Multi-module backend API providing comprehensive accessibility solutions:
- **Module 1**: AI-powered image analysis for automatic alt text generation
- **Module 2**: Caption services in transition (legacy extraction + assist APIs)
- **Module 3**: Keyboard accessibility analytics and tracking

## Architecture Alignment (Client-First + Hybrid Backend)

The project architecture is intentionally split:

- Extension-first runtime:
  - Detects media on page
  - Normalizes and syncs caption cues
  - Renders accessible overlay
  - Handles settings, cache, and SPA lifecycle
- Backend support runtime:
  - Provides stable API endpoints
  - Performs caption metadata extraction for supported video URLs
  - Handles image AI generation and keyboard analytics

For Module 2 Phase 1, backend API contracts remain unchanged to avoid breaking extension integrations.

## API Surface (No Breaking Changes in Phase 1)


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
│  │  │  - Primary caption flow moving to extension  │  │    │
│  │  │  - Backend used for optional assist services │  │    │
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
### Module 1

- `POST /api/v1/image/analyze`

### Module 2

- `POST /api/v1/captions/extract`
- `GET /api/v1/captions/health`
- `POST /api/v1/captions/assist/simplify`
- `POST /api/v1/captions/assist/translate`
- `POST /api/v1/captions/assist/summarize`

Expected response fields consumed by extension include:
- `video_url`
- `has_captions`
- `caption_tracks`
- `video_title`
- `video_duration`
- `platform`
- `source`
- `cached`
- `response_time_sec`

### Module 3

- `POST /api/v1/keyboard/track-fixes`
- `GET /api/v1/keyboard/analytics`
- `GET /api/v1/keyboard/health`

### System

- `GET /`
- `GET /metrics`
- `GET /docs`

## Project Structure

```text
backend/
  app/
    main.py
    config.py
    cache.py
    metrics.py
    module1_image/
      image_routes.py
      image_service.py
      gemini_client.py
    module2_audio/
      caption_routes.py
      caption_extractor.py
      caption_schemas.py
    module3_keyboard/
      keyboard_routes.py
      keyboard_schemas.py
  prompts/
  requirements.txt
```

## WCAG Compliance

### Target Level

- System target: WCAG 2.2 AA for user-facing extension behavior (captions overlay and keyboard control).

### Checklist

- Captions Overlay Support (Backend responsibilities)
  - Return stable caption metadata schema to support language fallback.
  - Enforce request validation for video URLs.
  - Maintain bounded retries/timeouts so extension can fail gracefully.
  - Avoid introducing payload fields that require unsafe HTML rendering.

- Keyboard Control Support (Backend responsibilities)
  - Keep telemetry endpoints optional and non-blocking for core keyboard UX.
  - Accept validated payloads only.
  - Preserve endpoint compatibility so extension keyboard controls are not coupled to telemetry availability.

### Acceptance Criteria

- Captions Overlay
  - `POST /api/v1/captions/extract` preserves current response contract used by extension.
  - On extraction failure, API returns structured error payloads for graceful client fallback.
  - Health endpoint remains available for diagnostics.

- Keyboard Control
  - Extension keyboard controls continue to function even if keyboard analytics endpoint is degraded.
  - Backend responses remain contract-consistent (`ok/data/error` envelope at integration boundary).


## Module 2 Transition Status (Important)

Module 2 is intentionally moving from a backend-first extraction model to a **client-first + hybrid backend assist** model:

- **Core caption retrieval/rendering** should execute in the Chrome extension (user context).
- **Backend role** is being narrowed to optional assist APIs (simplify/translate/summarize), caching, and operational telemetry (opt-in).
- Legacy endpoint `POST /api/v1/captions/extract` remains available during migration but should not be treated as the long-term primary path for YouTube captions.

If users see “captions unavailable”, validate adapter fallback, track availability, and frontend lifecycle behavior before labeling backend as failed.

---

## Quick Start

```bash
cd backend
python -m venv venv
# Windows
./venv/Scripts/activate
# macOS/Linux
# source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Environment

Required:
- `GEMINI_API_KEY`

Optional:
- `REDIS_URL`

## Deployment (Render)

Build:
```bash
pip install -r requirements.txt
```

Start:
```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

## License

MIT
