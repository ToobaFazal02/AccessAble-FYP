# AccessAble – AI Powered Web Accessibility

![Status](https://img.shields.io/badge/Status-Active-green)
![Version](https://img.shields.io/badge/Version-1.1.0-blue)
![Tech](https://img.shields.io/badge/Stack-FastAPI_|_Chrome_Manifest_V3-3776AB)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

AccessAble is a Manifest V3 Chrome Extension paired with a 
FastAPI backend that improves web accessibility in real time 
— without requiring website owners to change their code.

---

## What It Does

AccessAble detects accessibility gaps on any webpage and 
applies assistive behaviors automatically using AI-backed 
services.

| Module | Feature | Target Users |
|--------|---------|--------------|
| Module 1 | AI Image Descriptions | Blind / Low Vision |
| Module 2 | Video Captions | Deaf / Hard of Hearing |
| Module 3 | Keyboard Accessibility | Motor Impaired |
| Module 4 | Screen Reader | Blind / Low Vision |

---

## Current Status (April 2026)

- **Module 1** ✅ Active — AI alt-text generation via 
  Google Cloud Vision, image scanning, local caching
- **Module 2** ⚠️ Phase 1 — Client-first caption 
  architecture with YouTube Transcript API and 
  HTML5 track adapter
- **Module 3** ✅ Active — Skip link, focus indicators, 
  ARIA landmarks, Escape trap fix, keyboard shortcuts
- **Module 4** ✅ Active — Screen reader with DOM 
  navigation, TTS via Web Speech API

---

## Architecture Overview

AccessAble follows a **client-first architecture** with 
hybrid backend support:

```
Extension (primary runtime)
├── DOM detection and injection
├── Caption rendering and cue sync
├── User settings persistence
└── SPA lifecycle handling

Backend (support service)
├── AI image analysis (Module 1)
├── Caption metadata extraction (Module 2)
└── Keyboard analytics (Module 3)
```

---

## Repository Structure

```
AccessAble-FYP/
├── backend/
│   └── app/
│       ├── main.py
│       ├── module1_image/
│       ├── module2_audio/
│       └── module3_keyboard/
├── extension/
│   ├── manifest.json
│   ├── shared/
│   │   └── contracts.js
│   ├── background/
│   │   └── background-wrapper.js
│   ├── content/
│   │   ├── content.js
│   │   ├── content.css
│   │   └── modules/
│   │       ├── module1-image.js
│   │       ├── module2-captions.js
│   │       └── module3-keyboard.js
│   ├── module2/
│   │   ├── adapters/
│   │   ├── engine/
│   │   ├── renderer/
│   │   ├── state/
│   │   └── index.js
│   └── popup/
│       ├── popup.html
│       ├── popup.css
│       └── popup.js
└── tests/
    └── module2/
```

---

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## Installation & Setup

Base URL (Production): 
`https://accessable-fyp.onrender.com`

API Docs (Swagger): 
`https://accessable-fyp.onrender.com/docs`

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/captions/extract` | Extract video captions |
| GET | `/api/v1/captions/health` | Caption service health |
| POST | `/api/v1/images/analyze` | AI image description |
| POST | `/api/v1/keyboard/track` | Keyboard fix telemetry |

---

## WCAG Compliance

**Target Level: WCAG 2.1 AA**

| Fix Applied | WCAG Criterion |
|-------------|----------------|
| Skip Link | 2.4.1 Bypass Blocks |
| Focus Indicators | 2.4.7 Focus Visible |
| ARIA Landmarks | 1.3.1 Info and Relationships |
| Escape Trap Fix | 2.1.2 No Keyboard Trap |
| AI Alt Text | 1.1.1 Non-text Content |
| Video Captions | 1.2.2 Captions (Prerecorded) |

---

## Installation (Development)

### Backend
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Extension
1. Open `chrome://extensions/`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Pin AccessAble and test on any page

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Extension | JavaScript, HTML5, CSS3, Manifest V3 |
| Backend | Python, FastAPI, Uvicorn |
| Cache | Redis + Chrome Storage API |
| AI Services | Google Cloud Vision, Gemini API |
| Speech | Web Speech API (TTS + STT) |
| Deployment | Render Cloud |

---

## Team

**Tooba Fazal**
**Fatima Abu Bakar**  

---



