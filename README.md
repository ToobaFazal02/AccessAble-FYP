# AccessAble: Unified Web Accessibility Ecosystem

![Status](https://img.shields.io/badge/Status-Development-yellow)
![Version](https://img.shields.io/badge/Version-1.0.0-blue)
![Tech](https://img.shields.io/badge/Stack-FastAPI_|_Chrome_Manifest_V3-green)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## Abstract

**AccessAble** is a browser-based accessibility support system developed as a Final Year Project (FYP) to reduce common web accessibility barriers faced by users with visual, hearing, and motor impairments. Existing accessibility tools often address only a single disability or rely on heavy third-party overlays. This project proposes a **unified, lightweight, and AI-assisted approach** that operates directly within the browser without modifying the original website source code.

The system follows a **client–server architecture**, where a Chrome Extension handles real-time webpage interaction and a Python-based backend performs AI-driven processing. The design focuses on modularity, privacy, and academic feasibility, allowing each accessibility feature to be developed, tested, and evaluated independently within the scope of a student capstone project.

---

## System Architecture

AccessAble is implemented using a **decoupled architecture** to ensure that frontend and backend components can be developed and tested independently.

### 1. Chrome Extension (Client Layer)

The Chrome Extension is built using **Manifest V3** and is responsible for detecting accessibility issues and modifying the webpage dynamically at runtime.

Key responsibilities include:

* Scanning web pages for accessibility violations (e.g., missing `alt` attributes).
* Communicating with the backend via REST APIs.
* Injecting accessibility enhancements into the DOM without altering the original website source.

To improve performance and reduce unnecessary API calls, a **client-side caching mechanism** is implemented using `chrome.storage.local`. If the same image or content is encountered again, previously generated accessibility data can be reused instantly. This design choice was made to keep the system lightweight and responsive within academic constraints.

---

### 2. Backend Intelligence Layer (FastAPI)

The backend is implemented using **FastAPI**, chosen for its simplicity, performance, and native support for asynchronous processing.

Backend responsibilities include:

* Validating and sanitizing requests received from the Chrome Extension.
* Acting as a secure proxy for AI services, ensuring that API keys remain hidden from the client.
* Processing accessibility-related tasks using AI models and returning structured responses.

The backend is designed to be **stateless**, making it easier to test, scale, and reason about during evaluation.

---

## Core Modules

The system is divided into three modules to support different categories of accessibility needs. Each module is designed and evaluated independently.

---

### 🟢 Module 1: Image Accessibility (Visual Assistance)

**Status:** Active Development

**Problem:**
Images without meaningful `alt` text are inaccessible to screen readers, creating a major barrier for visually impaired users.

**Solution:**

* The extension detects images that are missing `alt` attributes or contain empty values.
* The image URL is sent to the backend via a REST API.
* An AI-based image analysis service generates a textual description.
* The generated description is injected into the DOM using the `alt` attribute or `aria-label`.
* Optional TTS Demo Mode: For demonstration purposes, the extension can read the generated description aloud using the browser's Web Speech API if no screen reader is present. This ensures the feature can be demoed even on systems without NVDA/JAWS.
* Smart Caching: Each processed image is assigned a unique hash and stored in the browser's local storage. If the same image is encountered again, the cached description is reused, reducing latency and API calls, and improving overall browsing performance.

---

### 🟡 Module 2: Video Captioning Support (Auditory Assistance)

**Status:** Architecture Defined (Planned Phase)

**Problem:**
Video content without captions is inaccessible to users with hearing impairments.

**Proposed Solution:**

* Audio streams from video content will be captured using browser APIs.
* Audio data will be sent to the backend for speech-to-text processing.
* Generated captions will be displayed as an overlay on the video player.

This module is planned for later phases to maintain a manageable scope for the FYP.

---

### 🔵 Module 3: Voice-Based Navigation (Motor Assistance)

**Status:** Architecture Defined (Planned Phase)

**Problem:**
Users with motor impairments may struggle with traditional mouse and keyboard interactions.

**Proposed Solution:**

* Voice commands will be captured using browser-supported speech APIs.
* The backend will process commands using natural language processing techniques.
* Valid navigation or interaction actions will be executed on the webpage.

---

## 🛠 Technology Stack

| Component        | Technology                       | Purpose                          |
| ---------------- | -------------------------------- | -------------------------------- |
| Frontend         | HTML, CSS, JavaScript            | DOM manipulation and UI logic    |
| Browser Platform | Chrome Extension (Manifest V3)   | Web integration                  |
| Backend          | Python, FastAPI                  | API server and business logic    |
| Server           | Uvicorn                          | ASGI server                      |
| AI Services      | Google Vision / OpenAI (planned) | Image and speech processing      |
| Storage          | Chrome Local Storage             | Client-side caching              |
| Version Control  | Git & GitHub                     | Source control and collaboration |

---

## Installation & Setup

### Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

The backend server runs at: `http://127.0.0.1:8000`

---

### Chrome Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer Mode**.
3. Click **Load Unpacked** and select the `extension` folder.
4. Pin the extension to the toolbar.

---

## 🗺 Development Roadmap

The project is developed in phases to ensure academic feasibility and incremental evaluation:

* **Phase 1:** Core architecture, backend setup, and image accessibility module.
* **Phase 2:** Speech-to-text integration for video captioning.
* **Phase 3:** Voice-based navigation and interaction support.
* **Phase 4:** Deployment and final evaluation.

---

## Project Roles

* **Backend & Architecture:** Tooba
* **Frontend & Extension Development:** Fatima

---

## License

This project is licensed under the MIT License.
