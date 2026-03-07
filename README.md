# AccessAble: Unified Web Accessibility Ecosystem

![Status](https://img.shields.io/badge/Status-Active-green)
![Version](https://img.shields.io/badge/Version-1.1.0-blue)
![Tech](https://img.shields.io/badge/Stack-FastAPI_|_Chrome_Manifest_V3-3776AB)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## Abstract

**AccessAble** is a browser-based accessibility ecosystem designed to reduce digital barriers for users with visual, hearing, motor, and cognitive impairments. Instead of relying on intrusive overlays or requiring site owners to modify source code, AccessAble uses a **Chrome Extension + API architecture** to improve accessibility at the user layer.

The platform currently delivers production-ready support for image accessibility (Module 1), with architectural groundwork for keyboard enhancements (Module 3) and an actively redesigned Module 2 for robust caption accessibility.

---

## Live Deployment

The backend is deployed on Render Cloud:

- **Backend API Endpoint:** `https://accessable-fyp.onrender.com`
- **API Documentation (Swagger UI):** `https://accessable-fyp.onrender.com/docs`

> Note: Module 2 is being migrated from a server-first transcript extraction design to a client-first hybrid design to avoid cloud-origin transcript blocking and improve user-facing reliability.

---

## System Architecture

AccessAble uses a decoupled architecture with clear separation of concerns.

### 1) Chrome Extension (Client Layer)
Built on Manifest V3. Responsible for DOM interaction, user settings, and in-page accessibility UX.

Current behavior in code:
- Module 1 image analysis orchestration and DOM injection
- Screen reader controls and accessibility widget
- Content/background messaging and local caching

### 2) Backend API (FastAPI Layer)
Backend orchestration and optional AI processing:
- Module 1 image analysis endpoint(s)
- Module 2 caption metadata extraction endpoint (`/api/v1/captions/extract`) in current implementation
- Module 3 keyboard tracking/analytics endpoints
- Cache/metrics and operational observability

---

## Current Code Status (As Implemented)

### ✅ Module 1: Visual Assistance (Implemented)
- Detects inaccessible images and requests AI descriptions
- Injects generated `alt` text in-page
- Uses extension-side caching and backend orchestration

### ⚠️ Module 2: Audio Captioning (Implemented Baseline + Redesign in Progress)
Current implementation:
- Backend-first caption metadata extraction
- YouTube via `youtube-transcript-api`
- Other platforms via `yt-dlp` fallback

Known production issue:
- Cloud-origin requests (Render) may be treated as bot traffic by video platforms (especially YouTube), causing caption extraction failures.

Current UI behavior note:
- Seeing **"Captions unavailable for this video"** after scan does **not** automatically mean Module 2 is broken.
- It can happen when the target video has no available caption track, blocks extraction, or returns incompatible track metadata.
- Treat this as a fallback state and verify with the testing checklist below before concluding a regression.

### ✅/🟡 Module 3: Keyboard Accessibility (Backend available, extension integration evolving)
- Keyboard analytics/tracking routes available in backend
- Full end-user keyboard remediation workflow is being iterated

### 🟣 Module 4: Cognitive Assistance (Planned)
- Focus and simplification features are roadmap items

---

## Module 2 Redesign Decision (Architectural Direction)

### Decision
**Adopt Version 2: Client-first + Hybrid Backend Assist**.

### Why
- Solves transcript blocking caused by cloud IP origin reputation
- Reduces latency for caption rendering
- Improves resilience and UX for Deaf/Hard-of-Hearing users
- Keeps backend valuable for enhancement services (not as single point of failure)

### Ownership Model

#### Core (Frontend-owned)
Extension in user/browser context will:
1. Detect video source
2. Discover/fetch caption tracks where possible from client context
3. Parse and normalize cues
4. Render synchronized, accessible overlay
5. Cache normalized caption data locally

#### Assist (Backend-assisted, optional)
Backend will provide non-blocking enhancement features:
- Caption translation
- Simplification/plain-language conversion
- Summarization
- Optional analytics/quality telemetry (privacy-respecting, opt-in)

---

## Proposed Module 2 Architecture (Target)

### Layer A — Video Source Adapter (Extension)
Adapters:
- `YouTubeAdapter`
- `HTML5TrackAdapter`
- `SiteSpecificAdapter` (optional, phased)

Responsibilities:
- Identify source + video ID
- Discover tracks/languages
- Fetch caption payload in client context
- Output normalized cues: `{start, end, text, lang, isAuto}`

### Layer B — Caption Engine (Content Script)
Responsibilities:
- Sync cues with playback time
- Track selection + fallback policy
- Active cue lifecycle
- Event emission to renderer

Accessibility controls:
- Font size, contrast theme, background opacity, position
- Keyboard controls for toggle and timing offset
- Persist preferences in `chrome.storage.sync`

### Layer C — Accessible Overlay Renderer (DOM)
Responsibilities:
- High-contrast, non-intrusive captions
- Avoid collision with player controls
- Draggable/snappable caption box
- Optional dual-line and speaker label mode
- Respect zoom/reduced-motion constraints

### Layer D — Local Cache + Session State
Store normalized tracks in `chrome.storage.local`:
- `caption::<platform>::<videoId>::<lang>::<version>`

Include metadata + TTL for reuse and low-bandwidth reliability.

### Layer E — Backend Assist Layer (Optional)
Use backend for:
- Text enhancement APIs (translate/simplify/summarize)
- Offline/archival fallback flows (explicit user opt-in)
- Telemetry and quality scoring (privacy-safe)

---

## What Helps Users Most in Module 2

For Deaf and Hard-of-Hearing users, the highest impact priorities are:
1. Reliable caption availability
2. Readable and customizable overlay UI
3. Timing controls (`+/-` delay)
4. Language preference and fallback behavior
5. Optional plain-language mode
6. Low-latency rendering without mandatory cloud round-trips

---

## Migration Plan for Module 2

### Phase 1 (MVP Hardening)
- Build `YouTubeAdapter` + `HTML5TrackAdapter`
- Add overlay renderer + user settings
- Add local caption cache

### Phase 2 (Enhancement APIs)
- Add backend endpoints for simplify/translate/summarize
- Add preference-aware enhancement pipeline

### Phase 3 (Quality + Adaptive Fallback)
- Caption completeness and sync-confidence scoring
- Adaptive fallback policy per site/platform

---

## Module 2 Validation & QA (Required Before Sign-off)

Do not rely on a single manual click test. Run the checks below for every Module 2 increment.

### 1) Functional test matrix
- **YouTube video with human captions**: should discover tracks and render synchronized overlay.
- **YouTube video with auto captions only**: should fallback to auto track based on language policy.
- **Video with no captions**: should show a graceful unavailable state (no crash, no infinite spinner).
- **Generic HTML5 `<video><track>` page**: should parse WebVTT and render correctly.
- **SPA navigation case** (e.g., opening a new video without full page reload): lifecycle should rebind cleanly.

### 2) Accessibility (WCAG 2.2 AA target)
- Keyboard-only operation for caption toggle/settings.
- Visible focus indicators on controls.
- Caption overlay contrast and readability.
- Caption size/position customization remains usable at zoomed layouts.
- Motion/animation behavior remains comfortable for reduced-motion users.

### 3) Reliability & safety
- Verify timeout + retry behavior does not freeze UI.
- Confirm fallback adapter order works when first source fails.
- Confirm no unsafe HTML rendering (caption text must be injected safely).
- Confirm telemetry remains opt-in and off by default.

### 4) Regression checks
- Module 1 image flow still works.
- Existing popup toggles still work.
- No console error flood during long video playback.

Only move to Phase 2 backend-assist implementation after this checklist passes.

---

## Security & Engineering Principles

All new Module 2 implementation must follow:
- Least-privilege permission usage in extension
- Strict input validation at boundaries
- No hardcoded secrets in extension/frontend
- Defensive parsing and sanitization of caption payloads
- Timeout/retry/circuit-breaker patterns for network calls
- Privacy by default (opt-in telemetry only)
- Modular architecture with clear separation of concerns
- Typed contracts/interfaces between layers
- Production-safe logging (no sensitive payload dumps)

---

## Implementation Prompt (for Module 2 Coding Phase)

Use the prompt below when starting implementation:

```text
You are implementing AccessAble Module 2 (Audio Captioning) using a client-first + hybrid backend architecture.

Goals:
1) Move core caption retrieval/rendering logic to the Chrome extension.
2) Keep backend for optional text enhancement and analytics only.
3) Ensure production reliability, accessibility, and security.

Hard requirements:
- Follow clean architecture with modular separation:
  - adapters/ (source-specific retrieval)
  - engine/ (cue sync and track selection)
  - renderer/ (overlay UI)
  - state/ (settings + cache)
  - backend-assist/ (optional API integrations)
- No spaghetti code; small testable units with clear interfaces.
- Use secure coding practices:
  - validate/sanitize all external inputs
  - avoid unsafe HTML injection
  - enforce robust error handling and timeouts
  - never expose secrets in client code
- Keep user privacy first:
  - local-first processing
  - opt-in analytics only
  - minimal telemetry

Implementation scope (phase-by-phase):
Phase 1:
- Build YouTubeAdapter + HTML5TrackAdapter
- Normalize to cue schema: {start, end, text, lang, isAuto}
- Build caption engine for sync + fallback
- Build accessible overlay renderer with customization settings
- Persist settings in chrome.storage.sync
- Persist cues in chrome.storage.local with TTL

Phase 2:
- Add backend assist endpoints for simplify/translate/summarize
- Keep enhancement async and optional (non-blocking core captions)

Phase 3:
- Add quality scoring and adaptive fallback strategy

Quality constraints:
- Handle SPA navigation and dynamic video elements.
- Avoid performance regressions (debounce/throttle observers).
- Keep UX resilient when captions are unavailable.
- Write maintainable, documented, production-grade code.

Deliverables:
- Updated extension modules with clear folder structure
- Minimal, well-documented API contracts for backend assist
- Tests for parser/engine selection logic and key edge cases
- Short architecture notes describing data flow and fallback behavior
```

---

## Technology Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | JavaScript, HTML5, CSS3 | Manifest V3 extension, overlay UI, DOM logic |
| **Backend** | Python, FastAPI | API routes, validation, optional assist processing |
| **Cache** | Chrome Storage + Redis | Local user cache + backend cache |
| **Speech/AI** | Web APIs + Gemini (Module 1) | Accessibility assistance and AI enhancement |
| **Deployment** | Render + Uvicorn | Backend hosting |

---

## Installation (Development)

### Backend
```bash
cd backend
python -m venv venv
# Activate virtual environment
# Windows: venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Extension
1. Open `chrome://extensions/`
2. Enable Developer Mode
3. Load Unpacked → select `extension/`
4. Pin extension and test on supported pages

---

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE).
