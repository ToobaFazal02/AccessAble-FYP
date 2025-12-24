# AccessAble: Unified Web Accessibility Ecosystem

![Status](https://img.shields.io/badge/Status-Active-green)
![Version](https://img.shields.io/badge/Version-1.0.1-blue)
![Tech](https://img.shields.io/badge/Stack-FastAPI_|_Chrome_Manifest_V3-3776AB)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## Abstract

**AccessAble** is a unified, browser-based accessibility ecosystem designed to dismantle digital barriers for users with visual, hearing, motor, and cognitive impairments. While traditional accessibility tools often address single disabilities or rely on intrusive overlays, AccessAble introduces a **multimodal, AI-assisted approach** that operates entirely at the user level via a Chrome Extension.

The system leverages **Generative AI (Gemini)** and **Computer Vision** to interpret web content in real-time, dynamically injecting accessibility metadata (such as alt-text and captions) without requiring modifications to the original website source code. Built on a privacy-first **Client–Server architecture**, AccessAble ensures compliance with **WCAG 2.1** and emerging principles, providing a seamless, inclusive browsing experience.

---

## Live Deployment

The backend infrastructure requires high-availability AI processing. It is currently deployed and active on **Render Cloud**.

- **Backend API Endpoint:** `https://accessable-fyp.onrender.com`
- **API Documentation (Swagger UI):** `https://accessable-fyp.onrender.com/docs`
- **Uptime Status:** Active (99.9%)

The Chrome Extension communicates securely with this deployed endpoint to fetch AI-generated descriptions in real-time.

---

## System Architecture

AccessAble utilizes a **decoupled architecture** to ensure separation of concerns between browser interactions and computationally intensive AI processing.

### 1. Chrome Extension (Client Layer)
Built on **Manifest V3**, the extension acts as the user interface and DOM manipulator.
* **Runtime Analysis:** Scans the DOM for accessibility violations (e.g., missing `alt` attributes, unlabelled buttons).
* **Dynamic Injection:** Inserts AI-generated descriptions and captions directly into the HTML structure.
* **Privacy-First Caching:** Implements a **local caching mechanism** (`chrome.storage.local`) using content hashing. If a resource (like an image) is encountered again, the cached description is retrieved instantly, reducing API latency and preventing data redundancy.

### 2. Backend Intelligence Layer (FastAPI)
A high-performance, asynchronous Python backend acting as the orchestration layer.
* **Secure Proxy:** Manages API keys and authentication server-side, ensuring credentials are never exposed to the client browser.
* **AI Orchestration:** Routes requests to the appropriate AI models (Vision, NLP, or Speech-to-Text) based on the input type.
* **Stateless Design:** Ensures scalability and reliability for real-time requests.

---

## Core Ecosystem Modules

AccessAble covers the full spectrum of web accessibility needs through four specialized, independent modules.

### 🟢 Module 1: Visual Assistance (AI Vision)
*Target Audience: Blind and Low-Vision Users*

* **Context-Aware Image Analysis:** Detects images missing `alt` attributes and generates descriptive, context-aware text using Gemini API.
* **OCR & Scene Understanding:** Extracts embedded text from images and describes complex scenes (e.g., charts, natural scenery).
* **TTS Integration:** Provides optional Text-to-Speech feedback via the Web Speech API for users without a dedicated screen reader.

### 🟡 Module 2: Auditory Assistance (Live Captioning)
*Target Audience: Deaf and Hard-of-Hearing Users*

* **Real-Time Captioning:** Captures system audio from videos or audio streams within the active tab.
* **Speech-to-Text Processing:** Converts audio to text in real-time and displays it as a non-intrusive, customizable overlay on the video player.

### 🔵 Module 3: Motor Assistance (Voice Navigation)
*Target Audience: Users with Motor Impairments*

* **Voice Command Interface:** Allows users to navigate websites using voice commands (e.g., "Scroll Down," "Click Login," "Go Back").
* **Hands-Free Interaction:** Maps spoken commands to DOM events, enabling full browser control without a mouse or keyboard.

### 🟣 Module 4: Cognitive Assistance (Focus & Clarity)
*Target Audience: Users with ADHD, Dyslexia, and Cognitive Disabilities*

* **Focus Mode:** Automatically identifies and hides distracting elements like ads, carousels, and sidebars to reduce cognitive load.
* **Content Simplification:** Uses LLMs to summarize dense articles and rewrite complex text into "Plain English" for better comprehension.


### Privacy & Ethical Considerations
- No user data is stored permanently
- Images are processed temporarily for inference only
- API keys are secured via server-side environment variables
* AI Engine: Google Gemini API (via secure API key) used for context-aware image descriptions and text simplification.

---

## Technology Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | HTML5, CSS3, JavaScript | DOM Manipulation, UI, Manifest V3 |
| **Backend** | Python, FastAPI | API Server, Request Validation |
| **Server** | Uvicorn (Render) | Cloud Hosting & Deployment |
| **AI Engine** | Google Gemini API | Multimodal Analysis (Vision & Text) |
| **Speech** | Web Speech API | Voice Recognition & Synthesis |
| **Storage** | Chrome Local Storage | Client-Side Optimization |
| **Version Control** | Git & GitHub | CI/CD and Source Management |

---

## Installation & Setup

### Backend Setup (Local Development)
To run the server locally for development purposes:
```bash
cd backend
python -m venv venv
# Activate virtual environment (Windows: venv\Scripts\activate | Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
uvicorn main:app --reload


### Chrome Extension Setup
1. Open Chrome → `chrome://extensions/`
2. Enable Developer Mode
3. Load Unpacked → select `extension` folder
4. Pin to toolbar for testing
5. The extension fetches AI-generated alt-text in real-time from the Render backend


## Project Team & Roles

* **Tooba Fazil:** System Architecture, Backend Engineering (FastAPI), & AI Model Integration.
* **Fatima Abu Bakar:** Frontend Development (Chrome Extension), UI/UX Design, & DOM Manipulation Logic.

---

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.