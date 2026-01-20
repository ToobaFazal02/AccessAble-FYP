// ============================================================================
// MAIN CONTENT SCRIPT - Orchestrates all modules
// Responsibilities: Screen reader, widget UI, module coordination
// ============================================================================

// ============================================================================
// STATE - Use local variables for runtime state (NOT chrome.storage.sync)
// ============================================================================

let isReading = false;
let isPaused = false;
let isImageMode = false;
let currentIndex = 0;
let readableElements = [];
let imageClickHandler = null;
let widget = null;

let speechSettings = {
  speed: 1,
  pitch: 1,
  volume: 1
};

console.log('[Content] Script loaded');

// ============================================================================
// INITIALIZATION
// ============================================================================

// Load user preferences (these are actual persistent settings)
chrome.storage.sync.get(['speed', 'pitch', 'volume'], (data) => {
  if (data.speed) speechSettings.speed = data.speed;
  if (data.pitch) speechSettings.pitch = data.pitch;
  if (data.volume !== undefined) speechSettings.volume = data.volume;
  console.log('[Content] Settings loaded:', speechSettings);
});

// Initialize Module 1: Image Accessibility Analysis
document.addEventListener('DOMContentLoaded', () => {
  if (window.AccessAbleImageModule) {
    window.AccessAbleImageModule.init();
  }
});

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    toggleReader();
  } else if (e.altKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    pauseResume();
  } else if (e.altKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    readNext();
  } else if (e.altKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    readPrevious();
  }
});

// ============================================================================
// MESSAGE HANDLER - Commands from background/popup
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Content] Message received:', request);
  
  switch (request.action) {
    case 'ping':
      sendResponse({ status: 'ready' });
      break;
    
    case 'toggleReader':
      toggleReader();
      sendResponse({ isReading });
      break;
    
    case 'pauseResume':
      pauseResume();
      sendResponse({ isPaused });
      break;
    
    case 'readNext':
      readNext();
      sendResponse({ success: true });
      break;
    
    case 'readPrevious':
      readPrevious();
      sendResponse({ success: true });
      break;
    
    case 'updateSetting':
      speechSettings[request.setting] = request.value;
      sendResponse({ success: true });
      break;
    
    case 'toggleImageMode':
      toggleImageMode();
      sendResponse({ isImageMode });
      break;
    
    default:
      if (request.command) {
        handleCommand(request.command);
        sendResponse({ success: true });
      }
  }
  
  return true;
});

function handleCommand(command) {
  switch (command) {
    case 'toggle-reader':
      toggleReader();
      break;
    case 'read-next':
      readNext();
      break;
    case 'read-previous':
      readPrevious();
      break;
    case 'pause-resume':
      pauseResume();
      break;
  }
}

// ============================================================================
// IMAGE MODE (Interactive Click-to-Analyze)
// NOTE: This is separate from Module 1's automatic analysis
// ============================================================================

// ============================================================================
// IMAGE MODE (UPDATED: Fully Automatic)
// ============================================================================

function toggleImageMode() {
  isImageMode = !isImageMode;
  
  if (isImageMode) {
    if (window.AccessAbleImageModule) {
      window.AccessAbleImageModule.init(); // Start Auto Scan & Observer
      speak("Automatic Image Analysis enabled. Scanning page for inaccessible images.");
    } else {
      console.error("Image Module not loaded!");
    }
  } else {
    // Stop Automatic Module
    if (window.AccessAbleImageModule) {
      window.AccessAbleImageModule.stop(); // Remove Red Borders & Observer
      speak("Image Analysis disabled.");
    }
  }
}

// ============================================================================
// SCREEN READER FUNCTIONS (Your existing logic, preserved)
// ============================================================================

function toggleReader() {
  if (isReading) {
    isReading = false;
    stopReading();
    removeWidget();
  } else {
    isReading = true;
    isPaused = false;
    createWidget();
    startReading();
  }
}

function pauseResume() {
  if (!isReading) {
    speak("Screen reader is not active. Press Alt+R to start.");
    return;
  }
  
  isPaused = !isPaused;
  
  if (isPaused) {
    window.speechSynthesis.pause();
    updateWidgetStatus('Paused');
  } else {
    window.speechSynthesis.resume();
    updateWidgetStatus('Reading...');
  }
  
  updateWidgetPauseButton();
}

function startReading() {
  readableElements = getReadableElements();
  currentIndex = 0;
  updateWidgetStatus('Reading...');
  
  if (readableElements.length > 0) {
    readElement(readableElements[currentIndex]);
  } else {
    speak("No readable content found on this page.");
    isReading = false;
    removeWidget();
  }
}

function stopReading() {
  window.speechSynthesis.cancel();
  removeHighlight();
  currentIndex = 0;
  isPaused = false;
}

function readNext() {
  if (!isReading) {
    speak("Screen reader is not active.");
    return;
  }
  
  if (currentIndex < readableElements.length - 1) {
    window.speechSynthesis.cancel();
    currentIndex++;
    isPaused = false;
    updateWidgetPauseButton();
    readElement(readableElements[currentIndex]);
  } else {
    speak("This is the last element.");
  }
}

function readPrevious() {
  if (!isReading) {
    speak("Screen reader is not active.");
    return;
  }
  
  if (currentIndex > 0) {
    window.speechSynthesis.cancel();
    currentIndex--;
    isPaused = false;
    updateWidgetPauseButton();
    readElement(readableElements[currentIndex]);
  } else {
    speak("This is the first element.");
  }
}

// ============================================================================
// DOM SCANNING (Your existing logic)
// ============================================================================

function getReadableElements() {
  const mainContent = findMainContent();
  return mainContent 
    ? getElementsFromContainer(mainContent) 
    : getElementsFromContainer(document.body);
}

function findMainContent() {
  const mainSelectors = [
    'main', '[role="main"]', '#content', '#main-content',
    '.main-content', 'article', '#mw-content-text', '.mw-parser-output'
  ];
  
  for (const selector of mainSelectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  
  return null;
}

function getElementsFromContainer(container) {
  const allElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, blockquote');
  const skipSelectors = [
    'nav', 'header:not(article header)', 'footer:not(article footer)',
    '.navigation', '.nav', '.menu', '.sidebar', '.ad', '#toc',
    '[role="navigation"]', '[role="banner"]', '.mw-editsection'
  ];
  
  const readableElements = [];
  
  Array.from(allElements).forEach(el => {
    const text = el.innerText?.trim();
    if (!text || !isVisible(el) || isInSkipArea(el, skipSelectors)) return;
    
    const tagName = el.tagName.toLowerCase();
    
    if (tagName.match(/^h[1-6]$/) && !isNavigationElement(el, text)) {
      readableElements.push(el);
    } else if ((tagName === 'p' || tagName === 'blockquote') && 
               (text.length >= 10 || !isNavigationElement(el, text))) {
      readableElements.push(el);
    }
  });
  
  readableElements.sort((a, b) => {
    const posA = a.getBoundingClientRect().top + window.scrollY;
    const posB = b.getBoundingClientRect().top + window.scrollY;
    return posA - posB;
  });
  
  return readableElements;
}

function isInSkipArea(element, skipSelectors) {
  return skipSelectors.some(selector => element.closest(selector));
}

function isNavigationElement(element, text) {
  const navKeywords = [
    'log in', 'sign in', 'sign up', 'register', 'edit', 'history',
    'main page', 'contents', 'donate', 'help'
  ];
  
  const lowerText = text.toLowerCase().trim();
  return navKeywords.some(keyword => 
    lowerText === keyword || (text.length < 20 && lowerText.includes(keyword))
  );
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && 
         style.visibility !== 'hidden' && 
         style.opacity !== '0' &&
         element.offsetWidth > 0 &&
         element.offsetHeight > 0;
}

// ============================================================================
// READING LOGIC
// ============================================================================

function readElement(element) {
  if (!element || !isReading) return;
  
  removeHighlight();
  highlightElement(element);
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  const text = getElementText(element);
  updateWidgetStatus(`Reading: ${element.tagName}`);
  
  speak(text, () => {
    if (isReading && currentIndex < readableElements.length - 1) {
      currentIndex++;
      readElement(readableElements[currentIndex]);
    } else {
      isReading = false;
      removeHighlight();
      updateWidgetStatus('Complete');
      speak("Reading complete.");
      setTimeout(() => removeWidget(), 2000);
    }
  });
}

function getElementText(element) {
  const tagName = element.tagName.toLowerCase();
  let text = element.innerText.trim()
    .replace(/\[\d+\]/g, '')
    .replace(/\[edit\]/gi, '')
    .replace(/\s+/g, ' ');
  
  if (tagName === 'h1') return `Title: ${text}`;
  if (tagName === 'h2') return `Section: ${text}`;
  if (tagName.match(/^h[3-6]$/)) return `Subsection: ${text}`;
  if (tagName === 'blockquote') return `Quote: ${text}`;
  return text;
}

function speak(text, onEnd) {
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = speechSettings.speed;
  utterance.pitch = speechSettings.pitch;
  utterance.volume = speechSettings.volume;
  
  if (onEnd) utterance.onend = onEnd;
  
  window.speechSynthesis.speak(utterance);
}

function highlightElement(element) {
  element.classList.add('accessible-highlight');
  element.setAttribute('data-accessible-reading', 'true');
}

function removeHighlight() {
  document.querySelectorAll('[data-accessible-reading="true"]').forEach(el => {
    el.classList.remove('accessible-highlight');
    el.removeAttribute('data-accessible-reading');
  });
}

// ============================================================================
// WIDGET UI (Preserved from your original)
// ============================================================================

function createWidget() {
  if (widget) return;
  
  widget = document.createElement('div');
  widget.id = 'accessible-widget';
  widget.innerHTML = `
    <div id="accessible-widget-header">
      <span id="accessible-widget-title">AccessAble</span>
      <button id="accessible-widget-close" aria-label="Close">×</button>
    </div>
    <div id="accessible-widget-status">Ready</div>
    <div id="accessible-widget-controls">
      <button class="accessible-widget-btn" id="widget-pause">Pause</button>
      <button class="accessible-widget-btn" id="widget-prev">Previous</button>
      <button class="accessible-widget-btn" id="widget-next">Next</button>
    </div>
    <div id="accessible-widget-shortcuts">
      <div id="accessible-widget-shortcuts-grid">
        <div class="shortcut-item">
          <span class="accessible-widget-kbd">Alt+R</span>
          <span class="shortcut-label">Toggle</span>
        </div>
        <div class="shortcut-item">
          <span class="accessible-widget-kbd">Alt+S</span>
          <span class="shortcut-label">Pause</span>
        </div>
        <div class="shortcut-item">
          <span class="accessible-widget-kbd">Alt+N</span>
          <span class="shortcut-label">Next</span>
        </div>
        <div class="shortcut-item">
          <span class="accessible-widget-kbd">Alt+P</span>
          <span class="shortcut-label">Prev</span>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(widget);
  attachWidgetListeners();
}

function attachWidgetListeners() {
  document.getElementById('accessible-widget-close')?.addEventListener('click', () => {
    isReading = false;
    stopReading();
    removeWidget();
  });
  
  document.getElementById('widget-pause')?.addEventListener('click', pauseResume);
  document.getElementById('widget-prev')?.addEventListener('click', readPrevious);
  document.getElementById('widget-next')?.addEventListener('click', readNext);
}

function removeWidget() {
  widget?.remove();
  widget = null;
}

function updateWidgetStatus(status) {
  const statusEl = document.getElementById('accessible-widget-status');
  if (statusEl) statusEl.textContent = status;
}

function updateWidgetPauseButton() {
  const pauseBtn = document.getElementById('widget-pause');
  if (pauseBtn) {
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    pauseBtn.classList.toggle('active', isPaused);
  }
}