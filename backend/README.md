# AccessAble Backend - AI Accessibility API

![Status](https://img.shields.io/badge/Status-Production-green)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)
![Redis](https://img.shields.io/badge/Redis-7.0-DC382D)
![License](https://img.shields.io/badge/License-MIT-blue)

**Production-grade AI service for automated web accessibility enhancement.** Powers the AccessAble Chrome Extension.

---

## Overview

Backend API providing AI-powered image analysis for automatic alt text generation. Built with FastAPI, Google Gemini Vision AI, and Redis caching for high-performance accessibility remediation at scale.

**Live API:** [https://accessable-fyp.onrender.com](https://accessable-fyp.onrender.com)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     USER'S BROWSER                          │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Chrome Extension (Frontend - Manifest V3)         │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │  1. content-image-analysis.js                │  │    │
│  │  │     - Scans DOM for <img> tags               │  │    │
│  │  │     - Detects missing alt=""                 │  │    │
│  │  │     - Adds red border to highlight           │  │    │
│  │  │     - Sends batch request to background      │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  │                         ▼                           │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │  2. background.js                            │  │    │
│  │  │     - Checks chrome.storage.local cache      │  │    │
│  │  │     - Batches API requests (max 3 concurrent)│  │    │
│  │  │     - Calls FastAPI backend                  │  │    │
│  │  │     - Caches responses locally               │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS POST /analyze-image
                            ▼
┌─────────────────────────────────────────────────────────────┐
│          FASTAPI BACKEND (Render Cloud)                     │
│  ┌────────────────────────────────────────────────────┐    │
│  │  app/main.py - FastAPI App Entry Point            │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │  Routes: /analyze-image                      │  │    │
│  │  │  1. Validate image URL (Pydantic)            │  │    │
│  │  │  2. Check Redis cache                        │  │    │
│  │  │  3. Download image (httpx async)             │  │    │
│  │  │  4. Send to Gemini AI                        │  │    │
│  │  │  5. Cache result in Redis                    │  │    │
│  │  │  6. Return description                       │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────┘    │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Redis Cache (Persistent)                          │   │
│  │  Key: sha256(image_url)                            │   │
│  │  Value: {description, confidence, latency}         │   │
│  │  TTL: 7 days                                       │   │
│  │  Fallback: In-Memory Dict (if Redis unavailable)  │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Google Gemini AI (External API)                   │   │
│  │  Model: gemini-flash-latest                       │   │
│  │  Input: Image + System Prompt                      │   │
│  │  Output: Natural language description              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Request Flow:**
1. Extension sends image URL
2. Check Cache (Redis in Prod / Memory in Dev)
3. Download & validate image (async)
4. Gemini AI generates description
5. Cache result (7-day TTL)
6. Return structured JSON response

---

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI application entry point
│   ├── config.py            # Configuration management
│   ├── logger.py            # File + console logging
│   ├── metrics.py           # Request analytics
│   ├── cache.py             # Redis client with graceful fallback
│   ├── schemas.py           # Pydantic models
│   └── module1_image/
│       ├── routes.py        # /analyze-image endpoint
│       ├── image_service.py # Download & validation
│       └── gemini_client.py # Gemini AI integration logic
├── prompt/
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
venv\Scripts\activate
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

### Endpoints

**`POST /analyze-image`**

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

**`GET /metrics`** - Usage statistics

**`GET /`** - Health check

**`GET /docs`** - Interactive Swagger Documentation

---

## Configuration

### Environment variables (`.env`):
- `GEMINI_API_KEY`: **Required** for AI generation
- `REDIS_URL`: (Optional) Connection string for Redis

### Constants (`app/config.py`):
- `MAX_IMAGE_SIZE_BYTES`: 5MB limit
- `CACHE_TTL_SECONDS`: 7 days
- `MAX_CONCURRENT_AI_CALLS`: 5 parallel requests (Semaphore)

---

## Logging

**Dual logging system:** Console (Colored) + File (Structured)

**File Output:** `logs/accessable_2026-01-xx.log`

```
[2026-01-26 14:23:45] [INFO] Downloading image from: https://example.com/photo.jpg
[2026-01-26 14:23:46] [SUCCESS] Image downloaded: 800x600px, 145.2KB
[2026-01-26 14:23:48] [SUCCESS] AI response received in 1.85s
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

## Future Roadmap

- [ ] Rate limiting (slowapi)
- [ ] Module 2: Audio captioning
- [ ] Module 3: Voice navigation
- [ ] PostgreSQL analytics

---

## Team

**Tooba Fazil** - Backend Engineering & AI Integration  
**Fatima Abu Bakar** - Frontend Development & UX

---

**Questions?** faziltooba95@gmail.com | [API Docs](https://accessable-fyp.onrender.com/docs)